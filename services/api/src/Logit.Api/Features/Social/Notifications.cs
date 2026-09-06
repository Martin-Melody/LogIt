using System.Text.RegularExpressions;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Social;

/// Helpers to record in-app notifications as a side effect of social actions.
/// Callers still own the SaveChangesAsync().
public static class Notifications
{
    // Keep in sync with mentions.ts's MENTION_RE on the client (used for rendering only —
    // this is the copy that actually decides who gets notified).
    private static readonly Regex MentionPattern =
        new(@"(?<![a-zA-Z0-9._-])@([a-zA-Z0-9_]{1,32})", RegexOptions.Compiled);

    /// Scans a just-created post/comment body for @mentions and raises a Mention notification
    /// for each real username found — skipping the author's own, duplicates, and anyone
    /// blocked-with the author (mutual invisibility, same rule as everywhere else social).
    public static async Task AddMentionsAsync(this AppDbContext db, Guid actorId, string? body, Guid postId, Guid? commentId = null)
    {
        if (string.IsNullOrWhiteSpace(body)) return;
        var usernames = MentionPattern.Matches(body)
            .Select(m => m.Groups[1].Value.ToLowerInvariant())
            .Distinct()
            .ToList();
        if (usernames.Count == 0) return;

        var blocked = await db.BlockedUserIdsAsync(actorId);
        var mentioned = await db.Users
            .Where(u => usernames.Contains(u.Username) && u.Id != actorId && !blocked.Contains(u.Id))
            .ToListAsync();

        foreach (var user in mentioned)
        {
            db.Notifications.Add(new Notification
            {
                UserId = user.Id,
                ActorId = actorId,
                Type = NotificationType.Mention,
                PostId = postId,
                CommentId = commentId,
            });
        }
    }

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

    public static async Task AddCommentLikeAsync(this AppDbContext db, Guid actorId, Comment comment)
    {
        if (comment.AuthorId == actorId) return;
        var exists = await db.Notifications.AnyAsync(n =>
            n.UserId == comment.AuthorId && n.ActorId == actorId &&
            n.Type == NotificationType.Like && n.CommentId == comment.Id);
        if (exists) return;

        db.Notifications.Add(new Notification
        {
            UserId = comment.AuthorId,
            ActorId = actorId,
            Type = NotificationType.Like,
            PostId = comment.PostId,
            CommentId = comment.Id,
        });
    }

    /// Notify the original author that their post was reposted. Pass `quote` when it's a
    /// quote repost — the notification then points at the quote (so the author can read the
    /// commentary) rather than back at their own post.
    public static void AddRepost(this AppDbContext db, Guid actorId, Post original, Post? quote = null)
    {
        if (original.AuthorId == actorId) return;
        db.Notifications.Add(new Notification
        {
            UserId = original.AuthorId,
            ActorId = actorId,
            Type = quote is not null ? NotificationType.Quote : NotificationType.Repost,
            PostId = quote?.Id ?? original.Id,
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
