namespace Logit.Api.Data.Entities;

/// A recurring check-in questionnaire a coach defines and assigns to a client. Same
/// coach→client one-directional shape as <see cref="CoachProgram"/>: the coach owns and
/// writes it, the client pulls it read-only. The client's answers come back as
/// <see cref="SyncedCheckinSubmission"/> rows (client-owned, coach-readable — the same
/// direction as workout sessions).
public class CheckinSchedule
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// App-generated stable id (nanoid), unique per coach.
    public string ScheduleId { get; set; } = string.Empty;

    public Guid CoachId { get; set; }
    public User Coach { get; set; } = null!;

    /// Null => an unassigned template in the coach's library.
    public Guid? RecipientUserId { get; set; }
    public User? Recipient { get; set; }

    public Guid? RelationshipId { get; set; }
    public CoachClientRelationship? Relationship { get; set; }

    public long UpdatedAtMs { get; set; }
    public string DataJson { get; set; } = string.Empty;
    public long? DeletedAtMs { get; set; }
    public DateTime SyncedAt { get; set; } = DateTime.UtcNow;
}
