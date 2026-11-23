using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features;

public record ProfileDto(
    Guid Id, string Username, string DisplayName,
    string? Bio, string? AvatarUrl, bool IsSelf,
    int FollowerCount, int FollowingCount, bool IsFollowing,
    string? PublicProfileJson,
    // Populated only when IsSelf — lets a client reconcile its cached auth identity
    // (tier, onboarding state) against server truth on boot. Null for other users.
    string? Tier = null, bool? OnboardingCompleted = null,
    // Privacy (Features/Social/Privacy.cs). FollowStatus is the caller's relation to this
    // account: "none", "requested" or "following" (null when IsSelf). When CanSeeContent is
    // false the caller is not an accepted follower of a private account: PublicProfileJson is
    // withheld and posts / follow lists answer 403.
    bool IsPrivate = false, string? FollowStatus = null, bool CanSeeContent = true,
    // A sandbox sample client (Features/Sandbox). Only its own coach ever sees one.
    bool IsSample = false,
    // This account follows the caller ("Follows you", "Follow back").
    bool FollowsYou = false);

public record PostDto(Guid Id, Guid AuthorId, string AuthorUsername, string AuthorDisplayName, string? AuthorAvatarUrl, string Type, string? Body, string? PayloadJson, DateTime CreatedAt, DateTime? EditedAt, int LikeCount, bool IsLikedByMe, int CommentCount, RepostSourceDto? RepostOf, bool AuthorIsPrivate = false);

/// A minimal snapshot of the post a repost points at — deliberately not a full PostDto (no
/// like/comment counts of its own; those belong to the *original*, not the repost, and this
/// is display-only attribution, not a second interactive post card).
public record RepostSourceDto(Guid Id, Guid AuthorId, string AuthorUsername, string AuthorDisplayName, string? AuthorAvatarUrl, string Type, string? Body, string? PayloadJson, DateTime CreatedAt, bool Deleted,
    // Unavailable: the original's author is private and the caller isn't an accepted follower,
    // so Body/PayloadJson are withheld (Deleted is also true, so older clients grey it out).
    bool AuthorIsPrivate = false, bool Unavailable = false);

public record CommentDto(Guid Id, Guid AuthorId, string AuthorUsername, string AuthorDisplayName, string? AuthorAvatarUrl, string Body, DateTime CreatedAt, DateTime? EditedAt, int LikeCount, bool IsLikedByMe, Guid? ParentCommentId = null);

public static class MappingExtensions
{
    public static ProfileDto ToProfileDto(
        this User user, bool isSelf,
        int followerCount = 0, int followingCount = 0, bool isFollowing = false,
        bool requested = false, bool followsYou = false)
    {
        var canSee = isSelf || isFollowing || !user.IsPrivate;
        return new(user.Id, user.Username, user.DisplayName, user.Bio, user.AvatarUrl,
            isSelf, followerCount, followingCount, isFollowing,
            canSee ? user.PublicProfileJson : null,
            isSelf ? user.Tier.ToString() : null,
            isSelf ? user.OnboardingCompleted : null,
            user.IsPrivate,
            isSelf ? null : isFollowing ? "following" : requested ? "requested" : "none",
            canSee,
            user.IsSample,
            !isSelf && followsYou);
    }

    /// `hiddenAuthors`: private accounts the caller isn't allowed to see (Privacy.HiddenAuthorsAsync).
    /// A repost of one of their posts comes back marked Unavailable.
    /// A plain repost (no words of its own) shows the original's likes and comments: liking or
    /// commenting on it goes to the original (SharedPostIdAsync), so its own rows stay empty.
    public static PostDto ToDto(this Post post, Guid? callerId = null, IReadOnlySet<Guid>? hiddenAuthors = null)
    {
        var counted = post.RepostOf is not null && string.IsNullOrEmpty(post.Body) ? post.RepostOf : post;
        return ToDto(post, counted, callerId, hiddenAuthors);
    }

    private static PostDto ToDto(Post post, Post counted, Guid? callerId, IReadOnlySet<Guid>? hiddenAuthors) =>
        new(post.Id, post.AuthorId, post.Author.Username, post.Author.DisplayName, post.Author.AvatarUrl,
            post.Type.ToString(), post.Body, post.PayloadJson, post.CreatedAt, post.EditedAt,
            counted.Likes.Count,
            callerId.HasValue && counted.Likes.Any(l => l.UserId == callerId.Value),
            counted.Comments.Count(c => c.DeletedAt == null),
            post.RepostOf?.ToRepostSourceDto(hiddenAuthors?.Contains(post.RepostOf.AuthorId) == true),
            post.Author.IsPrivate);

    /// The original may have been soft-deleted since this repost was made — still show
    /// attribution (who it was from), just marked Deleted so the client can grey it out
    /// instead of rendering now-gone Body/PayloadJson content.
    public static RepostSourceDto ToRepostSourceDto(this Post post, bool unavailable = false)
    {
        var show = post.DeletedAt is null && !unavailable;
        return new(post.Id, post.AuthorId, post.Author.Username, post.Author.DisplayName, post.Author.AvatarUrl,
            post.Type.ToString(),
            show ? post.Body : null,
            show ? post.PayloadJson : null,
            post.CreatedAt, !show, post.Author.IsPrivate, unavailable);
    }

    public static CommentDto ToDto(this Comment comment, Guid? callerId = null) =>
        new(comment.Id, comment.AuthorId, comment.Author.Username, comment.Author.DisplayName,
            comment.Author.AvatarUrl, comment.Body, comment.CreatedAt, comment.EditedAt,
            comment.Likes.Count,
            callerId.HasValue && comment.Likes.Any(l => l.UserId == callerId.Value),
            comment.ParentCommentId);

    /// The caller's relation to each of `users`: whom they follow, whom they've asked to follow,
    /// and who follows them, for lists of people (followers, following).
    public static async Task<Func<User, ProfileDto>> ProfilesForCaller(
        Data.AppDbContext db, Guid? callerId, IReadOnlyCollection<Guid> ids)
    {
        if (callerId is not { } me) return u => u.ToProfileDto(false);
        var following = (await db.Follows.Where(f => f.FollowerId == me && ids.Contains(f.FollowedId)).Select(f => f.FollowedId).ToListAsync()).ToHashSet();
        var followers = (await db.Follows.Where(f => f.FollowedId == me && ids.Contains(f.FollowerId)).Select(f => f.FollowerId).ToListAsync()).ToHashSet();
        var requested = (await db.FollowRequests.Where(r => r.RequesterId == me && ids.Contains(r.TargetId)).Select(r => r.TargetId).ToListAsync()).ToHashSet();
        return u => u.ToProfileDto(u.Id == me, 0, 0, following.Contains(u.Id), requested.Contains(u.Id), followers.Contains(u.Id));
    }
}
