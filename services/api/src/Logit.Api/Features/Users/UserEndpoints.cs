using Logit.Api.Features.Photos;
using System.Security.Claims;
using Logit.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Users;

public static class UserEndpoints
{
    public const int MaxNameLength = 60;
    // Generous: the editors stop at 160, older phones had no limit.
    public const int MaxBioLength = 500;

    public static void MapUserEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/users").WithTags("Users");

        group.MapGet("/me", GetMe).RequireAuthorization();
        group.MapPatch("/me", UpdateMe).RequireAuthorization();
        group.MapGet("/search", SearchUsers).RequireAuthorization();
        group.MapGet("/{username}", GetProfile);
    }

    private static async Task<IResult> GetMe(ClaimsPrincipal caller, AppDbContext db)
    {
        var userId = caller.GetUserId();
        var user = await db.Users.FindAsync(userId);
        if (user is null) return Results.NotFound();

        var followerCount = await db.Follows.CountAsync(f => f.FollowedId == userId);
        var followingCount = await db.Follows.CountAsync(f => f.FollowerId == userId);

        return Results.Ok(user.ToProfileDto(isSelf: true, followerCount, followingCount));
    }

    private static async Task<IResult> UpdateMe(
        [FromBody] UpdateProfileRequest req,
        ClaimsPrincipal caller,
        AppDbContext db,
        IPhotoStore photos,
        CancellationToken ct)
    {
        if (req.DisplayName is not null && req.DisplayName.Trim().Length is 0 or > MaxNameLength)
            return Results.BadRequest(new { error = $"Your name needs 1 to {MaxNameLength} characters." });
        if (req.Bio is not null && req.Bio.Trim().Length > MaxBioLength)
            return Results.BadRequest(new { error = $"Your bio can be up to {MaxBioLength} characters." });

        var userId = caller.GetUserId();
        var user = await db.Users.FindAsync(userId);
        if (user is null) return Results.NotFound();
        var shownBefore = PhotoEndpoints.RefsIn(user.AvatarUrl, user.PublicProfileJson);

        if (req.DisplayName is not null) user.DisplayName = req.DisplayName.Trim();
        if (req.Bio is not null) user.Bio = req.Bio.Trim();
        if (req.AvatarUrl is not null) user.AvatarUrl = req.AvatarUrl;
        if (req.PublicProfileJson is not null) user.PublicProfileJson = req.PublicProfileJson;
        if (req.OnboardingCompleted is not null) user.OnboardingCompleted = req.OnboardingCompleted.Value;
        user.UpdatedAt = DateTime.UtcNow;
        // A profile picture or progress photo that was replaced or removed is deleted.
        shownBefore.ExceptWith(PhotoEndpoints.RefsIn(user.AvatarUrl, user.PublicProfileJson));
        await PhotoEndpoints.DeleteOwnedAsync(db, photos, userId, shownBefore, ct);

        await db.SaveChangesAsync();

        var followerCount = await db.Follows.CountAsync(f => f.FollowedId == userId);
        var followingCount = await db.Follows.CountAsync(f => f.FollowerId == userId);

        return Results.Ok(user.ToProfileDto(isSelf: true, followerCount, followingCount));
    }

    private static async Task<IResult> SearchUsers(
        string? q,
        AppDbContext db,
        ClaimsPrincipal caller,
        int limit = 20)
    {
        if (string.IsNullOrWhiteSpace(q) || q.Trim().Length < 2)
            return Results.Ok(Array.Empty<object>());

        var callerId = caller.GetUserId();
        var search = q.Trim().ToLowerInvariant();

        var blocked = await db.Blocks
            .Where(b => b.BlockerId == callerId || b.BlockedId == callerId)
            .Select(b => b.BlockerId == callerId ? b.BlockedId : b.BlockerId)
            .ToListAsync();

        var results = await db.Users
            .Where(u => u.Id != callerId && !u.IsSample && !blocked.Contains(u.Id) && (
                u.Username.Contains(search) ||
                u.DisplayName.Contains(search)))
            .OrderBy(u => u.Username.StartsWith(search) ? 0 : 1)
            .ThenBy(u => u.Username)
            .Take(Math.Min(limit, 30))
            .Select(u => new
            {
                u.Id,
                u.Username,
                u.DisplayName,
                u.AvatarUrl,
                FollowerCount = u.Followers.Count,
                IsFollowing = u.Followers.Any(f => f.FollowerId == callerId),
                // A private account already asked shows "Requested", not "Follow" again.
                IsRequested = db.FollowRequests.Any(r => r.RequesterId == callerId && r.TargetId == u.Id),
                FollowsYou = db.Follows.Any(f => f.FollowerId == u.Id && f.FollowedId == callerId),
                u.IsPrivate,
            })
            .ToListAsync();

        return Results.Ok(results);
    }

    private static async Task<IResult> GetProfile(string username, AppDbContext db, ClaimsPrincipal caller)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Username == username.ToLowerInvariant() && !u.IsSample);
        if (user is null) return Results.NotFound();

        var followerCount = await db.Follows.CountAsync(f => f.FollowedId == user.Id);
        var followingCount = await db.Follows.CountAsync(f => f.FollowerId == user.Id);

        var isSelf = false;
        var isFollowing = false;
        var requested = false;
        var followsYou = false;
        List<string> followedBy = [];
        var followedByCount = 0;

        if (caller.Identity?.IsAuthenticated == true)
        {
            var callerId = caller.GetUserId();
            isSelf = callerId == user.Id;
            if (!isSelf)
            {
                if (await db.Blocks.AnyAsync(b =>
                        (b.BlockerId == callerId && b.BlockedId == user.Id) ||
                        (b.BlockerId == user.Id && b.BlockedId == callerId)))
                    return Results.NotFound();
                isFollowing = await db.Follows.AnyAsync(f => f.FollowerId == callerId && f.FollowedId == user.Id);
                requested = !isFollowing && await db.FollowRequests.AnyAsync(r => r.RequesterId == callerId && r.TargetId == user.Id);
                followsYou = await db.Follows.AnyAsync(f => f.FollowerId == user.Id && f.FollowedId == callerId);
                // "Followed by cara and 2 others you follow" (design canvas PR6).
                var mutual = db.Follows.Where(f => f.FollowedId == user.Id
                    && db.Follows.Any(g => g.FollowerId == callerId && g.FollowedId == f.FollowerId));
                followedByCount = await mutual.CountAsync();
                if (followedByCount > 0)
                    followedBy = await mutual.OrderByDescending(f => f.CreatedAt).Select(f => f.Follower.Username).Take(2).ToListAsync();
            }
        }

        var postCount = await db.Posts.CountAsync(p => p.AuthorId == user.Id && p.DeletedAt == null);
        return Results.Ok(user.ToProfileDto(isSelf, followerCount, followingCount, isFollowing, requested, followsYou)
            with { PostCount = postCount, FollowedBy = followedBy, FollowedByCount = followedByCount });
    }
}

public record UpdateProfileRequest(string? DisplayName, string? Bio, string? AvatarUrl, string? PublicProfileJson, bool? OnboardingCompleted);
