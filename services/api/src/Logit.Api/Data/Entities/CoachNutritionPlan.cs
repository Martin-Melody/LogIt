namespace Logit.Api.Data.Entities;

/// A daily calorie/macro target a coach assigns to one client. Same coach-owns-and-writes /
/// client-pulls-read-only shape as CoachProgram — it lives in its own table and never
/// touches the client's Synced* rows, preserving the PT Studio isolation guarantee.
public class CoachNutritionPlan
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// App-generated stable id (nanoid), unique per coach. The upsert key with CoachId.
    public string PlanId { get; set; } = string.Empty;

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
