using System.Security.Claims;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Diagnostics;

public record SendDiagnosticReportRequest(string? Note, string? AppVersion, string? Platform, string? Log);

/// <summary>
/// Users of the hosted service can send their app's diagnostics log from Settings →
/// Diagnostics. Only on the hosted service: on a self-hosted server logs stay with the
/// person running it, so this endpoint answers 404 there and the app doesn't offer it.
/// </summary>
public static class DiagnosticsEndpoints
{
    public const int RetentionDays = 30;
    public const string RateLimitPolicy = "diagnostics-report";

    public static void MapDiagnosticsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/diagnostics/reports", SendReport)
            .WithTags("Diagnostics")
            .RequireAuthorization()
            .RequireRateLimiting(RateLimitPolicy);
    }

    private static async Task<IResult> SendReport(
        [FromBody] SendDiagnosticReportRequest req,
        ClaimsPrincipal caller,
        AppDbContext db,
        IConfiguration config,
        ILoggerFactory loggerFactory)
    {
        if (config.GetValue<bool>("Deployment:SelfHosted"))
            return Results.NotFound(new { error = "This server doesn't collect diagnostics reports." });

        if (string.IsNullOrWhiteSpace(req.Log))
            return Results.BadRequest(new { error = "The report has no log." });
        if (req.Log.Length > DiagnosticsLimits.MaxLogChars)
            return Results.BadRequest(new { error = "The log is too large to send." });

        var userId = caller.GetUserId();
        var report = new DiagnosticReport
        {
            UserId = userId,
            AppVersion = Trim(req.AppVersion, 100),
            Platform = Trim(req.Platform, 20),
            Note = string.IsNullOrWhiteSpace(req.Note) ? null : Trim(req.Note, DiagnosticsLimits.MaxNoteChars),
            Log = req.Log,
        };
        db.DiagnosticReports.Add(report);
        await db.SaveChangesAsync();

        var pruned = await PruneAsync(db, DateTime.UtcNow);

        loggerFactory.CreateLogger("Logit.Diagnostics").LogInformation(
            "Diagnostics report {ReportId} received from user {UserId} ({Platform}, {Chars} chars); pruned {Pruned} old",
            report.Id, userId, report.Platform, report.Log.Length, pruned);

        return Results.Ok(new { id = report.Id });
    }

    /// Delete reports older than the retention period. Run on every new report: reports are
    /// rare, so no background job is needed.
    public static Task<int> PruneAsync(AppDbContext db, DateTime now)
    {
        var cutoff = now.AddDays(-RetentionDays);
        return db.DiagnosticReports.Where(r => r.CreatedAt < cutoff).ExecuteDeleteAsync();
    }

    private static string Trim(string? s, int max)
    {
        var t = (s ?? string.Empty).Trim();
        return t.Length > max ? t[..max] : t;
    }
}
