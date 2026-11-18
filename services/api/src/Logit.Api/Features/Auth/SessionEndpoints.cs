using System.Security.Claims;
using Logit.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Auth;

/// Account › Where you're signed in: one row per phone or browser, and signing one out.
/// A session is the chain of refresh tokens one device rotates through (RefreshToken.SessionId).
/// Signing one out revokes its refresh token; its current access token still works until it
/// runs out (Jwt:AccessTokenMinutes, 15 by default), then that device is signed out.
public static class SessionEndpoints
{
    public static void Map(RouteGroupBuilder auth)
    {
        auth.MapGet("/sessions", List).RequireAuthorization();
        auth.MapDelete("/sessions/{sessionId:guid}", SignOut).RequireAuthorization();
    }

    private static Guid? CurrentSession(ClaimsPrincipal caller) =>
        Guid.TryParse(caller.FindFirst(TokenService.SessionClaim)?.Value, out var sid) ? sid : null;

    private static async Task<IResult> List(ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var current = CurrentSession(caller);
        var now = DateTime.UtcNow;
        var active = await db.RefreshTokens.AsNoTracking()
            .Where(t => t.UserId == me && t.RevokedAt == null && t.ExpiresAt > now)
            .ToListAsync();
        var sessions = active
            .GroupBy(t => t.SessionKey)
            .Select(g =>
            {
                var latest = g.OrderByDescending(t => t.CreatedAt).First();
                return new
                {
                    id = g.Key,
                    label = latest.Label ?? "A device signed in before this list existed",
                    startedAt = latest.SessionStartedAt ?? g.Min(t => t.CreatedAt),
                    lastActiveAt = latest.CreatedAt,
                    current = current == g.Key,
                };
            })
            .OrderByDescending(s => s.current).ThenByDescending(s => s.lastActiveAt)
            .ToList();
        return Results.Ok(new { sessions });
    }

    private static async Task<IResult> SignOut(Guid sessionId, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var now = DateTime.UtcNow;
        var tokens = await db.RefreshTokens
            .Where(t => t.UserId == me && t.RevokedAt == null
                && (t.SessionId == sessionId || (t.SessionId == Guid.Empty && t.Id == sessionId)))
            .ToListAsync();
        if (tokens.Count == 0) return Results.NotFound();
        foreach (var t in tokens) t.RevokedAt = now;
        await db.SaveChangesAsync();
        return Results.NoContent();
    }
}
