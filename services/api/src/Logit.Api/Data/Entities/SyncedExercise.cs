namespace Logit.Api.Data.Entities;

public class SyncedExercise
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string ClientId { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public long CreatedAtMs { get; set; }
    public string DataJson { get; set; } = string.Empty;
    public DateTime SyncedAt { get; set; } = DateTime.UtcNow;
}
