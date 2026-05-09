using System.Security.Claims;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Auth;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/auth").WithTags("Auth");

        group.MapPost("/register", Register);
        group.MapPost("/login", Login);
        group.MapPost("/refresh", Refresh);
        group.MapPost("/revoke", Revoke).RequireAuthorization();
        group.MapDelete("/account", DeleteAccount).RequireAuthorization();
    }

    private static async Task<IResult> Register(
        [FromBody] RegisterRequest req,
        AppDbContext db,
        TokenService tokens)
    {
        var normalizedUsername = req.Username.Trim().ToLowerInvariant();
        var normalizedEmail = req.Email.Trim().ToLowerInvariant();

        if (await db.Users.AnyAsync(u => u.Username == normalizedUsername))
            return Results.Conflict(new { error = "Username already taken." });

        if (await db.Users.AnyAsync(u => u.Email == normalizedEmail))
            return Results.Conflict(new { error = "Email already registered." });

        var user = new User
        {
            Username = normalizedUsername,
            Email = normalizedEmail,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            DisplayName = req.DisplayName.Trim(),
        };

        var refresh = tokens.CreateRefreshToken(user.Id);
        user.RefreshTokens.Add(refresh);

        db.Users.Add(user);
        await db.SaveChangesAsync();

        return Results.Ok(BuildAuthResponse(user, refresh.Token, tokens));
    }

    private static async Task<IResult> Login(
        [FromBody] LoginRequest req,
        AppDbContext db,
        TokenService tokens)
    {
        var identifier = req.UsernameOrEmail.Trim().ToLowerInvariant();
        var user = await db.Users.FirstOrDefaultAsync(u =>
            u.Username == identifier || u.Email == identifier);

        if (user is null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
            return Results.Unauthorized();

        var existing = await db.RefreshTokens
            .Where(t => t.UserId == user.Id && t.RevokedAt == null && t.ExpiresAt > DateTime.UtcNow)
            .ToListAsync();
        var now = DateTime.UtcNow;
        foreach (var t in existing) t.RevokedAt = now;

        var refresh = tokens.CreateRefreshToken(user.Id);
        db.RefreshTokens.Add(refresh);
        await db.SaveChangesAsync();

        return Results.Ok(BuildAuthResponse(user, refresh.Token, tokens));
    }

    private static async Task<IResult> Refresh(
        [FromBody] RefreshRequest req,
        AppDbContext db,
        TokenService tokens)
    {
        var stored = await db.RefreshTokens
            .Include(t => t.User)
            .FirstOrDefaultAsync(t => t.Token == req.RefreshToken);

        if (stored is null || !stored.IsActive)
            return Results.Unauthorized();

        // Rotate: revoke old, issue new
        stored.RevokedAt = DateTime.UtcNow;
        var next = tokens.CreateRefreshToken(stored.UserId);
        db.RefreshTokens.Add(next);
        await db.SaveChangesAsync();

        return Results.Ok(BuildAuthResponse(stored.User, next.Token, tokens));
    }

    private static async Task<IResult> Revoke(
        [FromBody] RevokeRequest req,
        AppDbContext db,
        ClaimsPrincipal caller)
    {
        var userId = caller.GetUserId();
        var stored = await db.RefreshTokens.FirstOrDefaultAsync(t =>
            t.Token == req.RefreshToken && t.UserId == userId);

        if (stored is null) return Results.NotFound();

        stored.RevokedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return Results.NoContent();
    }

    private static async Task<IResult> DeleteAccount(
        AppDbContext db,
        ClaimsPrincipal caller)
    {
        var userId = caller.GetUserId();
        var user = await db.Users.FindAsync(userId);
        if (user is null) return Results.NotFound();

        db.Users.Remove(user);
        await db.SaveChangesAsync();

        return Results.NoContent();
    }

    private static AuthResponse BuildAuthResponse(User user, string refreshToken, TokenService tokens) =>
        new(
            tokens.CreateAccessToken(user),
            refreshToken,
            new UserDto(user.Id, user.Username, user.DisplayName, user.AvatarUrl, user.Tier.ToString(), user.OnboardingCompleted)
        );
}
