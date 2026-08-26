using System.Security.Claims;
using System.Security.Cryptography;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Email;
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
        group.MapPost("/change-password", ChangePassword).RequireAuthorization();
        group.MapPost("/forgot-password", ForgotPassword);
        group.MapPost("/reset-password", ResetPassword);
    }

    private static async Task<IResult> Register(
        [FromBody] RegisterRequest req,
        AppDbContext db,
        TokenService tokens,
        IConfiguration config)
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

        return Results.Ok(BuildAuthResponse(user, refresh.Token, tokens, config));
    }

    private static async Task<IResult> Login(
        [FromBody] LoginRequest req,
        AppDbContext db,
        TokenService tokens,
        IConfiguration config)
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

        return Results.Ok(BuildAuthResponse(user, refresh.Token, tokens, config));
    }

    private static async Task<IResult> Refresh(
        [FromBody] RefreshRequest req,
        AppDbContext db,
        TokenService tokens,
        IConfiguration config)
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

        return Results.Ok(BuildAuthResponse(stored.User, next.Token, tokens, config));
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

    private static AuthResponse BuildAuthResponse(User user, string refreshToken, TokenService tokens, IConfiguration config) =>
        new(
            tokens.CreateAccessToken(user),
            refreshToken,
            new UserDto(user.Id, user.Username, user.DisplayName, user.AvatarUrl, user.Tier.ToString(), user.OnboardingCompleted),
            config.GetValue<bool>("Deployment:SelfHosted")
        );

    private static async Task<IResult> ChangePassword(
        [FromBody] ChangePasswordRequest req,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var userId = caller.GetUserId();
        var user = await db.Users.FindAsync(userId);
        if (user is null) return Results.NotFound();

        if (!BCrypt.Net.BCrypt.Verify(req.CurrentPassword, user.PasswordHash))
            return Results.BadRequest(new { error = "Current password is incorrect." });

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return Results.NoContent();
    }

    private static async Task<IResult> ForgotPassword(
        [FromBody] ForgotPasswordRequest req,
        AppDbContext db,
        IEmailSender email,
        IConfiguration config)
    {
        // Always return 200 regardless of whether the email matched — avoids leaking which
        // addresses have accounts.
        if (!email.IsConfigured)
            return Results.Ok(new { error = "Password reset by email isn't configured on this server. Contact your administrator." });

        var normalizedEmail = req.Email.Trim().ToLowerInvariant();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == normalizedEmail);
        if (user is null) return Results.Ok();

        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        db.PasswordResetTokens.Add(new PasswordResetToken
        {
            UserId = user.Id,
            Token = token,
            ExpiresAt = DateTime.UtcNow.AddHours(1),
        });
        await db.SaveChangesAsync();

        var webOrigin = config["Web:Origin"] ?? "http://localhost:3000";
        var resetUrl = $"{webOrigin}/reset-password?token={token}";
        await email.SendAsync(
            user.Email,
            "Reset your Logit password",
            $"Someone requested a password reset for your Logit account.\n\n" +
            $"Reset your password: {resetUrl}\n\n" +
            $"This link expires in 1 hour. If you didn't request this, you can ignore this email."
        );

        return Results.Ok();
    }

    private static async Task<IResult> ResetPassword(
        [FromBody] ResetPasswordRequest req,
        AppDbContext db)
    {
        var stored = await db.PasswordResetTokens
            .Include(t => t.User)
            .FirstOrDefaultAsync(t => t.Token == req.Token);

        if (stored is null || !stored.IsValid)
            return Results.BadRequest(new { error = "This reset link is invalid or has expired." });

        stored.User.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        stored.User.UpdatedAt = DateTime.UtcNow;
        stored.UsedAt = DateTime.UtcNow;

        // Force re-login everywhere, standard practice after a password reset.
        var activeTokens = await db.RefreshTokens
            .Where(t => t.UserId == stored.UserId && t.RevokedAt == null)
            .ToListAsync();
        var now = DateTime.UtcNow;
        foreach (var t in activeTokens) t.RevokedAt = now;

        await db.SaveChangesAsync();
        return Results.NoContent();
    }
}
