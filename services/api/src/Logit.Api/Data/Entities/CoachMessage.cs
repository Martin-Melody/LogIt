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

    /// A photo sent with the message (/photos/{id}; friends overhaul, design canvas M5). Its size
    /// is kept here so the bubble has its shape before the picture loads. The id stays after the
    /// file is gone (the sender's account deleted), and the apps show "Photo unavailable".
    public Guid? PhotoId { get; set; }
    public int PhotoWidth { get; set; }
    public int PhotoHeight { get; set; }
    /// A voice message (/voice/{id}), its length and the sender's waveform (a digit per bar).
    public Guid? VoiceId { get; set; }
    public int VoiceMs { get; set; }
    public string? VoicePeaks { get; set; }

    /// Set by the *recipient* when they've seen it (drives unread counts).
    public long? ReadAtMs { get; set; }

    public DateTime SyncedAt { get; set; } = DateTime.UtcNow;

    /// When the push dispatcher dealt with it (sent, or skipped).
    public DateTime? PushedAt { get; set; }

    /// The other person's reaction to it (Instagram: one each; only the person it was sent to
    /// reacts in a two-person thread). Changing it bumps SyncedAt so phones pull it.
    public string? Reaction { get; set; }
    public DateTime? ReactedAt { get; set; }
    /// When the push dispatcher dealt with the reaction (null = not yet).
    public DateTime? ReactionPushedAt { get; set; }
}
