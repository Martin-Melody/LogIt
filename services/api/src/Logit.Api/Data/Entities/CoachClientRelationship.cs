namespace Logit.Api.Data.Entities;

public class CoachClientRelationship
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CoachId { get; set; }
    public Guid ClientId { get; set; }
    public CoachClientStatus Status { get; set; } = CoachClientStatus.Pending;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    /// Who has to say yes while Pending. False: the coach invited by username and the client
    /// accepts. True: the client asked through an invite link and the coach accepts.
    public bool RequestedByClient { get; set; }
    /// The invite link a client-made request came through (null for username invites).
    public Guid? InviteLinkId { get; set; }
    public CoachInviteLink? InviteLink { get; set; }

    // What the client lets this coach read. Chosen when the client accepts or asks, and
    // changeable any time from My coach. Enforced on every coach read (see CoachAccess).
    // All true by default, which is what every relationship had before the switches existed.
    public bool ShareWorkouts { get; set; } = true;
    public bool ShareNutrition { get; set; } = true;
    public bool ShareBodyweight { get; set; } = true;
    public bool ShareHabits { get; set; } = true;
    public bool ShareCheckins { get; set; } = true;

    public User Coach { get; set; } = null!;
    public User Client { get; set; } = null!;
}

public enum CoachClientStatus { Pending, Active, Revoked }
