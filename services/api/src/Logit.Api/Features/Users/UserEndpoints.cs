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
        group.MapGet("/{username}", GetProfile);
    }

    private static async Task<IResult> GetMe(ClaimsPrincipal caller, AppDbContext db)
    {
        var userId = caller.GetUserId();
        var user = await db.Users.FindAsync(userId);
        return user is null ? Results.NotFound() : Results.Ok(user.ToProfileDto(isSelf: true));
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
        user.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();
        return Results.Ok(user.ToProfileDto(isSelf: true));
    }

    private static async Task<IResult> GetProfile(string username, AppDbContext db)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Username == username.ToLowerInvariant());
        return user is null ? Results.NotFound() : Results.Ok(user.ToProfileDto(isSelf: false));
    }
}

public record UpdateProfileRequest(string? DisplayName, string? Bio, string? AvatarUrl);
