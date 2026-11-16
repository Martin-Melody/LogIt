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
    /// What people pay through this link. Null = free: they ask, the coach accepts. With a
    /// package they pay first and coaching starts straight away.
    public Guid? PackageId { get; set; }
    public CoachPackage? Package { get; set; }
}

public static class CoachInviteLinkLimits
{
    public const int MaxNameChars = 80;
    public const int MaxUses = 1000;
    public const int MaxDays = 365;
}
