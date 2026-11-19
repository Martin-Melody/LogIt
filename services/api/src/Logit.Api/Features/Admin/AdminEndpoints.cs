using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Billing;
using Logit.Api.Features.Auth;
using System.Security.Claims;
using Logit.Api.Features.Email;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Admin;

public static class AdminEndpoints
{
    public static void MapAdminEndpoints(this IEndpointRouteBuilder app, IConfiguration config, ILogger logger)
    {
        // Admins sign in with their own account (User.IsAdmin). ADMIN_KEY claims the first admin,
        // recovers when no admin can sign in, and still unlocks the old /admin page. With no key
        // set, admin works only for accounts that are already admins.
        var adminKey = config["Admin:Key"];
        AdminKeyGuard? guard = null;
        if (!string.IsNullOrWhiteSpace(adminKey))
        {
            if (adminKey.Length < AdminKeyGuard.RecommendedMinKeyLength)
                logger.LogWarning(
                    "ADMIN_KEY is only {Length} characters. Use a long random key (e.g. openssl rand -base64 32): it unlocks every account on this server.",
                    adminKey.Length);
            guard = new AdminKeyGuard(adminKey);
            app.MapGet("/admin", () => Results.Content(AdminHtml.Page, "text/html")).ExcludeFromDescription();
        }

        var account = app.MapGroup("/admin").RequireAuthorization().ExcludeFromDescription();
        account.MapGet("/me", (ClaimsPrincipal caller, AppDbContext db) => GetMe(caller, db, guard));
        account.MapPost("/claim", (ClaimRequest req, HttpContext http, AppDbContext db, IEmailSender email) =>
            Claim(req, http, db, email, guard, logger));

        var api = app.MapGroup("/admin/api")
            .AddEndpointFilter(AdminFilter(guard, logger))
            .ExcludeFromDescription();

        api.MapGet("/stats", GetStats);
        api.MapGet("/actions", async (AppDbContext db, int? take) =>
            Results.Ok(await db.AdminActions.OrderByDescending(a => a.CreatedAt).Take(Math.Clamp(take ?? 100, 1, 500)).ToListAsync()));
        api.MapGet("/users", GetUsers);
        api.MapGet("/users/{id:guid}", GetUser);
        api.MapPatch("/users/{id:guid}", UpdateUser);
        api.MapDelete("/users/{id:guid}", DeleteUser);
        api.MapDelete("/users/{id:guid}/tokens", RevokeTokens);
        api.MapPost("/users/{id:guid}/reset-password", ResetPassword);

        api.MapGet("/server", (IConfiguration cfg) => Results.Ok(new
        {
            registrationMode = Registration.ModeName(Registration.GetMode(cfg)),
            selfHosted = cfg.GetValue<bool>("Deployment:SelfHosted"),
        }));
        api.MapGet("/invites", GetInvites);
        // Discover experiments: per arm and recipe, what was shown and what people did next.
        api.MapGet("/discover", async (AppDbContext db, int? days) =>
            Results.Ok(await Logit.Api.Features.Discover.DiscoverStats.ComputeAsync(db, DateTime.UtcNow.AddDays(-(days ?? 30)))));
        api.MapPost("/invites", CreateInvite);
        api.MapDelete("/invites/{id:guid}", RevokeInvite);

        api.MapGet("/reports", GetReports);
        api.MapPost("/reports/{id:guid}/resolve", ResolveReport);

        api.MapGet("/diagnostics", GetDiagnosticReports);
        api.MapGet("/diagnostics/{id:guid}", GetDiagnosticReport);
        api.MapDelete("/diagnostics/{id:guid}", DeleteDiagnosticReport);

        Logit.Api.Features.Plugins.PluginEndpoints.MapPluginAdmin(api);
    }

    // ── Diagnostics reports (sent from the app's Settings → Diagnostics) ─────

    private static async Task<IResult> GetDiagnosticReports(AppDbContext db)
    {
        var reports = await db.DiagnosticReports
            .OrderByDescending(r => r.CreatedAt)
            .Take(200)
            .Select(r => new
            {
                r.Id,
                r.CreatedAt,
                r.AppVersion,
                r.Platform,
                r.Note,
                Chars = r.Log.Length,
                User = new { r.User.Id, r.User.Username },
            })
            .ToListAsync();
        return Results.Ok(new { reports });
    }

