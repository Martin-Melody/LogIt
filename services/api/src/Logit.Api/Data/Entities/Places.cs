namespace Logit.Api.Data.Entities;

/// A place someone trains (My gym): a gym, home, a work gym. The app owns the shape (bar and
/// plates, dumbbells, kit, machines and the exercises they serve, usual days), kept as DataJson
/// like habits; see packages/core/src/domain/place.ts. Private to the account.
public class SyncedPlace : ISyncedClientRow
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
