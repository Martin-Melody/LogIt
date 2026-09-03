namespace Logit.Api.Data.Entities;

/// A habit a coach defines and assigns to a client. Same coach→client one-directional
/// shape as <see cref="CoachProgram"/> and <see cref="CheckinSchedule"/>: the coach owns
/// and writes it, the client pulls it read-only. The client's check-offs come back as
/// ordinary <see cref="SyncedHabitEntry"/> rows (client-owned, coach-readable via
/// ?clientId= on /sync/habit-entries).
public class CoachHabit
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// App-generated stable id (nanoid), unique per coach. The upsert key with CoachId.
    public string HabitId { get; set; } = string.Empty;

    public Guid CoachId { get; set; }
    public User Coach { get; set; } = null!;

    /// Null => an unassigned template in the coach's library.
    public Guid? RecipientUserId { get; set; }
    public User? Recipient { get; set; }

    /// The consent grant this assignment rides on. The assigned query also filters on Active.
    public Guid? RelationshipId { get; set; }
    public CoachClientRelationship? Relationship { get; set; }

    public long UpdatedAtMs { get; set; }
    public string DataJson { get; set; } = string.Empty;
    public long? DeletedAtMs { get; set; }
    public DateTime SyncedAt { get; set; } = DateTime.UtcNow;
}
