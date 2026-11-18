namespace Logit.Api.Data.Entities;

public class RefreshToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string Token { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? RevokedAt { get; set; }

    /// One signed-in device or browser. Tokens rotate on every refresh; each new token keeps
    /// its predecessor's SessionId, Label and SessionStartedAt, so Account › Where you're signed
    /// in shows one row per device. Empty on tokens made before sessions existed (use SessionKey).
    public Guid SessionId { get; set; }
    /// "Chrome on Windows", "Logit app on Android", "Firefox on Linux · from your phone".
    public string? Label { get; set; }
    public DateTime? SessionStartedAt { get; set; }

    public bool IsExpired => DateTime.UtcNow >= ExpiresAt;
    public bool IsRevoked => RevokedAt is not null;
    public bool IsActive => !IsRevoked && !IsExpired;
    public Guid SessionKey => SessionId == Guid.Empty ? Id : SessionId;

    public User User { get; set; } = null!;
}

public static class RefreshTokenLimits
{
    public const int MaxLabelChars = 120;
}
