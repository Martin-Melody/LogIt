namespace Logit.Api.Data.Entities;

/// A link a Studio coach shares (bio, group chat, poster). Anyone with an account who opens
/// it can ask the coach to coach them; the coach then accepts or declines. Unlike the app's
/// sign-up Invite codes, this never creates an account and never grants access by itself.
public class CoachInviteLink
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CoachId { get; set; }
    public User Coach { get; set; } = null!;
    /// Stored without the dash, upper case: "K7M2Q9XH" (shown as "K7M2-Q9XH").
    public string Code { get; set; } = string.Empty;
    /// Only the coach sees it ("Instagram bio").
    public string Name { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ExpiresAt { get; set; }
    /// Null = no limit. Counts requests waiting plus people who joined through it.
    public int? MaxUses { get; set; }
    public DateTime? RevokedAt { get; set; }
    /// The package the link is about. With PayAndStart they pay for it first and coaching starts
    /// straight away; without, it's only picked for them when they ask (canvas L1).
    public Guid? PackageId { get; set; }
    public CoachPackage? Package { get; set; }
    /// "Pay and start straight away": skips asking and the conversation. For a set program sold
    /// to anyone, not one-to-one coaching.
    public bool PayAndStart { get; set; }

    /// The package paid for through this link, or null when it's a link to ask.
    public CoachPackage? PaidPackage => PayAndStart && Package is { Hidden: false } p ? p : null;
}

public static class CoachInviteLinkLimits
{
    public const int MaxNameChars = 80;
    public const int MaxUses = 1000;
    public const int MaxDays = 365;
}