    private static async Task<IResult> GetDiagnosticReport(Guid id, AppDbContext db)
    {
        var r = await db.DiagnosticReports
            .Where(x => x.Id == id)
            .Select(x => new { x.Id, x.CreatedAt, x.AppVersion, x.Platform, x.Note, x.Log, User = new { x.User.Id, x.User.Username } })
            .FirstOrDefaultAsync();
        return r is null ? Results.NotFound(new { error = "Report not found." }) : Results.Ok(r);
    }

    private static async Task<IResult> DeleteDiagnosticReport(Guid id, AppDbContext db, HttpContext http)
    {
        var report = await db.DiagnosticReports.Include(r => r.User).FirstOrDefaultAsync(r => r.Id == id);
        if (report is null) return Results.NotFound(new { error = "Report not found." });
        db.DiagnosticReports.Remove(report);
        AdminLog.Add(db, http, "diagnostics.delete", report.User);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    // ── Who may use /admin/api ───────────────────────────────────────────────

    /// A request with X-Admin-Key is judged on the key alone (with the lockout); otherwise the
    /// caller must be signed in to an admin account, read fresh from the DB so removing someone
    /// takes effect at once.
    private static Func<EndpointFilterInvocationContext, EndpointFilterDelegate, ValueTask<object?>> AdminFilter(
        AdminKeyGuard? guard, ILogger logger) =>
        async (ctx, next) =>
        {
            var http = ctx.HttpContext;
            var key = http.Request.Headers["X-Admin-Key"].FirstOrDefault();
            if (key is not null)
            {
                if (guard is null) return Results.Json(new { error = "Unauthorized" }, statusCode: 401);
                if (CheckKey(guard, key, http, logger) is { } refused) return refused;
                AdminLog.SetActor(http, AdminActor.Key);
                return await next(ctx);
            }

            if (http.User.GetUserIdOrNull() is not { } userId)
                return Results.Json(new { error = "Unauthorized" }, statusCode: 401);
            var db = http.RequestServices.GetRequiredService<AppDbContext>();
            var admin = await db.Users.Where(u => u.Id == userId && u.IsAdmin && !u.IsSample)
                .Select(u => new { u.Id, u.Username }).FirstOrDefaultAsync();
            if (admin is null) return Results.Json(new { error = "This account isn't an admin." }, statusCode: 403);
            AdminLog.SetActor(http, new AdminActor(admin.Id, admin.Username));
            return await next(ctx);
        };

    /// Null when the key is right; otherwise the 429 (locked out) or 401 to send back.
    private static IResult? CheckKey(AdminKeyGuard guard, string? key, HttpContext http, ILogger logger)
    {
        var client = http.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var now = DateTime.UtcNow;

        if (guard.LockedUntil(client, now) is { } until)
        {
            var wait = (int)Math.Ceiling((until - now).TotalSeconds);
            http.Response.Headers.RetryAfter = wait.ToString();
            return Results.Json(
                new { error = $"Too many wrong admin keys. Try again in {Math.Max(1, (wait + 59) / 60)} min." },
                statusCode: StatusCodes.Status429TooManyRequests);
        }

        if (guard.KeyMatches(key)) return null;

        if (guard.RecordFailure(client, now))
            logger.LogWarning("Admin: {Client} locked out for {Minutes} min after {Count} wrong keys",
                client, AdminKeyGuard.Window.TotalMinutes, AdminKeyGuard.MaxFailures);
        else
            logger.LogInformation("Admin: wrong key from {Client}", client);
        return Results.Json(new { error = "That isn't this server's admin key." }, statusCode: 401);
    }

    // ── The signed-in account's admin status, and claiming admin with the key ──

    /// claimOffered: the dashboard offers "Make this account the admin" (a key is set and nobody
    /// is an admin yet). Claiming still works later with the key, for recovery.
    private static async Task<IResult> GetMe(ClaimsPrincipal caller, AppDbContext db, AdminKeyGuard? guard)
    {
        var userId = caller.GetUserId();
        var isAdmin = await db.Users.AnyAsync(u => u.Id == userId && u.IsAdmin);
        var claimOffered = !isAdmin && guard is not null && !await db.Users.AnyAsync(u => u.IsAdmin);
        return Results.Ok(new { isAdmin, claimOffered });
    }

    private record ClaimRequest(string Key);

    private static async Task<IResult> Claim(
        ClaimRequest req, HttpContext http, AppDbContext db, IEmailSender email, AdminKeyGuard? guard, ILogger logger)
    {
        if (guard is null)
            return Results.NotFound(new { error = "This server has no admin key set, so admin can't be claimed. Ask an existing admin." });
        if (CheckKey(guard, req.Key, http, logger) is { } refused) return refused;

        var user = await db.Users.FindAsync(http.User.GetUserId());
        if (user is null || user.IsSample) return Results.Forbid();
        if (user.IsAdmin) return Results.NoContent();

        user.IsAdmin = true;
        user.UpdatedAt = DateTime.UtcNow;
        AdminLog.Add(db, new AdminActor(user.Id, user.Username), "admin.claim", user);
        await db.SaveChangesAsync();
        logger.LogWarning("Admin: {Username} claimed admin with the admin key", user.Username);
        await AdminLog.NotifyAdminsAsync(db, email, logger,
            $"{user.Username} is now an admin of {http.Request.Host}",
            $"{user.Username} ({user.Email}) became an admin of {http.Request.Host} using the server's admin key.\n\nIf this wasn't you or someone you trust, remove them on the admin console and change ADMIN_KEY.\n");
        return Results.NoContent();
    }

    // ── Invites ─────────────────────────────────────────────────────────────

    private static async Task<IResult> GetInvites(AppDbContext db)
    {
        var now = DateTime.UtcNow;
        var invites = await db.Invites
            .OrderByDescending(i => i.CreatedAt)
            .Select(i => new
            {
                Invite = i,
                Users = i.Users.OrderBy(u => u.CreatedAt).Select(u => new { u.Id, u.Username }).ToList(),
            })
            .ToListAsync();
        return Results.Ok(invites.Select(x => new
        {
            x.Invite.Id,
            Code = Registration.Format(x.Invite.Code),
            x.Invite.Note,
            x.Invite.CreatedAt,
            x.Invite.ExpiresAt,
            x.Invite.MaxUses,
            x.Invite.UseCount,
            x.Invite.RevokedAt,
            Status = Registration.Status(x.Invite, now),
            UsedBy = x.Users,
        }));
    }

    private record CreateInviteRequest(string? Note, int? MaxUses, int? ExpiresInDays);

    private static async Task<IResult> CreateInvite(CreateInviteRequest req, AppDbContext db, HttpContext http)
    {
        var maxUses = req.MaxUses ?? 1;
        if (maxUses < 1 || maxUses > InviteLimits.MaxUses)
            return Results.BadRequest(new { error = $"Uses must be between 1 and {InviteLimits.MaxUses}." });
        if (req.ExpiresInDays is { } d && (d < 1 || d > InviteLimits.MaxDays))
            return Results.BadRequest(new { error = $"Expiry must be between 1 and {InviteLimits.MaxDays} days." });
        var note = string.IsNullOrWhiteSpace(req.Note) ? null : req.Note.Trim();
        if (note?.Length > InviteLimits.MaxNoteChars)
            return Results.BadRequest(new { error = $"Note is too long (max {InviteLimits.MaxNoteChars} characters)." });

        // A clash is about 1 in a trillion per existing code; try again rather than fail.
        string code;
        do code = Registration.NewCode(); while (await db.Invites.AnyAsync(i => i.Code == code));

        var invite = new Invite
        {
            Code = code,
            Note = note,
            MaxUses = maxUses,
            ExpiresAt = req.ExpiresInDays is { } days ? DateTime.UtcNow.AddDays(days) : null,
        };
        db.Invites.Add(invite);
        AdminLog.Add(db, http, "invite.create", detail: note is null ? Registration.Format(code) : $"{Registration.Format(code)} ({note})");
        await db.SaveChangesAsync();
        return Results.Ok(new { invite.Id, Code = Registration.Format(invite.Code), invite.ExpiresAt, invite.MaxUses });
    }

    private static async Task<IResult> RevokeInvite(Guid id, AppDbContext db, HttpContext http)
    {
        var invite = await db.Invites.FirstOrDefaultAsync(i => i.Id == id && i.RevokedAt == null);
        if (invite is null) return Results.NotFound(new { error = "Invite not found or already revoked." });
        invite.RevokedAt = DateTime.UtcNow;
        AdminLog.Add(db, http, "invite.revoke", detail: invite.Note is null ? Registration.Format(invite.Code) : $"{Registration.Format(invite.Code)} ({invite.Note})");
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> GetStats(AppDbContext db)
    {
        var userCount = await db.Users.CountAsync(u => !u.IsSample);
        var postCount = await db.Posts.CountAsync(p => p.DeletedAt == null);
        var activeTokens = await db.RefreshTokens.CountAsync(t => t.RevokedAt == null && t.ExpiresAt > DateTime.UtcNow);
        var workoutCount = await db.SyncedWorkoutSessions.CountAsync(s => s.DeletedAtMs == null);
        var diagnosticsCount = await db.DiagnosticReports.CountAsync();
        return Results.Ok(new { userCount, postCount, activeTokens, workoutCount, diagnosticsCount });
    }

    private static async Task<IResult> GetUsers(AppDbContext db, string? search = null, int page = 1, int pageSize = 100)
    {
        var query = db.Users.Where(u => !u.IsSample);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLowerInvariant();
            query = query.Where(u => u.Username.Contains(s) || u.Email.Contains(s) || u.DisplayName.Contains(s));
        }

        var total = await query.CountAsync();
        var users = await query
            .OrderByDescending(u => u.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(u => new
            {
                u.Id,
                u.Username,
                u.Email,
                u.DisplayName,
                Tier = u.Tier.ToString(),
                u.IsAdmin,
                u.CreatedAt,
                PostCount = u.Posts.Count(p => p.DeletedAt == null),
                FollowerCount = u.Followers.Count,
                FollowingCount = u.Following.Count,
                SessionCount = db.SyncedWorkoutSessions.Count(w => w.UserId == u.Id && w.DeletedAtMs == null),
                LastActive = db.SyncedWorkoutSessions
                    .Where(w => w.UserId == u.Id && w.DeletedAtMs == null)
                    .Max(w => (DateTime?)w.SyncedAt),
            })
            .ToListAsync();

        return Results.Ok(new { total, page, pageSize, users });
    }

    private static async Task<IResult> GetUser(Guid id, AppDbContext db)
    {
        var user = await db.Users
            .Where(u => u.Id == id)
            .Select(u => new
            {
                u.Id,
                u.Username,
                u.Email,
                u.DisplayName,
                u.Bio,
                u.AvatarUrl,
                Tier = u.Tier.ToString(),
                ManualTier = u.ManualTier.HasValue ? u.ManualTier.Value.ToString() : null,
                u.IsAdmin,
                u.CreatedAt,
                u.UpdatedAt,
                PostCount = u.Posts.Count(p => p.DeletedAt == null),
                FollowerCount = u.Followers.Count,
                FollowingCount = u.Following.Count,
                ActiveTokens = u.RefreshTokens.Count(t => t.RevokedAt == null && t.ExpiresAt > DateTime.UtcNow),
                SessionCount = db.SyncedWorkoutSessions.Count(w => w.UserId == id && w.DeletedAtMs == null),
                SplitCount = db.SyncedSplits.Count(sp => sp.UserId == id && sp.DeletedAtMs == null),
                ExerciseCount = db.SyncedExercises.Count(e => e.UserId == id && e.DeletedAtMs == null),
                LastActive = db.SyncedWorkoutSessions
                    .Where(w => w.UserId == id && w.DeletedAtMs == null)
                    .Max(w => (DateTime?)w.SyncedAt),
            })
            .FirstOrDefaultAsync();

        if (user is null) return Results.NotFound();

        // Fetched as separate queries rather than nested in the projection above — SQLite's
        // EF provider can't translate multiple ORDER BY + Take/collection subqueries combined
        // into one query (needs CROSS APPLY, which SQLite doesn't support).
        var recentPosts = await db.Posts
            .Where(p => p.AuthorId == id && p.DeletedAt == null)
            .OrderByDescending(p => p.CreatedAt)
            .Take(10)
            .Select(p => new { p.Id, Type = p.Type.ToString(), p.Body, p.CreatedAt, LikeCount = p.Likes.Count, CommentCount = p.Comments.Count })
            .ToListAsync();

        var coachingClients = await db.CoachClientRelationships
            .Where(r => r.CoachId == id)
            .OrderByDescending(r => r.UpdatedAt)
            .Select(r => new { r.Id, UserId = r.Client.Id, r.Client.Username, r.Client.DisplayName, Status = r.Status.ToString() })
            .ToListAsync();

        var coaches = await db.CoachClientRelationships
            .Where(r => r.ClientId == id)
            .OrderByDescending(r => r.UpdatedAt)
            .Select(r => new { r.Id, UserId = r.Coach.Id, r.Coach.Username, r.Coach.DisplayName, Status = r.Status.ToString() })
            .ToListAsync();

        var subscriptions = await db.BillingSubscriptions
            .Where(s => s.UserId == id)
            .OrderByDescending(s => s.UpdatedAt)
            .Select(s => new { Source = s.Source.ToString(), Plan = s.Plan.ToString(), State = s.State.ToString(), s.ExpiresAt, s.AutoRenewing, s.IsTest, s.ProductId })
            .ToListAsync();

        var adminActions = await db.AdminActions
            .Where(a => a.TargetUserId == id || a.ActorUserId == id)
            .OrderByDescending(a => a.CreatedAt)
            .Take(50)
            .ToListAsync();

        return Results.Ok(new { user.Id, user.Username, user.Email, user.DisplayName, user.Bio, user.AvatarUrl, user.Tier, user.ManualTier, user.IsAdmin, AdminActions = adminActions, Subscriptions = subscriptions, user.CreatedAt, user.UpdatedAt, user.PostCount, user.FollowerCount, user.FollowingCount, user.ActiveTokens, user.SessionCount, user.SplitCount, user.ExerciseCount, user.LastActive, RecentPosts = recentPosts, CoachingClients = coachingClients, Coaches = coaches });
    }

    private record UpdateUserRequest(string? DisplayName, string? Email, string? Bio, string? Tier, bool? IsAdmin);

    private static async Task<IResult> UpdateUser(
        Guid id, UpdateUserRequest req, AppDbContext db, HttpContext http, IEmailSender email, ILoggerFactory loggerFactory)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return Results.NotFound();
        var changed = new List<string>();
        bool? adminChange = null;
        if (req.IsAdmin is { } makeAdmin && makeAdmin != user.IsAdmin)
        {
            if (user.IsSample) return Results.BadRequest(new { error = "Sample clients can't be admins." });
            if (!makeAdmin && await IsLastAdminAsync(db, user))
                return Results.Conflict(new { error = "This is the only admin. Make someone else an admin first." });
            user.IsAdmin = makeAdmin;
            adminChange = makeAdmin;
            AdminLog.Add(db, http, makeAdmin ? "admin.grant" : "admin.remove", user);
        }

        if (req.DisplayName is not null && req.DisplayName.Trim() != user.DisplayName) { user.DisplayName = req.DisplayName.Trim(); changed.Add("display name"); }
        if (req.Bio is not null && req.Bio.Trim() != (user.Bio ?? "")) { user.Bio = req.Bio.Trim(); changed.Add("bio"); }
        if (req.Email is not null)
        {
            var newEmail = req.Email.Trim().ToLowerInvariant();
            if (await db.Users.AnyAsync(u => u.Email == newEmail && u.Id != id))
                return Results.Conflict(new { error = "Email already in use." });
            if (newEmail != user.Email) changed.Add("email");
            user.Email = newEmail;
        }
        // The admin page grants a plan by hand (ManualTier). A paid subscription still counts on
        // top of it, so setting Free here never takes away a plan someone is paying for.
        if (req.Tier is not null && Enum.TryParse<UserTier>(req.Tier, out var tier))
        {
            var manual = tier == UserTier.Free ? (UserTier?)null : tier;
            if (manual != user.ManualTier) changed.Add($"plan given to {tier}");
            user.ManualTier = manual;
            await Entitlements.RecomputeAsync(db, user, DateTime.UtcNow);
        }

        if (changed.Count > 0) AdminLog.Add(db, http, "user.update", user, string.Join(", ", changed));
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        if (adminChange is { } nowAdmin)
        {
            var by = AdminLog.Actor(http).Name;
            await AdminLog.NotifyAdminsAsync(db, email, loggerFactory.CreateLogger("Logit.Admin"),
                nowAdmin ? $"{user.Username} is now an admin of {http.Request.Host}" : $"{user.Username} is no longer an admin of {http.Request.Host}",
                nowAdmin
                    ? $"{by} made {user.Username} ({user.Email}) an admin of {http.Request.Host}.\n"
                    : $"{by} removed {user.Username} ({user.Email}) as an admin of {http.Request.Host}.\n",
                alsoTo: user);
        }
        return Results.NoContent();
    }

    /// Never leave a server with no admin account. (ADMIN_KEY can still claim one, but on
    /// getlogit.app the key is meant to be removed once an admin exists.)
    private static async Task<bool> IsLastAdminAsync(AppDbContext db, User user) =>
        user.IsAdmin && !await db.Users.AnyAsync(u => u.IsAdmin && u.Id != user.Id);

    private static async Task<IResult> DeleteUser(Guid id, AppDbContext db, HttpContext http)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return Results.NotFound();
        if (await IsLastAdminAsync(db, user))
            return Results.Conflict(new { error = "This is the only admin. Make someone else an admin first." });
        await Sandbox.SandboxEndpoints.RemoveAllAsync(db, user.Id);
        db.Users.Remove(user);
        AdminLog.Add(db, http, "user.delete", user, user.Email);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> RevokeTokens(Guid id, AppDbContext db, HttpContext http)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return Results.NotFound();
        var tokens = await db.RefreshTokens
            .Where(t => t.UserId == id && t.RevokedAt == null)
            .ToListAsync();
        var now = DateTime.UtcNow;
        foreach (var t in tokens) t.RevokedAt = now;
        AdminLog.Add(db, http, "user.sign-out", user, $"{tokens.Count} sessions");
        await db.SaveChangesAsync();
        return Results.Ok(new { revokedCount = tokens.Count });
    }

