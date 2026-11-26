using System.Security.Claims;
using Logit.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Social;

public static class NotificationEndpoints
{
    public static void MapNotificationEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/notifications").WithTags("Notifications").RequireAuthorization();
        g.MapGet("/", GetNotifications);
        g.MapGet("/unread-count", GetUnreadCount);
        g.MapPost("/read", MarkRead);
    }

    private static async Task<IResult> GetNotifications(
        ClaimsPrincipal caller,
        AppDbContext db,
        [FromQuery] string? cursor = null,
        [FromQuery] int limit = 30)
    {
        var userId = caller.GetUserId();
        limit = Math.Clamp(limit, 1, 50);
        var before = SocialQueryHelpers.DecodeCursor(cursor);

        var query = db.Notifications.Where(n => n.UserId == userId);
        if (before is not null)
            query = query.Where(n => n.CreatedAt < before);

        var rows = await query
            .OrderByDescending(n => n.CreatedAt)
            .Take(limit + 1)
            .Select(n => new
            {
                n.Id,
                Type = n.Type.ToString(),
                n.CreatedAt,
                n.ReadAt,
                Actor = new { n.Actor.Id, n.Actor.Username, n.Actor.DisplayName, n.Actor.AvatarUrl, n.Actor.IsPrivate },
                n.PostId,
                n.CommentId,
                Group = n.Group == null ? null : new { n.Group.Id, n.Group.Name },
            })
            .ToListAsync();

        string? nextCursor = null;
        if (rows.Count > limit)
        {
            nextCursor = SocialQueryHelpers.EncodeCursor(rows[limit - 1].CreatedAt);
            rows = rows.Take(limit).ToList();
        }

        // Post-body snippets for Like/Comment rows, fetched separately (keeps the
        // paged query simple for the SQLite provider).
        var postIds = rows.Where(r => r.PostId != null).Select(r => r.PostId!.Value).Distinct().ToList();
        var bodies = postIds.Count == 0
            ? new Dictionary<Guid, string?>()
            : await db.Posts.Where(p => postIds.Contains(p.Id))
                .ToDictionaryAsync(p => p.Id, p => p.Body);

        // The caller's follow status for each actor, so a "Follow back" button shows the truth.
        var actorIds = rows.Select(r => r.Actor.Id).Distinct().ToList();
        var following = await db.Follows.Where(f => f.FollowerId == userId && actorIds.Contains(f.FollowedId))
            .Select(f => f.FollowedId).ToListAsync();
        var requested = await db.FollowRequests.Where(f => f.RequesterId == userId && actorIds.Contains(f.TargetId))
            .Select(f => f.TargetId).ToListAsync();

        var notifications = rows.Select(r => new
        {
            r.Id, r.Type, r.CreatedAt, r.ReadAt, r.PostId, r.CommentId, r.Group,
            Actor = new
            {
                r.Actor.Id, r.Actor.Username, r.Actor.DisplayName, r.Actor.AvatarUrl, r.Actor.IsPrivate,
                FollowStatus = following.Contains(r.Actor.Id) ? "following" : requested.Contains(r.Actor.Id) ? "requested" : "none",
            },
            PostBody = r.PostId != null && bodies.TryGetValue(r.PostId.Value, out var b) ? b : null,
        });

        return Results.Ok(new { notifications, nextCursor });
    }

    private static async Task<IResult> GetUnreadCount(ClaimsPrincipal caller, AppDbContext db)
    {
        var userId = caller.GetUserId();
        var count = await db.Notifications.CountAsync(n => n.UserId == userId && n.ReadAt == null);
        return Results.Ok(new { count });
    }

    private record MarkReadRequest(Guid[]? Ids);

    private static async Task<IResult> MarkRead(
        [FromBody] MarkReadRequest req,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var userId = caller.GetUserId();
        var now = DateTime.UtcNow;

        var query = db.Notifications.Where(n => n.UserId == userId && n.ReadAt == null);
        if (req.Ids is { Length: > 0 })
            query = query.Where(n => req.Ids.Contains(n.Id));

        var toMark = await query.ToListAsync();
        foreach (var n in toMark) n.ReadAt = now;
        await db.SaveChangesAsync();
        return Results.Ok(new { marked = toMark.Count });
    }
}
