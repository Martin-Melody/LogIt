using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Social;

/// Helpers to record in-app notifications as a side effect of social actions.
/// Callers still own the SaveChangesAsync().
public static class Notifications
{
    public static async Task AddLikeAsync(this AppDbContext db, Guid actorId, Post post)
    {
        if (post.AuthorId == actorId) return;
        // Don't stack repeat like/unlike/like from the same actor on the same post.
        var exists = await db.Notifications.AnyAsync(n =>
            n.UserId == post.AuthorId && n.ActorId == actorId &&
            n.Type == NotificationType.Like && n.PostId == post.Id);
        if (exists) return;

        db.Notifications.Add(new Notification
        {
            UserId = post.AuthorId,
            ActorId = actorId,
            Type = NotificationType.Like,
            PostId = post.Id,
        });
    }

    public static void AddComment(this AppDbContext db, Guid actorId, Post post, Guid commentId)
    {
        if (post.AuthorId == actorId) return;
        db.Notifications.Add(new Notification
        {
            UserId = post.AuthorId,
            ActorId = actorId,
            Type = NotificationType.Comment,
            PostId = post.Id,
            CommentId = commentId,
        });
    }

    public static void AddFollow(this AppDbContext db, Guid actorId, Guid followedId)
    {
        if (followedId == actorId) return;
        db.Notifications.Add(new Notification
        {
            UserId = followedId,
            ActorId = actorId,
            Type = NotificationType.Follow,
        });
    }
}
