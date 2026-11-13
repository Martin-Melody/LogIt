using System.Security.Cryptography;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Auth;

public enum RegistrationMode
{
    /// Anyone who can reach the server can create an account (the hosted service).
    Open,
    /// Creating an account needs an invite code from the /admin page (self-hosted default).
    Invite,
}

/// Who may create an account on this server, and the invite codes that let people in when
/// sign-ups are invite-only. Set with Registration:Mode (env REGISTRATION_MODE): "open" or "invite".
public static class Registration
{
    /// Crockford base32 without I, L, O and U, so a code read aloud or typed by hand
    /// can't be confused (0/O, 1/I/L).
    private const string Alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    public const int CodeLength = 8;

    /// Sign-up attempts per address: plenty for a family, too few to guess invite codes.
    public const string RateLimitPolicy = "auth-register";

    public static RegistrationMode GetMode(IConfiguration config) =>
        string.Equals(config["Registration:Mode"]?.Trim(), "invite", StringComparison.OrdinalIgnoreCase)
            ? RegistrationMode.Invite
            : RegistrationMode.Open;

    public static string ModeName(RegistrationMode mode) => mode == RegistrationMode.Invite ? "invite" : "open";

    /// A new random code, stored form ("K7M2Q9XH"). 8 characters of 32 = 40 bits.
    public static string NewCode()
    {
        Span<char> chars = stackalloc char[CodeLength];
        for (var i = 0; i < CodeLength; i++) chars[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
        return new string(chars);
    }

    /// "K7M2-Q9XH" for display.
    public static string Format(string code) =>
        code.Length == CodeLength ? $"{code[..4]}-{code[4..]}" : code;

    /// What people type → stored form: upper case, no spaces or dashes, and the look-alike
    /// letters read as the digits they're mistaken for (O → 0, I/L → 1). Null if it can't be a code.
    public static string? Normalize(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return null;
        var chars = input.Trim().ToUpperInvariant()
            .Where(c => c is not (' ' or '-' or '_'))
            .Select(c => c switch { 'O' => '0', 'I' or 'L' => '1', _ => c })
            .ToArray();
        if (chars.Length != CodeLength || chars.Any(c => !Alphabet.Contains(c))) return null;
        return new string(chars);
    }

    /// Uses up one go of an invite, atomically, so two people can't both take the last use.
    /// Returns the invite's id when it worked.
    public static async Task<Guid?> TryClaimAsync(AppDbContext db, string? input, DateTime now)
    {
        var code = Normalize(input);
        if (code is null) return null;
        var invite = await db.Invites.AsNoTracking().FirstOrDefaultAsync(i => i.Code == code);
        if (invite is null) return null;
        var claimed = await db.Invites
            .Where(i => i.Id == invite.Id
                        && i.RevokedAt == null
                        && (i.ExpiresAt == null || i.ExpiresAt > now)
                        && i.UseCount < i.MaxUses)
            .ExecuteUpdateAsync(s => s.SetProperty(i => i.UseCount, i => i.UseCount + 1));
        return claimed == 1 ? invite.Id : null;
    }

    /// Gives a use back when the account couldn't be created after all.
    public static Task ReleaseAsync(AppDbContext db, Guid inviteId) =>
        db.Invites.Where(i => i.Id == inviteId && i.UseCount > 0)
            .ExecuteUpdateAsync(s => s.SetProperty(i => i.UseCount, i => i.UseCount - 1));

    /// The invite's state as the admin page shows it.
    public static string Status(Invite i, DateTime now) =>
        i.RevokedAt is not null ? "revoked"
        : i.ExpiresAt is { } e && e <= now ? "expired"
        : i.UseCount >= i.MaxUses ? "used"
        : "active";
}
