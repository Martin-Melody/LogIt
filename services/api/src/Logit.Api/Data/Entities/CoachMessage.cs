namespace Logit.Api.Data.Entities;

/// One message in a coach↔client thread. The single bidirectional piece of PT Studio: both
/// participants may post, but every row is owned by its sender and scoped to one
/// CoachClientRelationship. Append-only — no edit/delete in v1.
public class CoachMessage
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// Client-generated stable id (nanoid), unique per sender — the idempotency key for sends.
    public string MessageId { get; set; } = string.Empty;

    public Guid RelationshipId { get; set; }
    public CoachClientRelationship Relationship { get; set; } = null!;

    public Guid SenderUserId { get; set; }
    public User Sender { get; set; } = null!;

    public string Body { get; set; } = string.Empty;
    public long CreatedAtMs { get; set; }

    /// When set (YYYY-MM-DD), this message is a comment on the client's diary for that date.
    public string? ContextDateIso { get; set; }

    /// Set by the *recipient* when they've seen it (drives unread counts).
    public long? ReadAtMs { get; set; }

    public DateTime SyncedAt { get; set; } = DateTime.UtcNow;
}
