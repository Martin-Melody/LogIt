namespace Logit.Api.Data.Entities;

/// A conversation between people (friends overhaul, design canvas M1–M3). One-to-one for now;
/// group chats join later through the same members table. Coach threads stay CoachMessage.
public class DmThread
{
    public Guid Id { get; set; } = Guid.NewGuid();
    /// Both user ids in order ("a:b", a &lt; b), so two people have one thread.
    public string PairKey { get; set; } = "";
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
    public string Body { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    /// When the push dispatcher dealt with it (sent, or skipped).
    public DateTime? PushedAt { get; set; }
}

/// Stored as int: add at the end.
public enum DmFromFollowers { Chats, Requests }
public enum DmFromOthers { Requests, Off }
