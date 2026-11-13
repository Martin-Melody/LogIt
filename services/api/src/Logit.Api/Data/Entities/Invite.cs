namespace Logit.Api.Data.Entities;

/// An invite code made on the /admin page. When a server's sign-ups are invite-only
/// (Registration:Mode = "invite"), creating an account needs one of these.
public class Invite
{
    public Guid Id { get; set; } = Guid.NewGuid();
    /// Stored without the dash, upper case: "K7M2Q9XH" (shown as "K7M2-Q9XH").
    public string Code { get; set; } = string.Empty;
    /// Who it's for, so the admin can tell invites apart ("Sarah", "gym group").
    public string? Note { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ExpiresAt { get; set; }
    public int MaxUses { get; set; } = 1;
    public int UseCount { get; set; }
    public DateTime? RevokedAt { get; set; }

    public ICollection<User> Users { get; set; } = [];
}

public static class InviteLimits
{
    public const int MaxNoteChars = 200;
    public const int MaxUses = 1000;
    public const int MaxDays = 365;
}
