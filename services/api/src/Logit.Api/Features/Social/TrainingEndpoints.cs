using System.Security.Claims;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Social;

/// "Training now" and cheers (friends overhaul, design canvas T1–T2). Training now is
/// Instagram's activity status: someone's green dot shows to the accounts they follow, only
/// while both have "Show when you're training" on, never across a block. A cheer works like a
/// story reaction: anyone who can see you training can send one, if your "Cheers and replies"
/// allows it.
public static class TrainingEndpoints
{
    /// The phone refreshes training now every few minutes while a workout runs; a phone that
    /// went quiet (closed, crashed) stops showing after this.
    public static readonly TimeSpan Freshness = TimeSpan.FromMinutes(20);

    public static void MapTrainingEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/training").WithTags("Social").RequireAuthorization();
        g.MapPut("/now", Start);
        g.MapDelete("/now", Stop);
        g.MapGet("/now", WhoIsTraining);
        g.MapPost("/{username}/cheer", Cheer).RequireRateLimiting("social-write");
    }

    public record TrainingRequest(string? What);
    public record TrainingFriendDto(Guid Id, string Username, string DisplayName, string? AvatarUrl, string? What, DateTime Since);

    /// The accounts `viewerId` may see training now.
    public static IQueryable<User> VisibleTrainers(AppDbContext db, Guid viewerId, DateTime now) =>
        db.Users.Where(u => u.TrainingUntil > now && u.ShowTraining && !u.IsSample && u.Id != viewerId
            && db.Follows.Any(f => f.FollowerId == u.Id && f.FollowedId == viewerId)
            && !db.Blocks.Any(b => (b.BlockerId == u.Id && b.BlockedId == viewerId) || (b.BlockerId == viewerId && b.BlockedId == u.Id))
            && db.Users.Any(v => v.Id == viewerId && v.ShowTraining));

    private static async Task<IResult> Start([FromBody] TrainingRequest req, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        var user = await db.Users.FindAsync(caller.GetUserId());
        if (user is null) return Results.NotFound();
        var now = clock.GetUtcNow().UtcDateTime;
        if (!(user.TrainingUntil > now)) user.TrainingSince = now;
        user.TrainingUntil = now + Freshness;
        user.TrainingWhat = req.What?.Trim() is { Length: > 0 } w ? w[..Math.Min(w.Length, 60)] : null;
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> Stop(ClaimsPrincipal caller, AppDbContext db)
    {
        var user = await db.Users.FindAsync(caller.GetUserId());
        if (user is null) return Results.NotFound();
        user.TrainingUntil = null;
        user.TrainingSince = null;
        user.TrainingWhat = null;
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> WhoIsTraining(ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var list = await VisibleTrainers(db, caller.GetUserId(), now)
            .OrderBy(u => u.TrainingSince)
            .Select(u => new TrainingFriendDto(u.Id, u.Username, u.DisplayName, u.AvatarUrl, u.TrainingWhat, u.TrainingSince ?? now))
            .Take(100)
            .ToListAsync();
        return Results.Ok(list.Select(t => t with { Since = DateTime.SpecifyKind(t.Since, DateTimeKind.Utc) }));
    }

    /// One cheer per person per workout reaches the trainee (a second tap changes nothing), so a
    /// friend tapping again doesn't buzz them twice.
    private static async Task<IResult> Cheer(string username, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        var me = caller.GetUserId();
        var now = clock.GetUtcNow().UtcDateTime;
        var target = await VisibleTrainers(db, me, now).FirstOrDefaultAsync(u => u.Username == username.ToLowerInvariant());
        if (target is null) return Results.NotFound(new { error = "They're not training now." });
        if (target.CheersFrom == CheersFrom.Off) return Results.Json(new { error = "They've turned cheers off." }, statusCode: StatusCodes.Status403Forbidden);

        var already = await db.Notifications.AnyAsync(n => n.UserId == target.Id && n.ActorId == me
            && n.Type == NotificationType.Cheer && n.CreatedAt >= target.TrainingSince);
        if (!already)
        {
            db.Notifications.Add(new Notification { UserId = target.Id, ActorId = me, Type = NotificationType.Cheer, CreatedAt = now });
            await db.SaveChangesAsync();
        }
        return Results.NoContent();
    }
}
