namespace Logit.Api.Data.Entities;

// Mention/Repost appended at the end deliberately — stored as a plain int, a member inserted
// elsewhere would renumber (and thus reinterpret) every existing row's stored value.
public enum NotificationType { Like, Comment, Follow, Mention, Repost }

/// An in-app notification for a user — someone liked/commented on their post, or
/// followed them. Created as a side effect of the corresponding social action.
public class Notification
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// The recipient.
    public Guid UserId { get; set; }

    /// Who caused it.
    public Guid ActorId { get; set; }

    public NotificationType Type { get; set; }

    /// Set for Like / Comment.
    public Guid? PostId { get; set; }

    /// Set for Comment.
    public Guid? CommentId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ReadAt { get; set; }

    public User User { get; set; } = null!;
    public User Actor { get; set; } = null!;
}
