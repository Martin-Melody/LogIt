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
        return Results.Ok(new { userCount, postCount, activeTokens });
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
                RecentPosts = u.Posts
                    .Where(p => p.DeletedAt == null)
                    .OrderByDescending(p => p.CreatedAt)
                    .Take(10)
                    .Select(p => new { p.Id, Type = p.Type.ToString(), p.Body, p.CreatedAt, LikeCount = p.Likes.Count, CommentCount = p.Comments.Count })
                    .ToList(),
            })
            .FirstOrDefaultAsync();

        if (user is null) return Results.NotFound();
        return Results.Ok(user);
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
}
