namespace Logit.Api.Data.Entities;

/// A conversation between people (friends overhaul, design canvas M1–M3): one-to-one, or a
/// group's chat (GroupId set; its members are the group's). Coach threads stay CoachMessage.
public class DmThread
{
    public Guid Id { get; set; } = Guid.NewGuid();
    /// Both user ids in order ("a:b", a &lt; b), so two people have one thread; "g:{group id}" for a group.
    public string PairKey { get; set; } = "";
    public Guid? GroupId { get; set; }
    public Group? Group { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastMessageAt { get; set; } = DateTime.UtcNow;
    public ICollection<DmMember> Members { get; set; } = [];
}

/// One person's side of a thread.
public class DmMember
{
    public Guid ThreadId { get; set; }
    public DmThread Thread { get; set; } = null!;
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    /// False = it's in this person's message requests (Instagram): no push, no badge, and the
    /// sender can't see it was read.
    public bool Accepted { get; set; }
    public DateTime? LastReadAt { get; set; }
    /// "Delete" on a request or a chat: older messages are gone for this person; a new one
    /// brings the thread back.
    public DateTime? ClearedAt { get; set; }
}

public class DirectMessage
{
    /// Permanent id (federation rule 3).
    public Guid Id { get; set; } = Guid.NewGuid();
    /// The sender's own id for it, so a resend after a dropped connection isn't a duplicate.
    public string ClientId { get; set; } = "";
    public Guid ThreadId { get; set; }
    public DmThread Thread { get; set; } = null!;
    /// Null once the sender deleted their account: the message stays, as "Deleted account".
    public Guid? SenderId { get; set; }
    public User? Sender { get; set; }
    /// May be empty when the message is only a card.
    public string Body { get; set; } = "";
    /// A shared workout or record, in the same format as a post's payload ("WorkoutSession",
    /// "PersonalRecord"); a snapshot, so it doesn't change if the sender edits the workout.
    public string? CardType { get; set; }
    public string? CardJson { get; set; }
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
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    /// Set when the sender edited the text (within 15 minutes, as on Instagram); shown as "Edited".
    public DateTime? EditedAt { get; set; }
    /// Unsent by the sender (or removed by LogIt after a report): the row stays so both people see
    /// "unsent a message" where it was; its text, card and photo are gone.
    public DateTime? DeletedAt { get; set; }
    public bool RemovedByLogIt { get; set; }
    /// When the push dispatcher dealt with it (sent, or skipped).
    public DateTime? PushedAt { get; set; }
}

/// Stored as int: add at the end.
public enum DmFromFollowers { Chats, Requests }
public enum DmFromOthers { Requests, Off }
