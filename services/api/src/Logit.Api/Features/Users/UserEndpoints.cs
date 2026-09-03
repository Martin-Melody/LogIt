using System.Security.Claims;
using Logit.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Users;

public static class UserEndpoints
{
    public static void MapUserEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/users").WithTags("Users");

        group.MapGet("/me", GetMe).RequireAuthorization();
        group.MapPatch("/me", UpdateMe).RequireAuthorization();
        group.MapGet("/search", SearchUsers).RequireAuthorization();
        group.MapGet("/{username}", GetProfile);
    }

    private static async Task<IResult> GetMe(ClaimsPrincipal caller, AppDbContext db)
    {
        var userId = caller.GetUserId();
        var user = await db.Users.FindAsync(userId);
        if (user is null) return Results.NotFound();

        var followerCount = await db.Follows.CountAsync(f => f.FollowedId == userId);
        var followingCount = await db.Follows.CountAsync(f => f.FollowerId == userId);

        return Results.Ok(user.ToProfileDto(isSelf: true, followerCount, followingCount));
    }

    private static async Task<IResult> UpdateMe(
        [FromBody] UpdateProfileRequest req,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var userId = caller.GetUserId();
        var user = await db.Users.FindAsync(userId);
        if (user is null) return Results.NotFound();

        if (req.DisplayName is not null) user.DisplayName = req.DisplayName.Trim();
        if (req.Bio is not null) user.Bio = req.Bio.Trim();
        if (req.AvatarUrl is not null) user.AvatarUrl = req.AvatarUrl;
        if (req.PublicProfileJson is not null) user.PublicProfileJson = req.PublicProfileJson;
        if (req.OnboardingCompleted is not null) user.OnboardingCompleted = req.OnboardingCompleted.Value;
        user.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();

        var followerCount = await db.Follows.CountAsync(f => f.FollowedId == userId);
        var followingCount = await db.Follows.CountAsync(f => f.FollowerId == userId);

        return Results.Ok(user.ToProfileDto(isSelf: true, followerCount, followingCount));
    }

    private static async Task<IResult> SearchUsers(
        string? q,
        AppDbContext db,
        ClaimsPrincipal caller,
        int limit = 20)
    {
        if (string.IsNullOrWhiteSpace(q) || q.Trim().Length < 2)
            return Results.Ok(Array.Empty<object>());

        var callerId = caller.GetUserId();
        var search = q.Trim().ToLowerInvariant();

        var blocked = await db.Blocks
            .Where(b => b.BlockerId == callerId || b.BlockedId == callerId)
            .Select(b => b.BlockerId == callerId ? b.BlockedId : b.BlockerId)
            .ToListAsync();

        var results = await db.Users
            .Where(u => u.Id != callerId && !blocked.Contains(u.Id) && (
                u.Username.Contains(search) ||
                u.DisplayName.Contains(search)))
            .OrderBy(u => u.Username.StartsWith(search) ? 0 : 1)
            .ThenBy(u => u.Username)
            .Take(Math.Min(limit, 30))
            .Select(u => new
            {
                u.Id,
                u.Username,
                u.DisplayName,
                u.AvatarUrl,
                FollowerCount = u.Followers.Count,
                IsFollowing = u.Followers.Any(f => f.FollowerId == callerId),
            })
            .ToListAsync();

        return Results.Ok(results);
    }

    private static async Task<IResult> GetProfile(string username, AppDbContext db, ClaimsPrincipal caller)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Username == username.ToLowerInvariant());
        if (user is null) return Results.NotFound();

        var followerCount = await db.Follows.CountAsync(f => f.FollowedId == user.Id);
        var followingCount = await db.Follows.CountAsync(f => f.FollowerId == user.Id);

        var isSelf = false;
        var isFollowing = false;

        if (caller.Identity?.IsAuthenticated == true)
        {
            var callerId = caller.GetUserId();
            isSelf = callerId == user.Id;
            if (!isSelf)
            {
                if (await db.Blocks.AnyAsync(b =>
                        (b.BlockerId == callerId && b.BlockedId == user.Id) ||
                        (b.BlockerId == user.Id && b.BlockedId == callerId)))
                    return Results.NotFound();
                isFollowing = await db.Follows.AnyAsync(f => f.FollowerId == callerId && f.FollowedId == user.Id);
            }
        }

        return Results.Ok(user.ToProfileDto(isSelf, followerCount, followingCount, isFollowing));
    }
}

public record UpdateProfileRequest(string? DisplayName, string? Bio, string? AvatarUrl, string? PublicProfileJson, bool? OnboardingCompleted);
