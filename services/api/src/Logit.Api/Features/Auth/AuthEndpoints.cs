using System.Security.Claims;
using System.Security.Cryptography;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Email;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Auth;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/auth").WithTags("Auth");

        group.MapPost("/register", Register).RequireRateLimiting(Registration.RateLimitPolicy);
        group.MapGet("/registration", GetRegistrationInfo);
        group.MapPost("/login", Login);
        group.MapPost("/refresh", Refresh);
        group.MapPost("/revoke", Revoke).RequireAuthorization();
        group.MapDelete("/account", DeleteAccount).RequireAuthorization();
        group.MapPost("/change-password", ChangePassword).RequireAuthorization();
        group.MapPost("/forgot-password", ForgotPassword);
        group.MapPost("/reset-password", ResetPassword);
        PairingEndpoints.Map(group);
        SessionEndpoints.Map(group);
    }

    private static async Task<IResult> Register(
        [FromBody] RegisterRequest req,
        AppDbContext db,
        TokenService tokens,
        IConfiguration config,
        HttpRequest httpRequest)
    {
        var normalizedUsername = req.Username.Trim().ToLowerInvariant();
        var normalizedEmail = req.Email.Trim().ToLowerInvariant();

        if (await db.Users.AnyAsync(u => u.Username == normalizedUsername))
            return Results.Conflict(new { error = "Username already taken." });

        if (await db.Users.AnyAsync(u => u.Email == normalizedEmail))
            return Results.Conflict(new { error = "Email already registered." });

        Guid? inviteId = null;
        if (await Registration.GetModeAsync(db, config) == RegistrationMode.Invite)
        {
            if (string.IsNullOrWhiteSpace(req.InviteCode))
                return Results.Json(
                    new { error = "This server is invite-only. Ask its admin for an invite code.", code = "invite_required" },
                    statusCode: StatusCodes.Status403Forbidden);
            inviteId = await Registration.TryClaimAsync(db, req.InviteCode, DateTime.UtcNow);
            if (inviteId is null)
                return Results.Json(
                    new { error = "That invite code isn't valid, has expired or has been used up.", code = "invite_invalid" },
                    statusCode: StatusCodes.Status403Forbidden);
        }

        var user = new User
        {
            Username = normalizedUsername,
            Email = normalizedEmail,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            DisplayName = req.DisplayName.Trim(),
            InviteId = inviteId,
            // New accounts start in Discover (they can turn it off in Social settings); older
            // accounts are asked once, see User.ShowInDiscover.
            ShowInDiscover = true,
        };

        // The phone signing in holds a Free account's backup from now on (FreeBackup).
        Sync.FreeBackup.MoveTo(user, httpRequest.Headers[Sync.FreeBackup.DeviceHeader]);
        var refresh = tokens.CreateRefreshToken(user.Id, DeviceLabel.From(httpRequest));
        user.RefreshTokens.Add(refresh);

        db.Users.Add(user);
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException) when (inviteId is { } id)
        {
            // e.g. someone took the username a moment ago: give the invite's use back.
            await Registration.ReleaseAsync(db, id);
            throw;
        }

        return Results.Ok(BuildAuthResponse(user, refresh, tokens, config));
    }

    private static async Task<IResult> GetRegistrationInfo(IConfiguration config, AppDbContext db) =>
        Results.Ok(new RegistrationInfo(
            Registration.ModeName(await Registration.GetModeAsync(db, config)),
            config.GetValue<bool>("Deployment:SelfHosted")));

    /// The same answer for an unknown account and a wrong password, so sign-in can't be used to
    /// find out which usernames or emails exist. It carries a message: over HTTP/2 a bare 401 has
    /// no status text, and the app had nothing to show.
    private static IResult WrongCredentials() =>
        Results.Json(
            new { error = "That username or password isn't right.", code = "invalid_credentials" },
            statusCode: StatusCodes.Status401Unauthorized);

    private static async Task<IResult> Login(
        [FromBody] LoginRequest req,
        AppDbContext db,
        TokenService tokens,
        IConfiguration config,
        ILoggerFactory loggerFactory,
        HttpRequest httpRequest)
    {
        var identifier = req.UsernameOrEmail.Trim().ToLowerInvariant();
        var user = await db.Users.FirstOrDefaultAsync(u =>
            u.Username == identifier || u.Email == identifier);

        // The response doesn't say which one it was; the log does, for "I can't sign in" help.
        // The typed identifier isn't logged (it may be an email address).
        // Sandbox sample clients have no password anyone knows; nobody signs in as one.
        if (user is null || user.IsSample)
        {
            loggerFactory.CreateLogger("Logit.Auth").LogInformation("Login failed: no such account");
            return WrongCredentials();
        }
        if (!BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
        {
            loggerFactory.CreateLogger("Logit.Auth").LogInformation("Login failed: wrong password for user {UserId}", user.Id);
            return WrongCredentials();
        }

        // Other devices keep their tokens: signing in on a second phone must not sign the
        // first one out. Every token is revoked only on a password reset (ResetPassword).
        // The phone signing in holds a Free account's backup from now on (FreeBackup).
        Sync.FreeBackup.MoveTo(user, httpRequest.Headers[Sync.FreeBackup.DeviceHeader]);
        var refresh = tokens.CreateRefreshToken(user.Id, DeviceLabel.From(httpRequest));
        db.RefreshTokens.Add(refresh);
        await db.SaveChangesAsync();

        return Results.Ok(BuildAuthResponse(user, refresh, tokens, config));
    }

    private static async Task<IResult> Refresh(
        [FromBody] RefreshRequest req,
        AppDbContext db,
        TokenService tokens,
        IConfiguration config,
        ILoggerFactory loggerFactory)
    {
        var stored = await db.RefreshTokens
            .Include(t => t.User)
            .FirstOrDefaultAsync(t => t.Token == req.RefreshToken);

        if (stored is null || !stored.IsActive)
        {
            var log = loggerFactory.CreateLogger("Logit.Auth");
            if (stored is null)
                log.LogInformation("Refresh rejected: unknown token");
            else if (stored.RevokedAt is not null)
                // Tokens rotate on every refresh, so reuse of a revoked one means two refreshes
                // raced on one device, or the token was copied. Either way the user is signed out.
                log.LogWarning("Refresh rejected: token for user {UserId} was already used or revoked at {RevokedAt:o}",
                    stored.UserId, stored.RevokedAt);
            else
                log.LogInformation("Refresh rejected: token for user {UserId} expired", stored.UserId);
            return Results.Unauthorized();
        }

        // Rotate: revoke old, issue new
        stored.RevokedAt = DateTime.UtcNow;
        var next = tokens.CreateRefreshToken(stored.UserId, previous: stored);
        db.RefreshTokens.Add(next);
        await db.SaveChangesAsync();

        return Results.Ok(BuildAuthResponse(stored.User, next, tokens, config));
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
        [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] DeleteAccountRequest? req,
        AppDbContext db,
        ClaimsPrincipal caller)
    {
        var userId = caller.GetUserId();
        var user = await db.Users.FindAsync(userId);
        if (user is null) return Results.NotFound();

        // Re-authenticate before destroying the account. This is a guardrail against
        // deleting the wrong account: a client whose displayed identity has drifted from
        // the token it actually holds (stale cache, cross-tab login) will send the
        // password for the account the user *thinks* they're on, which won't match this
        // token's user — so the delete is rejected instead of nuking someone else.
        if (string.IsNullOrEmpty(req?.Password))
            return Results.BadRequest(new { error = "Enter your password to delete your account." });

        if (!BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
            return Results.BadRequest(new { error = "Password is incorrect." });

        await Admin.AdminLog.ForgetAsync(db, user.Id);
        await Sandbox.SandboxEndpoints.RemoveAllAsync(db, user.Id);
        db.Users.Remove(user);
        await db.SaveChangesAsync();

        return Results.NoContent();
    }

    internal static AuthResponse BuildAuthResponse(User user, RefreshToken refresh, TokenService tokens, IConfiguration config) =>
        new(
            tokens.CreateAccessToken(user, sessionId: refresh.SessionKey),
            refresh.Token,
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
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == normalizedEmail && !u.IsSample);
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
