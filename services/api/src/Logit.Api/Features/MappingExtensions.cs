using Logit.Api.Data.Entities;

namespace Logit.Api.Features;

public record ProfileDto(
    Guid Id, string Username, string DisplayName,
    string? Bio, string? AvatarUrl, bool IsSelf,
    int FollowerCount, int FollowingCount, bool IsFollowing,
    string? PublicProfileJson,
    // Populated only when IsSelf — lets a client reconcile its cached auth identity
    // (tier, onboarding state) against server truth on boot. Null for other users.
    string? Tier = null, bool? OnboardingCompleted = null);

public record PostDto(Guid Id, Guid AuthorId, string AuthorUsername, string AuthorDisplayName, string? AuthorAvatarUrl, string Type, string? Body, string? PayloadJson, DateTime CreatedAt, DateTime? EditedAt, int LikeCount, bool IsLikedByMe, int CommentCount);

public record CommentDto(Guid Id, Guid AuthorId, string AuthorUsername, string AuthorDisplayName, string? AuthorAvatarUrl, string Body, DateTime CreatedAt, DateTime? EditedAt, int LikeCount, bool IsLikedByMe);

public static class MappingExtensions
{
    public static ProfileDto ToProfileDto(
        this User user, bool isSelf,
        int followerCount = 0, int followingCount = 0, bool isFollowing = false) =>
        new(user.Id, user.Username, user.DisplayName, user.Bio, user.AvatarUrl,
            isSelf, followerCount, followingCount, isFollowing, user.PublicProfileJson,
            isSelf ? user.Tier.ToString() : null,
            isSelf ? user.OnboardingCompleted : null);

    public static PostDto ToDto(this Post post, Guid? callerId = null) =>
        new(post.Id, post.AuthorId, post.Author.Username, post.Author.DisplayName, post.Author.AvatarUrl,
            post.Type.ToString(), post.Body, post.PayloadJson, post.CreatedAt, post.EditedAt,
            post.Likes.Count,
            callerId.HasValue && post.Likes.Any(l => l.UserId == callerId.Value),
            post.Comments.Count(c => c.DeletedAt == null));

    public static CommentDto ToDto(this Comment comment, Guid? callerId = null) =>
        new(comment.Id, comment.AuthorId, comment.Author.Username, comment.Author.DisplayName,
            comment.Author.AvatarUrl, comment.Body, comment.CreatedAt, comment.EditedAt,
            comment.Likes.Count,
            callerId.HasValue && comment.Likes.Any(l => l.UserId == callerId.Value));
}
