namespace Logit.Api.Data.Entities;

/// <summary>
/// Shared shape of every client-owned per-row sync entity (nutrition rows, habits,
/// habit entries): an app-generated stable <see cref="ClientId"/>, last-write-wins by
/// <see cref="UpdatedAtMs"/>, tombstoned via <see cref="DeletedAtMs"/>, pull cursor on
/// <see cref="SyncedAt"/>. SyncEndpoints handles them all with one generic push/pull pair.
/// </summary>
public interface ISyncedClientRow
{
    string ClientId { get; set; }
    Guid UserId { get; set; }
    long CreatedAtMs { get; set; }
    long UpdatedAtMs { get; set; }
    string DataJson { get; set; }
    long? DeletedAtMs { get; set; }
    DateTime SyncedAt { get; set; }
}
