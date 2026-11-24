using System.Security.Claims;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Push;

/// The phone's push token and the caller's push choices (Settings › Notifications), plus the
/// relay that lets self-hosted servers push through getlogit.app.
public static class PushEndpoints
{
    public const string RelayRateLimitPolicy = "push-relay";

    public static void MapPushEndpoints(this IEndpointRouteBuilder app)
    {
        var me = app.MapGroup("/push").WithTags("Push").RequireAuthorization();
        me.MapPut("/devices", RegisterDevice);
        me.MapPost("/devices/remove", RemoveDevice);
        me.MapGet("/settings", GetSettings);
        me.MapPut("/settings", UpdateSettings);

        app.MapPost("/push/relay", Relay).WithTags("Push").AllowAnonymous().RequireRateLimiting(RelayRateLimitPolicy);
    }

    public record DeviceRequest(string Token, string? Platform, string? TimeZone);

    /// Called on every app start while signed in. A token already held by another account moves
    /// here: the phone now belongs to whoever signed in last.
    private static async Task<IResult> RegisterDevice([FromBody] DeviceRequest req, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        if (string.IsNullOrWhiteSpace(req.Token) || req.Token.Length > 512) return Results.BadRequest(new { error = "A push token is needed." });
        var userId = caller.GetUserId();
        var now = clock.GetUtcNow().UtcDateTime;
        var zone = req.TimeZone is { Length: > 0 and <= 64 } z && TimeZoneInfo.TryFindSystemTimeZoneById(z, out _) ? z : null;

        // The app can send the same new token twice at once (start and coming to the front, both
        // retried after a token refresh). The one that loses the race on the unique token (or the
        // user's settings row) finds the other's rows on its next try and updates them.
        for (var attempt = 1; ; attempt++)
        {
            var device = await db.PushDevices.SingleOrDefaultAsync(d => d.Token == req.Token);
            if (device is null) db.PushDevices.Add(device = new PushDevice { Token = req.Token, CreatedAt = now });
            device.UserId = userId;
            device.Platform = req.Platform is "android" or "ios" ? req.Platform : "android";
            device.LastSeenAt = now;
            if (zone is not null) (await SettingsFor(db, userId)).TimeZone = zone;
            try
            {
                await db.SaveChangesAsync();
                return Results.NoContent();
            }
            catch (DbUpdateException) when (attempt < 3)
            {
                db.ChangeTracker.Clear();
            }
        }
    }

    public record RemoveDeviceRequest(string Token);

    /// On sign-out, so the next person on this phone doesn't get the last one's pushes.
    private static async Task<IResult> RemoveDevice([FromBody] RemoveDeviceRequest req, ClaimsPrincipal caller, AppDbContext db)
    {
        var userId = caller.GetUserId();
        await db.PushDevices.Where(d => d.Token == req.Token && d.UserId == userId).ExecuteDeleteAsync();
        return Results.NoContent();
    }

    public record PushSettingsDto(
        bool Available, PushAudience Likes, PushAudience Comments, bool Follows, bool Messages, bool Coaching,
        DateTime? PausedUntil, bool QuietOn, int QuietFromMinute, int QuietToMinute, int QuietDays, string TimeZone);

    /// Every field optional: only the ones sent change. Send `resume: true` to end a pause.
    public record UpdatePushSettingsRequest(
        PushAudience? Likes, PushAudience? Comments, bool? Follows, bool? Messages, bool? Coaching,
        DateTime? PausedUntil, bool? Resume, bool? QuietOn, int? QuietFromMinute, int? QuietToMinute, int? QuietDays);

    private static PushSettingsDto ToDto(PushSettings s, bool available, DateTime now) => new(
        available, s.Likes, s.Comments, s.Follows, s.Messages, s.Coaching,
        s.PausedUntil > now ? DateTime.SpecifyKind(s.PausedUntil.Value, DateTimeKind.Utc) : null,
        s.QuietOn, s.QuietFromMinute, s.QuietToMinute, s.QuietDays, s.TimeZone);

