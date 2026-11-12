namespace Logit.Api.Data.Entities;

/// A diagnostics log a user chose to send from the app (Settings → Diagnostics) on the hosted
/// service. Read on the /admin page; deleted after DiagnosticsEndpoints.RetentionDays, and with
/// the account. Self-hosted servers don't accept these.
public class DiagnosticReport
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string AppVersion { get; set; } = string.Empty;
    public string Platform { get; set; } = string.Empty;
    public string? Note { get; set; }
    public string Log { get; set; } = string.Empty;

    public User User { get; set; } = null!;
}

public static class DiagnosticsLimits
{
    public const int MaxNoteChars = 2000;
    /// Keep in step with MAX_REPORT_LOG_CHARS in packages/core/src/api/diagnosticsApi.ts.
    public const int MaxLogChars = 500_000;
}
