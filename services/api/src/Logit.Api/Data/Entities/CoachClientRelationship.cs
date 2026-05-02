namespace Logit.Api.Data.Entities;

public class CoachClientRelationship
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CoachId { get; set; }
    public Guid ClientId { get; set; }
    public CoachClientStatus Status { get; set; } = CoachClientStatus.Pending;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public User Coach { get; set; } = null!;
    public User Client { get; set; } = null!;
}

public enum CoachClientStatus { Pending, Active, Revoked }
