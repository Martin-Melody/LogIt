namespace Logit.Api.Data.Entities;

/// One person's week on the boards (design canvas G4, B2; journey F6): worked out on their phone
/// and sent as these numbers only (Free accounts don't sync workouts, and the boards never need
/// the workouts themselves). Effort, never strength: planned done, weeks kept, volume against
/// their own usual.
public class BoardWeek
{
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    /// The Monday the week starts on, "YYYY-MM-DD" (their own calendar).
    public string WeekStart { get; set; } = "";
    public int Done { get; set; }
    public int Planned { get; set; }
    public int WeeksKept { get; set; }
    /// Volume per workout this week against their usual (last four weeks), in percent; null when
    /// there's no usual yet.
    public int? VolumePct { get; set; }
    /// The whole week is paused: shown as "Rest week", not at the bottom.
    public bool Rest { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
