namespace Logit.Api.Data.Entities;

// Mention/Repost appended at the end deliberately — stored as a plain int, a member inserted
// elsewhere would renumber (and thus reinterpret) every existing row's stored value.
// Stored as its underlying int (EF default) — new members go at the end so existing
// rows keep their meaning.
public enum NotificationType { Like, Comment, Follow, Mention, Repost, Quote, FollowRequest, FollowAccepted, Reply, CoachInvite, CoachProgram, CoachPaymentFailed, Cheer, StoryCheer, GroupNote, GroupRequest, GroupApproved, GroupEvent, GroupEventChanged, GroupEventCancelled, GroupEventReminder, GroupReport, GroupPostReply, GroupDeclined, CoachMealPlan }

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

    /// Set for GroupNote, GroupRequest and GroupApproved.
    public Guid? GroupId { get; set; }
    public Group? Group { get; set; }

    /// Set for GroupPostReply: the post (and the comment, in CommentId's place: GroupCommentId).
    public Guid? GroupPostId { get; set; }
    public Guid? GroupCommentId { get; set; }

    /// Set for the GroupEvent… types.
    public Guid? EventId { get; set; }
    public GroupEvent? Event { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ReadAt { get; set; }

    /// When the push dispatcher dealt with it (sent, gathered into a summary, or skipped).
    public DateTime? PushedAt { get; set; }

    public User User { get; set; } = null!;
    public User Actor { get; set; } = null!;
}
