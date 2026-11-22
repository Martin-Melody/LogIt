using System.Globalization;
using System.Text;
using Logit.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Auth;

/// A username for someone who didn't pick one (letters and digits from their name, else their
/// email), made unique with a number. They can change it later in Account.
public static class Usernames
{
    /// 3–30 lowercase letters, digits or underscores (what the sign-up form asks for).
    public static bool IsValid(string username) =>
        username.Length is >= 3 and <= 30 && username.All(c => c is >= 'a' and <= 'z' or >= '0' and <= '9' or '_');

    public static string Base(string? displayName, string? email)
    {
        var fromName = Slug(displayName);
        var b = fromName.Length >= 3 ? fromName : Slug(email?.Split('@')[0]);
        return b.Length >= 3 ? b : "member";
    }

    public static async Task<string> PickFreeAsync(AppDbContext db, string? displayName, string? email)
    {
        var b = Base(displayName, email);
        if (!await db.Users.AnyAsync(u => u.Username == b)) return b;
        for (var i = 0; i < 20; i++)
        {
            var candidate = b + Random.Shared.Next(i < 10 ? 10 : 1000, i < 10 ? 100 : 100000);
            if (!await db.Users.AnyAsync(u => u.Username == candidate)) return candidate;
        }
        return b + Guid.NewGuid().ToString("N")[..8];
    }

    private static string Slug(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return "";
        var sb = new StringBuilder();
        foreach (var c in s.Normalize(NormalizationForm.FormD).ToLowerInvariant())
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.NonSpacingMark) continue;
            if (c is >= 'a' and <= 'z' or >= '0' and <= '9') sb.Append(c);
            if (sb.Length == 20) break;
        }
        return sb.ToString();
    }
}
