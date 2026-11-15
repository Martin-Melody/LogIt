using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Social;

/// Who may see a private account's content. The rule everywhere: a private account's posts,
/// comments under them, profile cards and follow lists are visible to the account itself and
/// its accepted followers only. Everyone else (signed out included) sees name, photo, bio and
/// counts. Coaching is separate and never goes through here.
public static class Privacy
{
    public static async Task<bool> CanSeeAsync(this AppDbContext db, Guid? viewerId, User author)
    {
        if (!author.IsPrivate) return true;
        if (viewerId is null) return false;
        if (viewerId == author.Id) return true;
        return await db.Follows.AnyAsync(f => f.FollowerId == viewerId && f.FollowedId == author.Id);
    }

    /// Of `authorIds`, the private accounts the viewer may not see.
    public static async Task<HashSet<Guid>> HiddenAuthorsAsync(
        this AppDbContext db, Guid? viewerId, IEnumerable<Guid> authorIds)
    {
        var ids = authorIds.Distinct().Where(id => id != viewerId).ToList();
        if (ids.Count == 0) return [];
        var privateIds = await db.Users.Where(u => ids.Contains(u.Id) && u.IsPrivate).Select(u => u.Id).ToListAsync();
        if (privateIds.Count == 0) return [];
        if (viewerId is null) return [.. privateIds];
        var followed = await db.Follows
            .Where(f => f.FollowerId == viewerId && privateIds.Contains(f.FollowedId))
            .Select(f => f.FollowedId)
            .ToListAsync();
        return [.. privateIds.Except(followed)];
    }

    /// The hidden set for a page of posts: the authors of the posts they repost.
    public static Task<HashSet<Guid>> HiddenRepostAuthorsAsync(this AppDbContext db, Guid? viewerId, IEnumerable<Post> posts) =>
        db.HiddenAuthorsAsync(viewerId, posts.Where(p => p.RepostOf is not null).Select(p => p.RepostOf!.AuthorId));

    /// A 403 the clients recognise: show the lock instead of an error.
    public static IResult PrivateAccount() =>
        Results.Json(new { error = "This account is private.", code = "private" }, statusCode: StatusCodes.Status403Forbidden);

    /// Makes `requester` a follower of `target`: deletes the request, adds the follow, tells
    /// the requester. Caller saves.
    public static async Task AcceptAsync(this AppDbContext db, FollowRequest request)
    {
        db.FollowRequests.Remove(request);
        if (!await db.Follows.AnyAsync(f => f.FollowerId == request.RequesterId && f.FollowedId == request.TargetId))
            db.Follows.Add(new Follow { FollowerId = request.RequesterId, FollowedId = request.TargetId });
        db.Notifications.Add(new Notification
        {
            UserId = request.RequesterId,
            ActorId = request.TargetId,
            Type = NotificationType.FollowAccepted,
        });
    }
}
