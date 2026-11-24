namespace Logit.Api.Data.Entities;

/// A phone that can get pushes: its Firebase Cloud Messaging token. A token moves to whoever
/// signs in on that phone last.
public class PushDevice
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string Token { get; set; } = "";
    public string Platform { get; set; } = "android";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastSeenAt { get; set; } = DateTime.UtcNow;

    public User User { get; set; } = null!;
}

/// Who a like or comment push may come from, as Instagram offers it. Stored as int: add at the end.
public enum PushAudience { Off, Following, Everyone }

/// A user's push choices (Settings › Notifications). No row means the defaults below.
public class PushSettings
{
    public Guid UserId { get; set; }

    public PushAudience Likes { get; set; } = PushAudience.Everyone;
    public PushAudience Comments { get; set; } = PushAudience.Everyone;
    public bool Follows { get; set; } = true;
    public bool Messages { get; set; } = true;
    public bool Coaching { get; set; } = true;
    public bool Cheers { get; set; } = true;

    /// "Pause all": pushes from people are dropped until then (they stay in the Inbox).
    public DateTime? PausedUntil { get; set; }

    /// Quiet mode, in the phone's local time: pushes from people wait, then come as one summary.
    public bool QuietOn { get; set; } = true;
    public int QuietFromMinute { get; set; } = 22 * 60;
    public int QuietToMinute { get; set; } = 7 * 60;
    /// Days the quiet time starts on, bit 0 = Monday … bit 6 = Sunday.
    public int QuietDays { get; set; } = 0b111_1111;

    /// IANA zone from the phone, e.g. Europe/Dublin.
    public string TimeZone { get; set; } = "UTC";

    /// When the last gathered (likes, comments, follows) push went out.
    public DateTime? LastBundleAt { get; set; }

    public User User { get; set; } = null!;
}
