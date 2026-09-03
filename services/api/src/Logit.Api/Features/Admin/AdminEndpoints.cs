using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Admin;

public static class AdminEndpoints
{
    public static void MapAdminEndpoints(this IEndpointRouteBuilder app, IConfiguration config)
    {
        var adminKey = config["Admin:Key"];
        if (string.IsNullOrWhiteSpace(adminKey)) return; // admin disabled when no key is configured

        app.MapGet("/admin", () => Results.Content(AdminHtml.Page, "text/html")).ExcludeFromDescription();

        var api = app.MapGroup("/admin/api")
            .AddEndpointFilter(AdminKeyFilter(adminKey))
            .ExcludeFromDescription();

        api.MapGet("/stats", GetStats);
        api.MapGet("/users", GetUsers);
        api.MapGet("/users/{id:guid}", GetUser);
        api.MapPatch("/users/{id:guid}", UpdateUser);
        api.MapDelete("/users/{id:guid}", DeleteUser);
        api.MapDelete("/users/{id:guid}/tokens", RevokeTokens);
        api.MapPost("/users/{id:guid}/reset-password", ResetPassword);

        api.MapGet("/reports", GetReports);
        api.MapPost("/reports/{id:guid}/resolve", ResolveReport);
    }

    private static Func<EndpointFilterInvocationContext, EndpointFilterDelegate, ValueTask<object?>> AdminKeyFilter(string key) =>
        async (ctx, next) =>
        {
            var header = ctx.HttpContext.Request.Headers["X-Admin-Key"].FirstOrDefault();
            if (header != key) return Results.Json(new { error = "Unauthorized" }, statusCode: 401);
            return await next(ctx);
        };

    private static async Task<IResult> GetStats(AppDbContext db)
    {
        var userCount = await db.Users.CountAsync();
        var postCount = await db.Posts.CountAsync(p => p.DeletedAt == null);
        var activeTokens = await db.RefreshTokens.CountAsync(t => t.RevokedAt == null && t.ExpiresAt > DateTime.UtcNow);
        var workoutCount = await db.SyncedWorkoutSessions.CountAsync(s => s.DeletedAtMs == null);
        return Results.Ok(new { userCount, postCount, activeTokens, workoutCount });
    }

    private static async Task<IResult> GetUsers(AppDbContext db, string? search = null, int page = 1, int pageSize = 100)
    {
        var query = db.Users.AsQueryable();
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

        return Results.Ok(new { user.Id, user.Username, user.Email, user.DisplayName, user.Bio, user.AvatarUrl, user.Tier, user.CreatedAt, user.UpdatedAt, user.PostCount, user.FollowerCount, user.FollowingCount, user.ActiveTokens, user.SessionCount, user.SplitCount, user.ExerciseCount, user.LastActive, RecentPosts = recentPosts, CoachingClients = coachingClients, Coaches = coaches });
    }

    private record UpdateUserRequest(string? DisplayName, string? Email, string? Bio, string? Tier);

    private static async Task<IResult> UpdateUser(Guid id, UpdateUserRequest req, AppDbContext db)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return Results.NotFound();

        if (req.DisplayName is not null) user.DisplayName = req.DisplayName.Trim();
        if (req.Bio is not null) user.Bio = req.Bio.Trim();
        if (req.Email is not null)
        {
            var email = req.Email.Trim().ToLowerInvariant();
            if (await db.Users.AnyAsync(u => u.Email == email && u.Id != id))
                return Results.Conflict(new { error = "Email already in use." });
            user.Email = email;
        }
        if (req.Tier is not null && Enum.TryParse<UserTier>(req.Tier, out var tier))
            user.Tier = tier;

        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> DeleteUser(Guid id, AppDbContext db)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return Results.NotFound();
        db.Users.Remove(user);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> RevokeTokens(Guid id, AppDbContext db)
    {
        var tokens = await db.RefreshTokens
            .Where(t => t.UserId == id && t.RevokedAt == null)
            .ToListAsync();
        var now = DateTime.UtcNow;
        foreach (var t in tokens) t.RevokedAt = now;
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

    private static async Task<IResult> ResolveReport(Guid id, ResolveReportRequest req, AppDbContext db)
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

        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private record AdminResetPasswordRequest(string NewPassword);

    /// <summary>Self-host fallback for password resets when SMTP isn't configured — lets an
    /// admin set a user's password directly via the admin panel/API.</summary>
    private static async Task<IResult> ResetPassword(Guid id, AdminResetPasswordRequest req, AppDbContext db)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return Results.NotFound();

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Results.NoContent();
    }
}
