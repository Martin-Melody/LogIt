namespace Logit.Api.Data.Entities;

/// A saved Insights chart: a small recipe (metric, lifts, comparison, range, where it
/// shows) as DataJson, never the numbers. Each device draws it from its own data. Synced
/// like habits (/sync/charts). A coach can make one for a client: the row then belongs to
/// the client, with SentByUserId set to the coach (no FK, so deleting either account
/// never has to touch the other's rows; a dangling id just stops matching).
public class SyncedInsightChart : ISyncedClientRow
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

    /// The coach who made this chart for the client, if one did.
    public Guid? SentByUserId { get; set; }
}
