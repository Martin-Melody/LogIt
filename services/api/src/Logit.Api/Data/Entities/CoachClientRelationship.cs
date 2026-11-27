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

    /// Which exercise swaps this client may make in workouts from this coach's programs
    /// (see SwapRules). Null: the coach's default (User.CoachSwapRule).
    public string? SwapRule { get; set; }

    // ── A request (canvas R3, C1–C6): the conversation before coaching starts ──
    /// Where a client's request stands while Pending (RequestStages.*), and why a closed one
    /// closed. Null for coach invites and for rows from before requests had stages.
    public string? RequestStage { get; set; }
    /// The client's answers to the coach's questions (CoachIntake.Answer[] as JSON), with the
    /// question as it was asked.
    public string? AnswersJson { get; set; }
    /// The package they said they were interested in, if any.
    public Guid? InterestedPackageId { get; set; }
    /// When it went on the waiting list (for "Waiting since").
    public DateTime? WaitingSince { get; set; }
    /// When the client agreed to the coach's agreement, and the words they agreed to (canvas J1, K9).
    public DateTime? AgreedAt { get; set; }
    public string? AgreedText { get; set; }
    /// Coaching ends on this date: the client took a spot with another coach and keeps this one
    /// until the end of what they paid for (one coach at a time). The payment sweep ends it.
    public DateTime? EndsAt { get; set; }
    /// The coach paused coaching until this date (canvas E1: away, ill, injured). Payments and
    /// check-ins pause; the client keeps training and the coach still sees what's shared.
    /// Separate from Status.Paused, which is "paused until it's paid".
    public DateTime? PausedUntil { get; set; }

    public User Coach { get; set; } = null!;
    public User Client { get; set; } = null!;
    public CoachClientPayment? Payment { get; set; }
}

/// Paused: coaching stopped because the client isn't paid up (see CoachClientPayment). Only
/// Active relationships give the coach access, so a paused one behaves like no coaching until
/// it's paid again. Appended last: the column stores the number.
public enum CoachClientStatus { Pending, Active, Revoked, Paused }

/// A client's request while Pending, and how a Revoked one ended.
public static class RequestStages
{
    public const string Asked = "asked";
    public const string Waiting = "waiting";
    public const string Offered = "offered";
    /// Closed by the coach (Revoked).
    public const string NotAFit = "notafit";
    /// Withdrawn by the client, or they left the waiting list (Revoked).
    public const string Withdrawn = "withdrawn";
}

