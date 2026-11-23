namespace Logit.Api.Data.Entities;

public class SyncedWorkoutSession
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string ClientId { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public long StartedAtMs { get; set; }
    /// When the session last changed on a device; a push older than the stored copy is ignored.
    public long UpdatedAtMs { get; set; }
    public string DataJson { get; set; } = string.Empty;
    public long? DeletedAtMs { get; set; }
    public DateTime SyncedAt { get; set; } = DateTime.UtcNow;
}
