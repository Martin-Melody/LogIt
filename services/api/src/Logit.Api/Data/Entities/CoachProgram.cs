namespace Logit.Api.Data.Entities;

/// A multi-week training program authored by a coach and (optionally) assigned to one client.
/// The mirror image of the coach-read path in SyncEndpoints: the coach owns and writes this
/// row, the client pulls it read-only via GET /coach/programs/assigned. It lives in its own
/// table and never touches the client's Synced* rows, so the one-directional isolation
/// guarantee from PT Studio is preserved.
public class CoachProgram
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// App-generated stable id (nanoid), unique per coach. The upsert key together with CoachId.
    public string ProgramId { get; set; } = string.Empty;

    public Guid CoachId { get; set; }
    public User Coach { get; set; } = null!;

    /// Null => an unassigned template in the coach's library.
    public Guid? RecipientUserId { get; set; }
    public User? Recipient { get; set; }

    /// The consent grant this assignment rides on. Set to null (not deleted) if the
    /// relationship row is ever removed; the assigned query also filters on Active status.
    public Guid? RelationshipId { get; set; }
    public CoachClientRelationship? Relationship { get; set; }

    public long UpdatedAtMs { get; set; }
    public string DataJson { get; set; } = string.Empty;
    public long? DeletedAtMs { get; set; }
    public DateTime SyncedAt { get; set; } = DateTime.UtcNow;
}
