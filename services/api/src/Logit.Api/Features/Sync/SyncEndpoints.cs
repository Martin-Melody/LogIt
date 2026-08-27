using System.Security.Claims;
using System.Text.Json;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Sync;

public static class SyncEndpoints
{
    public static void MapSyncEndpoints(this IEndpointRouteBuilder app)
    {
        // Sync is a Pro/Studio feature — Free accounts (mobile-app social only) don't get
        // cross-device sync or the data it feeds (web dashboard, analytics).
        var group = app.MapGroup("/sync").WithTags("Sync").RequireAuthorization().RequireTier(UserTier.Pro);

        group.MapPost("/sessions", PushSessions);
        group.MapGet("/sessions", PullSessions);

        group.MapPost("/splits", PushSplits);
        group.MapGet("/splits", PullSplits);

        group.MapPost("/exercises", PushExercises);
        group.MapGet("/exercises", PullExercises);

        group.MapPost("/profile", PushProfile);
        group.MapGet("/profile", PullProfile);

        group.MapPost("/checkins", PushCheckinSubmissions);
        group.MapGet("/checkins", PullCheckinSubmissions);
    }

    // ── Sessions ─────────────────────────────────────────────────────────────

    private static async Task<IResult> PushSessions(
        [FromBody] PushSessionsRequest req,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var userId = caller.GetUserId();

        if (req.Sessions.Count == 0)
            return Results.NoContent();

        var clientIds = req.Sessions.Select(s => s.Id).ToList();
        var existing = await db.SyncedWorkoutSessions
            .Where(s => s.UserId == userId && clientIds.Contains(s.ClientId))
            .ToListAsync();
        var existingMap = existing.ToDictionary(s => s.ClientId);

        var toInsert = new List<SyncedWorkoutSession>();

        foreach (var dto in req.Sessions)
        {
            if (existingMap.TryGetValue(dto.Id, out var stored))
            {
                if (dto.DeletedAtMs.HasValue && stored.DeletedAtMs == null)
                {
                    stored.DeletedAtMs = dto.DeletedAtMs;
                    stored.DataJson = string.Empty;
                    stored.SyncedAt = DateTime.UtcNow;
                }
                else if (!dto.DeletedAtMs.HasValue && stored.DeletedAtMs == null)
                {
                    // Sessions carry no updatedAtMs — the pusher is always the owning
                    // account's own device, so the latest push wins outright. Without this,
                    // edits made after the first push (e.g. correcting a set after the
                    // workout finished) never reached the server, so a cloud restore would
                    // silently resurrect the stale first-synced version.
                    stored.StartedAtMs = dto.StartedAtMs;
                    stored.DataJson = dto.DataJson ?? string.Empty;
                    stored.SyncedAt = DateTime.UtcNow;
                }
            }
            else
            {
                toInsert.Add(new SyncedWorkoutSession
                {
                    ClientId = dto.Id,
                    UserId = userId,
                    StartedAtMs = dto.StartedAtMs,
                    DataJson = dto.DataJson ?? string.Empty,
                    DeletedAtMs = dto.DeletedAtMs,
                });
            }
        }

        if (toInsert.Count > 0)
            db.SyncedWorkoutSessions.AddRange(toInsert);

        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> PullSessions(
        [FromQuery] long since,
        [FromQuery] Guid? clientId,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var (userId, forbidden) = await ResolveTargetUserId(caller.GetUserId(), clientId, db);
        if (forbidden is not null) return forbidden;

        // Filtered on SyncedAt, not StartedAtMs: StartedAtMs is immutable, so an edit
        // pushed after the initial sync (see PushSessions) would never cross a
        // StartedAtMs-based cursor on an already-synced second device. SyncedAt advances
        // on every insert/edit/delete, so it's the correct incremental-sync cursor.
        var sinceUtc = DateTimeOffset.FromUnixTimeMilliseconds(since).UtcDateTime;
        var sessions = await db.SyncedWorkoutSessions
            .Where(s => s.UserId == userId && s.SyncedAt > sinceUtc)
            .OrderBy(s => s.SyncedAt)
            .Select(s => new SessionDto(s.ClientId, s.StartedAtMs, s.DeletedAtMs == null ? s.DataJson : null, s.DeletedAtMs))
            .ToListAsync();

        return Results.Ok(new { sessions });
    }

    // ── Splits ────────────────────────────────────────────────────────────────

    private static async Task<IResult> PushSplits(
        [FromBody] PushSplitsRequest req,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var userId = caller.GetUserId();

        if (req.Splits.Count == 0)
            return Results.NoContent();

        var clientIds = req.Splits.Select(s => s.Id).ToList();
        var existing = await db.SyncedSplits
            .Where(s => s.UserId == userId && clientIds.Contains(s.ClientId))
            .ToListAsync();
        var existingMap = existing.ToDictionary(s => s.ClientId);

        var toInsert = new List<SyncedSplit>();

        foreach (var dto in req.Splits)
        {
            if (existingMap.TryGetValue(dto.Id, out var stored))
            {
                if (dto.DeletedAtMs.HasValue && stored.DeletedAtMs == null)
                {
                    stored.DeletedAtMs = dto.DeletedAtMs;
                    stored.DataJson = string.Empty;
                    stored.SyncedAt = DateTime.UtcNow;
                }
                else if (!dto.DeletedAtMs.HasValue && dto.UpdatedAtMs > stored.UpdatedAtMs)
                {
                    stored.UpdatedAtMs = dto.UpdatedAtMs;
                    stored.DataJson = dto.DataJson ?? string.Empty;
                    stored.SyncedAt = DateTime.UtcNow;
                }
            }
            else
            {
                toInsert.Add(new SyncedSplit
                {
                    ClientId = dto.Id,
                    UserId = userId,
                    UpdatedAtMs = dto.UpdatedAtMs,
                    DataJson = dto.DataJson ?? string.Empty,
                    DeletedAtMs = dto.DeletedAtMs,
                });
            }
        }

        if (toInsert.Count > 0)
            db.SyncedSplits.AddRange(toInsert);

        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> PullSplits(
        [FromQuery] long since,
        [FromQuery] Guid? clientId,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var (userId, forbidden) = await ResolveTargetUserId(caller.GetUserId(), clientId, db);
        if (forbidden is not null) return forbidden;

        var splits = await db.SyncedSplits
            .Where(s => s.UserId == userId && (s.UpdatedAtMs > since || (s.DeletedAtMs != null && s.DeletedAtMs > since)))
            .OrderBy(s => s.UpdatedAtMs)
            .Select(s => new SplitDto(s.ClientId, s.UpdatedAtMs, s.DeletedAtMs == null ? s.DataJson : null, s.DeletedAtMs))
            .ToListAsync();

        return Results.Ok(new { splits });
    }

    // ── Exercises ─────────────────────────────────────────────────────────────

    private static async Task<IResult> PushExercises(
        [FromBody] PushExercisesRequest req,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var userId = caller.GetUserId();

        if (req.Exercises.Count == 0)
            return Results.NoContent();

        var clientIds = req.Exercises.Select(e => e.Id).ToList();
        var existing = await db.SyncedExercises
            .Where(e => e.UserId == userId && clientIds.Contains(e.ClientId))
            .ToListAsync();
        var existingMap = existing.ToDictionary(e => e.ClientId);

        var toInsert = new List<SyncedExercise>();

        foreach (var dto in req.Exercises)
        {
            if (existingMap.TryGetValue(dto.Id, out var stored))
            {
                if (dto.DeletedAtMs.HasValue && stored.DeletedAtMs == null)
                {
                    stored.DeletedAtMs = dto.DeletedAtMs;
                    stored.DataJson = string.Empty;
                    stored.SyncedAt = DateTime.UtcNow;
                }
                else if (!dto.DeletedAtMs.HasValue && stored.DeletedAtMs == null)
                {
                    // Same reasoning as sessions above: no updatedAtMs to gate on, and the
                    // pusher is always the owning account, so overwrite on every push.
                    // Otherwise a rename/edit via updateExercise() never reached the server.
                    stored.DataJson = dto.DataJson ?? string.Empty;
                    stored.SyncedAt = DateTime.UtcNow;
                }
            }
            else
            {
                toInsert.Add(new SyncedExercise
                {
                    ClientId = dto.Id,
                    UserId = userId,
                    CreatedAtMs = dto.CreatedAtMs,
                    DataJson = dto.DataJson ?? string.Empty,
                    DeletedAtMs = dto.DeletedAtMs,
                });
            }
        }

        if (toInsert.Count > 0)
            db.SyncedExercises.AddRange(toInsert);

        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> PullExercises(
        [FromQuery] long since,
        [FromQuery] Guid? clientId,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var (userId, forbidden) = await ResolveTargetUserId(caller.GetUserId(), clientId, db);
        if (forbidden is not null) return forbidden;

        var exercises = await db.SyncedExercises
            .Where(e => e.UserId == userId && (e.CreatedAtMs > since || (e.DeletedAtMs != null && e.DeletedAtMs > since)))
            .OrderBy(e => e.CreatedAtMs)
            .Select(e => new ExerciseDto(e.ClientId, e.CreatedAtMs, e.DeletedAtMs == null ? e.DataJson : null, e.DeletedAtMs))
            .ToListAsync();

        return Results.Ok(new { exercises });
    }

    // ── Profile ───────────────────────────────────────────────────────────────

    private static async Task<IResult> PushProfile(
        [FromBody] ProfileDto dto,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var userId = caller.GetUserId();

        var user = await db.Users.FindAsync(userId);
        if (user is null) return Results.NotFound();

        if (dto.UpdatedAtMs > user.ProfileUpdatedAtMs)
        {
            user.ProfileJson = JsonSerializer.Serialize(dto);
            user.ProfileUpdatedAtMs = dto.UpdatedAtMs;
            await db.SaveChangesAsync();
        }

        return Results.NoContent();
    }

    private static async Task<IResult> PullProfile(
        [FromQuery] Guid? clientId,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var (userId, forbidden) = await ResolveTargetUserId(caller.GetUserId(), clientId, db);
        if (forbidden is not null) return forbidden;

        var user = await db.Users
            .AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new { u.ProfileJson })
            .FirstOrDefaultAsync();

        if (user?.ProfileJson is null)
            return Results.Ok(new { profile = (ProfileDto?)null });

        try
        {
            var profile = JsonSerializer.Deserialize<ProfileDto>(user.ProfileJson);
            return Results.Ok(new { profile });
        }
        catch
        {
            return Results.Ok(new { profile = (ProfileDto?)null });
        }
    }

    // ── Check-in submissions ─────────────────────────────────────────────────
    // A client's answers to coach check-ins. Client-owned, coach-readable via ?clientId=
    // (same as the other pull endpoints). Submissions carry updatedAtMs so an edit before
    // the coach reviews still syncs; last-write-wins by the owning account.

    private static async Task<IResult> PushCheckinSubmissions(
        [FromBody] PushCheckinSubmissionsRequest req,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var userId = caller.GetUserId();
        if (req.Submissions.Count == 0) return Results.NoContent();

        var clientIds = req.Submissions.Select(s => s.Id).ToList();
        var existing = await db.SyncedCheckinSubmissions
            .Where(s => s.UserId == userId && clientIds.Contains(s.ClientId))
            .ToListAsync();
        var existingMap = existing.ToDictionary(s => s.ClientId);

        var toInsert = new List<SyncedCheckinSubmission>();

        foreach (var dto in req.Submissions)
        {
            if (existingMap.TryGetValue(dto.Id, out var stored))
            {
                if (dto.DeletedAtMs.HasValue && stored.DeletedAtMs == null)
                {
                    stored.DeletedAtMs = dto.DeletedAtMs;
                    stored.DataJson = string.Empty;
                    stored.SyncedAt = DateTime.UtcNow;
                }
                else if (!dto.DeletedAtMs.HasValue && dto.UpdatedAtMs > stored.UpdatedAtMs)
                {
                    stored.UpdatedAtMs = dto.UpdatedAtMs;
                    stored.DataJson = dto.DataJson ?? string.Empty;
                    stored.SyncedAt = DateTime.UtcNow;
                }
            }
            else
            {
                toInsert.Add(new SyncedCheckinSubmission
                {
                    ClientId = dto.Id,
                    UserId = userId,
                    CreatedAtMs = dto.CreatedAtMs,
                    UpdatedAtMs = dto.UpdatedAtMs,
                    DataJson = dto.DataJson ?? string.Empty,
                    DeletedAtMs = dto.DeletedAtMs,
                });
            }
        }

        if (toInsert.Count > 0)
            db.SyncedCheckinSubmissions.AddRange(toInsert);

        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> PullCheckinSubmissions(
        [FromQuery] long since,
        [FromQuery] Guid? clientId,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var (userId, forbidden) = await ResolveTargetUserId(caller.GetUserId(), clientId, db);
        if (forbidden is not null) return forbidden;

        var sinceUtc = DateTimeOffset.FromUnixTimeMilliseconds(since).UtcDateTime;
        var submissions = await db.SyncedCheckinSubmissions
            .Where(s => s.UserId == userId && s.SyncedAt > sinceUtc)
            .OrderBy(s => s.SyncedAt)
            .Select(s => new CheckinSubmissionDto(
                s.ClientId, s.CreatedAtMs, s.UpdatedAtMs,
                s.DeletedAtMs == null ? s.DataJson : null, s.DeletedAtMs))
            .ToListAsync();

        return Results.Ok(new { submissions });
    }

    // ── Coach access ──────────────────────────────────────────────────────────

    /// Resolves which user's data a pull request should actually read: the caller's own
    /// (clientId absent — unchanged, self-access) or a client's (clientId present — only if
    /// the caller has an Active coach relationship with them). Read-only by design: this is
    /// never called from any push/write handler.
    private static async Task<(Guid? userId, IResult? forbidden)> ResolveTargetUserId(
        Guid callerId, Guid? clientId, AppDbContext db)
    {
        if (clientId is null) return (callerId, null);

        var authorized = await db.CoachClientRelationships.AnyAsync(r =>
            r.CoachId == callerId && r.ClientId == clientId.Value && r.Status == CoachClientStatus.Active);

        return authorized ? (clientId, null) : (null, Results.Forbid());
    }
}

public record PushSessionsRequest(List<SessionDto> Sessions);
public record SessionDto(string Id, long StartedAtMs, string? DataJson, long? DeletedAtMs = null);

public record PushSplitsRequest(List<SplitDto> Splits);
public record SplitDto(string Id, long UpdatedAtMs, string? DataJson, long? DeletedAtMs = null);

public record PushExercisesRequest(List<ExerciseDto> Exercises);
public record ExerciseDto(string Id, long CreatedAtMs, string? DataJson, long? DeletedAtMs = null);

public record PushCheckinSubmissionsRequest(List<CheckinSubmissionDto> Submissions);
public record CheckinSubmissionDto(string Id, long CreatedAtMs, long UpdatedAtMs, string? DataJson, long? DeletedAtMs = null);

public record ProfileDto(
    string DisplayName,
    string Bio,
    string? AvatarDataUrl,
    double? Height,
    string HeightUnit,
    double? Weight,
    string WeightUnit,
    bool BlocksCollapsedByDefault,
    string RestDefaultsJson,
    long UpdatedAtMs
);