    private static async Task<IResult> GetReports(AppDbContext db, string status = "Open")
    {
        var query = db.Reports.AsQueryable();
        if (Enum.TryParse<ReportStatus>(status, ignoreCase: true, out var s))
            query = query.Where(r => r.Status == s);

        var reports = await query
            .OrderByDescending(r => r.CreatedAt)
            .Take(200)
            .Select(r => new
            {
                r.Id,
                TargetType = r.TargetType.ToString(),
                r.TargetId,
                Reason = r.Reason.ToString(),
                r.Note,
                Status = r.Status.ToString(),
                r.CreatedAt,
                Reporter = new { r.Reporter.Id, r.Reporter.Username, r.Reporter.DisplayName },
            })
            .ToListAsync();

        // Target previews, fetched per type.
        var postIds = await db.Reports.Where(r => r.TargetType == ReportTargetType.Post).Select(r => r.TargetId).ToListAsync();
        var previews = new Dictionary<Guid, object>();
        foreach (var p in await db.Posts.Where(p => postIds.Contains(p.Id))
                     .Select(p => new { p.Id, p.Body, p.DeletedAt, Author = p.Author.Username }).ToListAsync())
            previews[p.Id] = new { kind = "post", p.Body, deleted = p.DeletedAt != null, p.Author };

        var commentIds = await db.Reports.Where(r => r.TargetType == ReportTargetType.Comment).Select(r => r.TargetId).ToListAsync();
        foreach (var c in await db.Comments.Where(c => commentIds.Contains(c.Id))
                     .Select(c => new { c.Id, c.Body, c.DeletedAt, Author = c.Author.Username }).ToListAsync())
            previews[c.Id] = new { kind = "comment", c.Body, deleted = c.DeletedAt != null, c.Author };

        return Results.Ok(new { reports, previews });
    }

