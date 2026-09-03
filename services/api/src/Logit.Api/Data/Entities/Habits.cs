namespace Logit.Api.Data.Entities;

// Personal habits and their per-day check-offs, synced through /sync/habits and
// /sync/habit-entries. Both implement the shared ISyncedClientRow contract
// (see SyncedClientRow.cs): app-generated stable ClientId, last-write-wins by
// UpdatedAtMs, tombstoned via DeletedAtMs, pull cursor on SyncedAt. Coach-assigned
// habits are a separate future entity — these are the user's own.

/// One habit definition (name, cadence, optional numeric target) as a JSON blob.
public class SyncedHabit : ISyncedClientRow
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string ClientId { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public long CreatedAtMs { get; set; }
    public long UpdatedAtMs { get; set; }
    public string DataJson { get; set; } = string.Empty;
    public long? DeletedAtMs { get; set; }
    public DateTime SyncedAt { get; set; } = DateTime.UtcNow;
}

/// One day's check-off for a habit (done flag + optional logged value) as a JSON blob.
public class SyncedHabitEntry : ISyncedClientRow
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string ClientId { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public long CreatedAtMs { get; set; }
    public long UpdatedAtMs { get; set; }
    public string DataJson { get; set; } = string.Empty;
    public long? DeletedAtMs { get; set; }
    public DateTime SyncedAt { get; set; } = DateTime.UtcNow;
}
