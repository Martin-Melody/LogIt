using System.Security.Claims;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Social;

/// The caller's social privacy settings, the follow requests waiting for them (private
/// accounts), and removing a follower.
public static class SocialSettingsEndpoints
{
    public static void MapSocialSettingsEndpoints(this IEndpointRouteBuilder app)
    {
        var me = app.MapGroup("/users/me").WithTags("Social").RequireAuthorization();
        me.MapGet("/social-settings", GetSettings);
        me.MapPut("/social-settings", UpdateSettings);
        me.MapGet("/follow-requests", GetFollowRequests);
        me.MapPost("/follow-requests/{username}/accept", Accept);
        me.MapDelete("/follow-requests/{username}", Decline);
        me.MapDelete("/followers/{username}", RemoveFollower);
    }

    public record SocialSettingsDto(
        bool IsPrivate, bool? ShowInDiscover, bool HideFromSuggestions, bool HidePeopleSuggestions,
        int PendingRequests, int NotInterestedCount);

    /// Every field optional: only the ones sent change. `ShowInDiscover` can't be cleared back
    /// to "not asked".
    public record UpdateSocialSettingsRequest(
        bool? IsPrivate, bool? ShowInDiscover, bool? HideFromSuggestions, bool? HidePeopleSuggestions);

    private static async Task<SocialSettingsDto> ToDtoAsync(AppDbContext db, User user) => new(
        user.IsPrivate, user.ShowInDiscover, user.HideFromSuggestions, user.HidePeopleSuggestions,
        await db.FollowRequests.CountAsync(r => r.TargetId == user.Id),
        await db.DiscoverDismissals.CountAsync(d => d.UserId == user.Id));

    private static async Task<IResult> GetSettings(ClaimsPrincipal caller, AppDbContext db)
    {
        var user = await db.Users.FindAsync(caller.GetUserId());
        return user is null ? Results.NotFound() : Results.Ok(await ToDtoAsync(db, user));
    }

    private static async Task<IResult> UpdateSettings(
        [FromBody] UpdateSocialSettingsRequest req, ClaimsPrincipal caller, AppDbContext db)
    {
        var user = await db.Users.FindAsync(caller.GetUserId());
        if (user is null) return Results.NotFound();

        if (req.IsPrivate is { } isPrivate && isPrivate != user.IsPrivate)
        {
            user.IsPrivate = isPrivate;
            // Going public: everyone who asked becomes a follower (what they asked for).
            if (!isPrivate)
            {
                var pending = await db.FollowRequests.Where(r => r.TargetId == user.Id).ToListAsync();
                foreach (var r in pending) await db.AcceptAsync(r);
                db.Notifications.RemoveRange(await db.Notifications
                    .Where(n => n.UserId == user.Id && n.Type == NotificationType.FollowRequest)
                    .ToListAsync());
            }
        }
        if (req.ShowInDiscover is { } show) user.ShowInDiscover = show;
        if (req.HideFromSuggestions is { } hideMe) user.HideFromSuggestions = hideMe;
        if (req.HidePeopleSuggestions is { } hidePeople) user.HidePeopleSuggestions = hidePeople;
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Results.Ok(await ToDtoAsync(db, user));
    }

    /// Newest first, each with one person the caller follows who also follows the requester
    /// (so "Mark · Conor follows" can be shown), plus how many more do.
    private static async Task<IResult> GetFollowRequests(ClaimsPrincipal caller, AppDbContext db)
    {
        var userId = caller.GetUserId();
        var requests = await db.FollowRequests
            .Include(r => r.Requester)
            .Where(r => r.TargetId == userId)
            .OrderByDescending(r => r.CreatedAt)
            .Take(200)
            .ToListAsync();

        var requesterIds = requests.Select(r => r.RequesterId).ToList();
        var mutuals = await db.Follows
            .Where(f => f.FollowerId == userId)
            .Join(db.Follows.Where(f2 => requesterIds.Contains(f2.FollowedId)),
                mine => mine.FollowedId, theirs => theirs.FollowerId,
                (mine, theirs) => new { RequesterId = theirs.FollowedId, Name = theirs.Follower.DisplayName })
            .ToListAsync();
        var byRequester = mutuals.GroupBy(m => m.RequesterId).ToDictionary(g => g.Key, g => g.ToList());

        return Results.Ok(requests.Select(r =>
        {
            byRequester.TryGetValue(r.RequesterId, out var m);
            return new
            {
                user = r.Requester.ToProfileDto(false),
                r.CreatedAt,
                followedBy = m?.FirstOrDefault()?.Name,
                followedByOthers = Math.Max(0, (m?.Count ?? 0) - 1),
            };
        }));
    }

    private static async Task<IResult> Accept(string username, ClaimsPrincipal caller, AppDbContext db)
    {
        var userId = caller.GetUserId();
        var request = await db.FollowRequests
            .FirstOrDefaultAsync(r => r.TargetId == userId && r.Requester.Username == username.ToLowerInvariant());
        if (request is null) return Results.NotFound();

        await db.AcceptAsync(request);
        await db.RemoveFollowRequestNotificationAsync(request.RequesterId, userId);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> Decline(string username, ClaimsPrincipal caller, AppDbContext db)
    {
        var userId = caller.GetUserId();
        var request = await db.FollowRequests
            .FirstOrDefaultAsync(r => r.TargetId == userId && r.Requester.Username == username.ToLowerInvariant());
        if (request is null) return Results.NotFound();

        db.FollowRequests.Remove(request);
        await db.RemoveFollowRequestNotificationAsync(request.RequesterId, userId);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    /// Stops someone following you without blocking them. They aren't told; they can ask
    /// again (and on a private account you'd see the request).
    private static async Task<IResult> RemoveFollower(string username, ClaimsPrincipal caller, AppDbContext db)
    {
        var userId = caller.GetUserId();
        var follow = await db.Follows
            .FirstOrDefaultAsync(f => f.FollowedId == userId && f.Follower.Username == username.ToLowerInvariant());
        if (follow is null) return Results.NotFound();

        db.Follows.Remove(follow);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }
}