    private record ResolveReportRequest(string Action); // dismiss | delete-target

    private static async Task<IResult> ResolveReport(Guid id, ResolveReportRequest req, AppDbContext db, HttpContext http)
    {
        var report = await db.Reports.FindAsync(id);
        if (report is null) return Results.NotFound();

        var now = DateTime.UtcNow;

        if (req.Action == "delete-target")
        {
            switch (report.TargetType)
            {
                case ReportTargetType.Post:
                    var post = await db.Posts.FindAsync(report.TargetId);
                    if (post is not null) post.DeletedAt = now;
                    break;
                case ReportTargetType.Comment:
                    var comment = await db.Comments.FindAsync(report.TargetId);
                    if (comment is not null) comment.DeletedAt = now;
                    break;
            }
            report.Status = ReportStatus.Actioned;
        }
        else
        {
            report.Status = ReportStatus.Dismissed;
        }

        report.ReviewedAt = now;
        // Close any sibling open reports on the same target.
        var siblings = await db.Reports
            .Where(r => r.Id != id && r.Status == ReportStatus.Open
                     && r.TargetType == report.TargetType && r.TargetId == report.TargetId)
            .ToListAsync();
        foreach (var sib in siblings) { sib.Status = report.Status; sib.ReviewedAt = now; }

        AdminLog.Add(db, http, report.Status == ReportStatus.Actioned ? "report.delete-target" : "report.dismiss",
            detail: $"{report.TargetType} {report.TargetId}, reported as {report.Reason}");
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private record AdminResetPasswordRequest(string NewPassword);

    /// <summary>Self-host fallback for password resets when SMTP isn't configured — lets an
    /// admin set a user's password directly via the admin panel/API.</summary>
    private static async Task<IResult> ResetPassword(Guid id, AdminResetPasswordRequest req, AppDbContext db, HttpContext http)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return Results.NotFound();

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        user.UpdatedAt = DateTime.UtcNow;
        AdminLog.Add(db, http, "user.reset-password", user);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }
}
