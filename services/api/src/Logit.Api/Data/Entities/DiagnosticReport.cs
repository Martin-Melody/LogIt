namespace Logit.Api.Data.Entities;

/// A diagnostics log a user chose to send from the app (Settings → Diagnostics) on the hosted
/// service, or a crash a test build sent by itself (Kind "crash", maybe without an account). Read in the admin console (Diagnostics); deleted after DiagnosticsEndpoints.RetentionDays, and with
/// the account. Self-hosted servers don't accept these.
public class DiagnosticReport
{
    public Guid Id { get; set; } = Guid.NewGuid();
    /// Null for a crash sent from a phone with no account signed in.
    public Guid? UserId { get; set; }
    /// "report" (sent by the user) or "crash" (sent automatically by a test build).
    public string Kind { get; set; } = "report";
    /// The app's random install id (X-Logit-Device), so crashes from one phone can be grouped.
    public string? DeviceId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string AppVersion { get; set; } = string.Empty;
    public string Platform { get; set; } = string.Empty;
    public string? Note { get; set; }
    public string Log { get; set; } = string.Empty;

    public User? User { get; set; }
}

public static class DiagnosticsLimits
{
    public const int MaxNoteChars = 2000;
    /// Keep in step with MAX_REPORT_LOG_CHARS in packages/core/src/api/diagnosticsApi.ts.
    public const int MaxLogChars = 500_000;
    /// A crash carries only the lines before it. Keep in step with MAX_CRASH_LOG_CHARS in
    /// apps/clients/logit-frontend/src/lib/platform/crashReports.ts.
    public const int MaxCrashLogChars = 50_000;
}
