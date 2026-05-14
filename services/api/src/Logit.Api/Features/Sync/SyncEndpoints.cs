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
        var group = app.MapGroup("/sync").WithTags("Sync").RequireAuthorization();

        group.MapPost("/sessions", PushSessions);
        group.MapGet("/sessions", PullSessions);

        group.MapPost("/splits", PushSplits);
        group.MapGet("/splits", PullSplits);

        group.MapPost("/exercises", PushExercises);
        group.MapGet("/exercises", PullExercises);

        group.MapPost("/profile", PushProfile);
        group.MapGet("/profile", PullProfile);
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
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var userId = caller.GetUserId();

        var sessions = await db.SyncedWorkoutSessions
            .Where(s => s.UserId == userId && (s.StartedAtMs > since || (s.DeletedAtMs != null && s.DeletedAtMs > since)))
            .OrderBy(s => s.StartedAtMs)
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
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var userId = caller.GetUserId();

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
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var userId = caller.GetUserId();

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
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var userId = caller.GetUserId();

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
}

public record PushSessionsRequest(List<SessionDto> Sessions);
public record SessionDto(string Id, long StartedAtMs, string? DataJson, long? DeletedAtMs = null);

public record PushSplitsRequest(List<SplitDto> Splits);
public record SplitDto(string Id, long UpdatedAtMs, string? DataJson, long? DeletedAtMs = null);

public record PushExercisesRequest(List<ExerciseDto> Exercises);
public record ExerciseDto(string Id, long CreatedAtMs, string? DataJson, long? DeletedAtMs = null);

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
