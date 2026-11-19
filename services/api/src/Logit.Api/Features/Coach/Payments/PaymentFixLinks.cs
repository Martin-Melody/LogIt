using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.WebUtilities;

namespace Logit.Api.Features.Coach.Payments;

/// The "update your card" link in a failed-payment email. It works without signing in (people
/// read the email on their phone, where they may never have signed in on the web) and can only
/// open a fresh Stripe billing page for that one payment, until it expires. Signed with
/// Jwt:Secret, so nothing is stored.
public static class PaymentFixLinks
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(30);
    private const int MacBytes = 12;

    public static string Create(Guid paymentId, DateTime expiresUtc, string secret)
    {
        var payload = new byte[24];
        paymentId.TryWriteBytes(payload);
        BitConverter.TryWriteBytes(payload.AsSpan(16), new DateTimeOffset(expiresUtc, TimeSpan.Zero).ToUnixTimeSeconds());
        return WebEncoders.Base64UrlEncode([.. payload, .. Mac(payload, secret)]);
    }

    /// The payment the token names, or null when it's malformed, forged or expired.
    public static Guid? Read(string? token, string secret, DateTime nowUtc)
    {
        byte[] raw;
        try { raw = WebEncoders.Base64UrlDecode(token ?? ""); }
        catch (FormatException) { return null; }
        if (raw.Length != 24 + MacBytes) return null;
        var payload = raw.AsSpan(0, 24).ToArray();
        if (!CryptographicOperations.FixedTimeEquals(raw.AsSpan(24), Mac(payload, secret))) return null;
        var expires = DateTimeOffset.FromUnixTimeSeconds(BitConverter.ToInt64(payload, 16)).UtcDateTime;
        return expires < nowUtc ? null : new Guid(payload.AsSpan(0, 16));
    }

    public static string Url(string webOrigin, string token) => $"{webOrigin.TrimEnd('/')}/pay/fix/{token}";

    // Its own key, so a token here can never be mistaken for anything else signed with the secret.
    private static byte[] Mac(byte[] payload, string secret) =>
        HMACSHA256.HashData(Encoding.UTF8.GetBytes("payment-fix-link:" + secret), payload)[..MacBytes];
}
