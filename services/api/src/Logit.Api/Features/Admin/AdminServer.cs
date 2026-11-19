using System.Diagnostics;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Auth;
using Logit.Api.Features.Email;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Admin;

/// The admin console's Server page: settings that win over .env, health, test email, backups.
public static class AdminServer
{
    public static async Task<IResult> GetServer(AppDbContext db, IConfiguration cfg, IEmailSender email)
    {
        var saved = await db.ServerSettings.FirstOrDefaultAsync(x => x.Key == Registration.ModeSettingKey);
        var sqlite = IsSqlite(db);

        var firstDay = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-13);
        var errorRows = await db.ServerErrorCounts.Where(c => c.Date >= firstDay).ToListAsync();
        var errors = Enumerable.Range(0, 14).Select(i =>
        {
            var day = firstDay.AddDays(i);
            var rows = errorRows.Where(r => r.Date == day).OrderByDescending(r => r.Count).ToList();
            return new { Date = day.ToString("yyyy-MM-dd"), Count = rows.Sum(r => r.Count), TopRoute = rows.FirstOrDefault()?.Route };
        });

        return Results.Ok(new
        {
            // registrationMode and selfHosted are also read by the old /admin page.
            RegistrationMode = Registration.ModeName(saved is null ? Registration.GetMode(cfg) : Registration.Parse(saved.Value)),
            RegistrationModeSource = saved is null ? "env" : "console",
            SelfHosted = cfg.GetValue<bool>("Deployment:SelfHosted"),
            EmailConfigured = email.IsConfigured,
            EmailFrom = cfg["Smtp:FromAddress"] is { Length: > 0 } from ? from : cfg["Smtp:User"],
            WebOrigin = cfg["Web:Origin"],
            Version = new
            {
                // LOGIT_COMMIT at build/run time; empty when the server was built without it.
                Commit = cfg["Logit:Commit"] is { Length: > 0 } c ? c : null,
                BuiltAt = File.GetLastWriteTimeUtc(typeof(AdminServer).Assembly.Location),
            },
            StartedAt = Process.GetCurrentProcess().StartTime.ToUniversalTime(),
            Database = new { Provider = sqlite ? "SQLite" : "Postgres", SizeBytes = await DatabaseSizeAsync(db, sqlite) },
            Holds = new
            {
                People = await db.Users.CountAsync(u => !u.IsSample),
                Workouts = await db.SyncedWorkoutSessions.CountAsync(w => w.DeletedAtMs == null),
                Posts = await db.Posts.CountAsync(p => p.DeletedAt == null),
            },
            Errors = errors,
            CanDownloadBackup = sqlite,
        });
    }

    public record RegistrationRequest(string Mode);

    public static async Task<IResult> SetRegistration(RegistrationRequest req, AppDbContext db, HttpContext http)
    {
        var mode = req.Mode?.Trim().ToLowerInvariant();
        if (mode is not ("open" or "invite")) return Results.BadRequest(new { error = "Mode must be \"open\" or \"invite\"." });
        var setting = await db.ServerSettings.FindAsync(Registration.ModeSettingKey);
        if (setting is null) db.ServerSettings.Add(setting = new ServerSetting { Key = Registration.ModeSettingKey });
        setting.Value = mode;
        setting.UpdatedAt = DateTime.UtcNow;
        AdminLog.Add(db, http, "server.registration", detail: mode == "invite" ? "invite-only" : "anyone can sign up");
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    /// Sends a test email to the signed-in admin, so they can see email works end to end.
    public static async Task<IResult> SendTestEmail(AppDbContext db, HttpContext http, IEmailSender email, ILoggerFactory loggers)
    {
        if (!email.IsConfigured)
            return Results.Json(new { error = "Email isn't set up on this server yet." }, statusCode: StatusCodes.Status409Conflict);
        var actor = AdminLog.Actor(http);
        var to = actor.UserId is { } id ? await db.Users.Where(u => u.Id == id).Select(u => u.Email).FirstOrDefaultAsync() : null;
        if (string.IsNullOrWhiteSpace(to))
            return Results.BadRequest(new { error = "Sign in with an admin account that has an email address to send yourself a test." });
        try
        {
            await email.SendAsync(to, "Test email from your Logit server",
                $"This is a test from {http.Request.Host}. Email works: people can now reset a forgotten password themselves.\n");
        }
        catch (Exception ex)
        {
            loggers.CreateLogger("Logit.Admin").LogWarning("Test email failed: {Reason}", ex.Message);
            return Results.Json(new { error = $"The email server refused it: {ex.Message}" }, statusCode: StatusCodes.Status502BadGateway);
        }
        AdminLog.Add(db, http, "server.test-email", detail: to);
        await db.SaveChangesAsync();
        return Results.Ok(new { sentTo = to });
    }

    /// A consistent copy of a SQLite database, taken while the server runs (VACUUM INTO), for the
    /// admin to keep somewhere else. Postgres servers back up with pg_dump instead.
    public static async Task<IResult> DownloadBackup(AppDbContext db, HttpContext http)
    {
        if (!IsSqlite(db))
            return Results.NotFound(new { error = "Download works on SQLite servers. On Postgres, back up with pg_dump." });

        var path = Path.Combine(Path.GetTempPath(), $"logit-backup-{Guid.NewGuid():N}.db");
        await db.Database.ExecuteSqlRawAsync("VACUUM INTO {0}", path);
        AdminLog.Add(db, http, "server.backup");
        await db.SaveChangesAsync();

        // Deleted as soon as the download finishes (or fails).
        var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.None, 81920, FileOptions.DeleteOnClose | FileOptions.Asynchronous);
        return Results.File(stream, "application/vnd.sqlite3", $"logit-backup-{DateTime.UtcNow:yyyy-MM-dd}.db");
    }

    private static bool IsSqlite(AppDbContext db) => db.Database.ProviderName?.Contains("Sqlite") == true;

    private static async Task<long?> DatabaseSizeAsync(AppDbContext db, bool sqlite)
    {
        try
        {
            if (!sqlite)
                return await db.Database.SqlQueryRaw<long>("SELECT pg_database_size(current_database()) AS \"Value\"").FirstAsync();
            var file = new SqliteConnectionStringBuilder(db.Database.GetConnectionString()).DataSource;
            return new[] { file, file + "-wal" }.Where(File.Exists).Sum(f => new FileInfo(f).Length);
        }
        catch
        {
            return null; // the size is nice to have; the page shows "unknown"
        }
    }
}
