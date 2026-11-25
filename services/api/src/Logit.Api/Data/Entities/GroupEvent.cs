namespace Logit.Api.Data.Entities;

/// A group's event (design canvas G2, E1–E4; journey F5): a session, meet, race or social, with
/// Going / Can't make it, a reminder the evening before for those going, and a push to them when
/// the time or place changes or it's cancelled. Only members see it.
public class GroupEvent
{
    /// Permanent id (federation rule 3).
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GroupId { get; set; }
    public Group Group { get; set; } = null!;
    public string Title { get; set; } = "";
    /// "Session", "Meet", "Race" or "Social".
    public string Kind { get; set; } = "Session";
    public DateTime StartsAt { get; set; }
    public DateTime? EndsAt { get; set; }
    public string? Place { get; set; }
    public string? Details { get; set; }
    public Guid? CreatedById { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    /// Shown as cancelled until its day, so nobody turns up by mistake.
    public DateTime? CancelledAt { get; set; }
}

/// One member's answer: Going (true), Can't make it (false), or no answer (null, kept for a pin).
public class EventRsvp
{
    public Guid EventId { get; set; }
    public GroupEvent Event { get; set; } = null!;
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public bool? Going { get; set; }
    /// "Pin to Home": the event on your Home meetup card (one at a time).
    public bool Pinned { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    /// When the evening-before reminder went out (cleared when the time changes).
    public DateTime? RemindedAt { get; set; }
}
