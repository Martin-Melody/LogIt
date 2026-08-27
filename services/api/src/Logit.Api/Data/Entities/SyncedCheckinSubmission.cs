namespace Logit.Api.Data.Entities;

/// A client's answers to one occurrence of a coach check-in. Client-owned, coach-readable
/// via the same `?clientId=` path as the other Synced* entities (see SyncEndpoints /
/// ResolveTargetUserId) — a coach never writes these.
public class SyncedCheckinSubmission
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// App-generated stable id (nanoid).
    public string ClientId { get; set; } = string.Empty;

    /// The submitting client (owner).
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public long CreatedAtMs { get; set; }
    public long UpdatedAtMs { get; set; }
    public string DataJson { get; set; } = string.Empty;
    public long? DeletedAtMs { get; set; }
    public DateTime SyncedAt { get; set; } = DateTime.UtcNow;
}