    private static async Task<PushSettings> SettingsFor(AppDbContext db, Guid userId)
    {
        var s = await db.PushSettings.FindAsync(userId);
        if (s is null) db.PushSettings.Add(s = new PushSettings { UserId = userId });
        return s;
    }

    private static async Task<IResult> GetSettings(ClaimsPrincipal caller, AppDbContext db, IPushSender sender, TimeProvider clock)
    {
        var s = await db.PushSettings.FindAsync(caller.GetUserId()) ?? new PushSettings();
        return Results.Ok(ToDto(s, sender.IsConfigured, clock.GetUtcNow().UtcDateTime));
    }

    private static async Task<IResult> UpdateSettings(
        [FromBody] UpdatePushSettingsRequest req, ClaimsPrincipal caller, AppDbContext db, IPushSender sender, TimeProvider clock)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        if (req.PausedUntil is { } until && (until.ToUniversalTime() <= now || until.ToUniversalTime() > now.AddDays(1)))
            return Results.BadRequest(new { error = "A pause can last up to a day." });
        if (req.QuietFromMinute is < 0 or >= 1440 || req.QuietToMinute is < 0 or >= 1440 || req.QuietDays is < 0 or > 127)
            return Results.BadRequest(new { error = "That quiet time isn't valid." });
        foreach (var a in new[] { req.Likes, req.Comments })
            if (a is { } v && !Enum.IsDefined(v)) return Results.BadRequest(new { error = "Unknown choice." });

        var s = await SettingsFor(db, caller.GetUserId());
        if (req.Likes is { } likes) s.Likes = likes;
        if (req.Comments is { } comments) s.Comments = comments;
        if (req.Follows is { } follows) s.Follows = follows;
        if (req.Messages is { } messages) s.Messages = messages;
        if (req.Coaching is { } coaching) s.Coaching = coaching;
        if (req.PausedUntil is { } pause) s.PausedUntil = pause.ToUniversalTime();
        if (req.Resume == true) s.PausedUntil = null;
        if (req.QuietOn is { } quiet) s.QuietOn = quiet;
        if (req.QuietFromMinute is { } from) s.QuietFromMinute = from;
        if (req.QuietToMinute is { } to) s.QuietToMinute = to;
        if (req.QuietDays is { } days) s.QuietDays = days;
        await db.SaveChangesAsync();
        return Results.Ok(ToDto(s, sender.IsConfigured, now));
    }

    /// For self-hosted servers: passes a push on to Firebase with this server's key. Only on when
    /// Push:AcceptRelay is set (getlogit.app). Nothing is stored; only the token and text pass through.
    private static async Task<IResult> Relay([FromBody] RelayRequest req, IConfiguration config, IPushSender sender, CancellationToken ct)
    {
        if (!config.GetValue<bool>("Push:AcceptRelay") || sender is not FcmPushSender { IsConfigured: true }) return Results.NotFound();
        if (string.IsNullOrWhiteSpace(req.Token) || req.Token.Length > 512
            || string.IsNullOrWhiteSpace(req.Title) || req.Title.Length > 120
            || string.IsNullOrWhiteSpace(req.Body) || req.Body.Length > 240
            || req.Channel is not ("social" or "coaching" or "messages")
            || req.Data is { Count: > 8 } || req.Data?.Any(kv => kv.Key.Length > 40 || kv.Value.Length > 200) == true)
            return Results.BadRequest();
        var result = await sender.SendAsync(req.Token, new PushMessage(req.Title, req.Body, req.Channel, req.Data ?? []), ct);
        return result switch
        {
            PushResult.Sent => Results.NoContent(),
            PushResult.BadToken => Results.StatusCode(StatusCodes.Status410Gone),
            _ => Results.StatusCode(StatusCodes.Status502BadGateway),
        };
    }
}
