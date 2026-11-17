namespace Logit.Api.Data.Entities;

/// How one exercise progresses, as the lifter set it: its own algorithm, rep range and what
/// to do when a lift goal falls behind (JSON blob, newest wins). ClientId is the app's
/// exercise key (exercise id, or the lower-cased name for older exercises).
public class SyncedExerciseSetting : ISyncedClientRow
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
