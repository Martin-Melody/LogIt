using Logit.Api.Data.Entities;

namespace Logit.Api.Features;

public record ProfileDto(Guid Id, string Username, string DisplayName, string? Bio, string? AvatarUrl, bool IsSelf);
public record PostDto(Guid Id, string AuthorUsername, string AuthorDisplayName, string? AuthorAvatarUrl, string Type, string? Body, string? PayloadJson, DateTime CreatedAt);

public static class MappingExtensions
{
    public static ProfileDto ToProfileDto(this User user, bool isSelf) =>
        new(user.Id, user.Username, user.DisplayName, isSelf ? user.Bio : user.Bio, user.AvatarUrl, isSelf);

    public static PostDto ToDto(this Post post) =>
        new(post.Id, post.Author.Username, post.Author.DisplayName, post.Author.AvatarUrl,
            post.Type.ToString(), post.Body, post.PayloadJson, post.CreatedAt);
}
