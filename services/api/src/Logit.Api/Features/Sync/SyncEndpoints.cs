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
        var group = app.MapGroup("/sync").WithTags("Sync").RequireAuthorization();

        // Sessions and check-in submissions also flow to a Studio coach, so an actively-coached
        // Free client gets these two (and only these two) without paying — see RequireTier.
        group.MapPost("/sessions", PushSessions).RequireTier(UserTier.Pro, orActivelyCoached: true);
        group.MapGet("/sessions", PullSessions).RequireTier(UserTier.Pro, orActivelyCoached: true);

        group.MapPost("/checkins", PushCheckinSubmissions).RequireTier(UserTier.Pro, orActivelyCoached: true);
        group.MapGet("/checkins", PullCheckinSubmissions).RequireTier(UserTier.Pro, orActivelyCoached: true);

        // Whole-library multi-device sync stays Pro/Studio-only.
        group.MapPost("/splits", PushSplits).RequireTier(UserTier.Pro);
        group.MapGet("/splits", PullSplits).RequireTier(UserTier.Pro);

        group.MapPost("/exercises", PushExercises).RequireTier(UserTier.Pro);
        group.MapGet("/exercises", PullExercises).RequireTier(UserTier.Pro);

        group.MapPost("/profile", PushProfile).RequireTier(UserTier.Pro);
        group.MapGet("/profile", PullProfile).RequireTier(UserTier.Pro);

        // Nutrition. Diary, weight and goal flow to a Studio coach (Phase 3 dashboard), so an
        // actively-coached Free client gets those — same rule as sessions/checkins. The
        // custom-food and recipe libraries are whole-account multi-device sync → Pro-only.
        var nutrition = group.MapGroup("/nutrition");
        nutrition.MapPost("/days", PushNutritionDays).RequireTier(UserTier.Pro, orActivelyCoached: true);
        nutrition.MapGet("/days", PullNutritionDays).RequireTier(UserTier.Pro, orActivelyCoached: true);
        nutrition.MapPost("/weight", PushWeightEntries).RequireTier(UserTier.Pro, orActivelyCoached: true);
        nutrition.MapGet("/weight", PullWeightEntries).RequireTier(UserTier.Pro, orActivelyCoached: true);
        nutrition.MapPost("/goal", PushNutritionGoal).RequireTier(UserTier.Pro, orActivelyCoached: true);
        nutrition.MapGet("/goal", PullNutritionGoal).RequireTier(UserTier.Pro, orActivelyCoached: true);
        nutrition.MapPost("/custom-foods", PushCustomFoods).RequireTier(UserTier.Pro);
        nutrition.MapGet("/custom-foods", PullCustomFoods).RequireTier(UserTier.Pro);
        nutrition.MapPost("/recipes", PushRecipes).RequireTier(UserTier.Pro);
        nutrition.MapGet("/recipes", PullRecipes).RequireTier(UserTier.Pro);
        nutrition.MapPost("/favorites", PushFavorites).RequireTier(UserTier.Pro);
        nutrition.MapGet("/favorites", PullFavorites).RequireTier(UserTier.Pro);
        nutrition.MapPost("/meal-templates", PushMealTemplates).RequireTier(UserTier.Pro);
        nutrition.MapGet("/meal-templates", PullMealTemplates).RequireTier(UserTier.Pro);

        // Habits — personal, whole-account multi-device sync → Pro-only. The GET side also
        // serves a Studio coach reading an Active client's rows via ?clientId= (habit
        // definitions + check-offs, for adherence review). A Free coached client keeps
        // habits locally but doesn't sync them, so the coach only sees Pro/Studio clients'
        // adherence for now — a dedicated assigned-only feed could lift that later.
        group.MapPost("/habits", PushHabits).RequireTier(UserTier.Pro);
        group.MapGet("/habits", PullHabits).RequireTier(UserTier.Pro);
        group.MapPost("/habit-entries", PushHabitEntries).RequireTier(UserTier.Pro);
        group.MapGet("/habit-entries", PullHabitEntries).RequireTier(UserTier.Pro);
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

    // ── Generic client-owned rows ────────────────────────────────────────────
    // Nutrition rows, habits and habit entries all implement ISyncedClientRow, so one
    // generic push/pull pair covers them. Semantics match check-in submissions:
    // last-write-wins by UpdatedAtMs, tombstone via DeletedAtMs, pull cursor on SyncedAt.

    private static async Task<IResult> PushSyncRows<T>(
        Guid userId, List<SyncRowDto> rows, DbSet<T> set, AppDbContext db)
        where T : class, ISyncedClientRow, new()
    {
        if (rows.Count == 0) return Results.NoContent();

        var clientIds = rows.Select(r => r.Id).ToList();
        var existing = await set
            .Where(s => s.UserId == userId && clientIds.Contains(s.ClientId))
            .ToListAsync();
        var existingMap = existing.ToDictionary(s => s.ClientId);

        var toInsert = new List<T>();
        foreach (var dto in rows)
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
                toInsert.Add(new T
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

        if (toInsert.Count > 0) set.AddRange(toInsert);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static Task<List<SyncRowDto>> PullSyncRows<T>(
        Guid? userId, long since, DbSet<T> set)
        where T : class, ISyncedClientRow
    {
        var sinceUtc = DateTimeOffset.FromUnixTimeMilliseconds(since).UtcDateTime;
        return set
            .Where(s => s.UserId == userId && s.SyncedAt > sinceUtc)
            .OrderBy(s => s.SyncedAt)
            .Select(s => new SyncRowDto(
                s.ClientId, s.CreatedAtMs, s.UpdatedAtMs,
                s.DeletedAtMs == null ? s.DataJson : null, s.DeletedAtMs))
            .ToListAsync();
    }

    private static Task<IResult> PushNutritionDays(
        [FromBody] PushNutritionDaysRequest req, ClaimsPrincipal caller, AppDbContext db)
        => PushSyncRows(caller.GetUserId(), req.Days, db.SyncedNutritionDays, db);

    private static async Task<IResult> PullNutritionDays(
        [FromQuery] long since, [FromQuery] Guid? clientId, ClaimsPrincipal caller, AppDbContext db)
    {
        var (userId, forbidden) = await ResolveTargetUserId(caller.GetUserId(), clientId, db);
        if (forbidden is not null) return forbidden;
        return Results.Ok(new { days = await PullSyncRows(userId, since, db.SyncedNutritionDays) });
    }

    private static Task<IResult> PushWeightEntries(
        [FromBody] PushWeightEntriesRequest req, ClaimsPrincipal caller, AppDbContext db)
        => PushSyncRows(caller.GetUserId(), req.Entries, db.SyncedWeightEntries, db);

    private static async Task<IResult> PullWeightEntries(
        [FromQuery] long since, [FromQuery] Guid? clientId, ClaimsPrincipal caller, AppDbContext db)
    {
        var (userId, forbidden) = await ResolveTargetUserId(caller.GetUserId(), clientId, db);
        if (forbidden is not null) return forbidden;
        return Results.Ok(new { entries = await PullSyncRows(userId, since, db.SyncedWeightEntries) });
    }

    private static Task<IResult> PushCustomFoods(
        [FromBody] PushCustomFoodsRequest req, ClaimsPrincipal caller, AppDbContext db)
        => PushSyncRows(caller.GetUserId(), req.Foods, db.SyncedCustomFoods, db);

    private static async Task<IResult> PullCustomFoods(
        [FromQuery] long since, ClaimsPrincipal caller, AppDbContext db)
        => Results.Ok(new { foods = await PullSyncRows(caller.GetUserId(), since, db.SyncedCustomFoods) });

    private static Task<IResult> PushRecipes(
        [FromBody] PushRecipesRequest req, ClaimsPrincipal caller, AppDbContext db)
        => PushSyncRows(caller.GetUserId(), req.Recipes, db.SyncedRecipes, db);

    private static async Task<IResult> PullRecipes(
        [FromQuery] long since, ClaimsPrincipal caller, AppDbContext db)
        => Results.Ok(new { recipes = await PullSyncRows(caller.GetUserId(), since, db.SyncedRecipes) });

    private static Task<IResult> PushFavorites(
        [FromBody] PushFavoritesRequest req, ClaimsPrincipal caller, AppDbContext db)
        => PushSyncRows(caller.GetUserId(), req.Favorites, db.SyncedFavoriteFoods, db);

    private static async Task<IResult> PullFavorites(
        [FromQuery] long since, ClaimsPrincipal caller, AppDbContext db)
        => Results.Ok(new { favorites = await PullSyncRows(caller.GetUserId(), since, db.SyncedFavoriteFoods) });

    private static Task<IResult> PushMealTemplates(
        [FromBody] PushMealTemplatesRequest req, ClaimsPrincipal caller, AppDbContext db)
        => PushSyncRows(caller.GetUserId(), req.Templates, db.SyncedMealTemplates, db);

    private static async Task<IResult> PullMealTemplates(
        [FromQuery] long since, ClaimsPrincipal caller, AppDbContext db)
        => Results.Ok(new { templates = await PullSyncRows(caller.GetUserId(), since, db.SyncedMealTemplates) });

    // ── Habits ───────────────────────────────────────────────────────────────
    // Personal habits + check-offs, same ISyncedClientRow semantics as the nutrition rows.
    // GET takes ?clientId= so a coach can read an Active client's habit definitions and
    // check-offs for adherence review (see ResolveTargetUserId).

    private static Task<IResult> PushHabits(
        [FromBody] PushHabitsRequest req, ClaimsPrincipal caller, AppDbContext db)
        => PushSyncRows(caller.GetUserId(), req.Habits, db.SyncedHabits, db);

    private static async Task<IResult> PullHabits(
        [FromQuery] long since, [FromQuery] Guid? clientId, ClaimsPrincipal caller, AppDbContext db)
    {
        var (userId, forbidden) = await ResolveTargetUserId(caller.GetUserId(), clientId, db);
        if (forbidden is not null) return forbidden;
        return Results.Ok(new { habits = await PullSyncRows(userId, since, db.SyncedHabits) });
    }

    private static Task<IResult> PushHabitEntries(
        [FromBody] PushHabitEntriesRequest req, ClaimsPrincipal caller, AppDbContext db)
        => PushSyncRows(caller.GetUserId(), req.Entries, db.SyncedHabitEntries, db);

    private static async Task<IResult> PullHabitEntries(
        [FromQuery] long since, [FromQuery] Guid? clientId, ClaimsPrincipal caller, AppDbContext db)
    {
        var (userId, forbidden) = await ResolveTargetUserId(caller.GetUserId(), clientId, db);
        if (forbidden is not null) return forbidden;
        return Results.Ok(new { entries = await PullSyncRows(userId, since, db.SyncedHabitEntries) });
    }

    // Goal — a singleton on User, synced like the profile blob.

    private static async Task<IResult> PushNutritionGoal(
        [FromBody] NutritionGoalDto dto, ClaimsPrincipal caller, AppDbContext db)
    {
        var user = await db.Users.FindAsync(caller.GetUserId());
        if (user is null) return Results.NotFound();

        if (dto.UpdatedAtMs > user.NutritionGoalUpdatedAtMs)
        {
            user.NutritionGoalJson = dto.DataJson;
            user.NutritionGoalUpdatedAtMs = dto.UpdatedAtMs;
            await db.SaveChangesAsync();
        }
        return Results.NoContent();
    }

    private static async Task<IResult> PullNutritionGoal(
        [FromQuery] Guid? clientId, ClaimsPrincipal caller, AppDbContext db)
    {
        var (userId, forbidden) = await ResolveTargetUserId(caller.GetUserId(), clientId, db);
        if (forbidden is not null) return forbidden;

        var row = await db.Users
            .AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new { u.NutritionGoalJson, u.NutritionGoalUpdatedAtMs })
            .FirstOrDefaultAsync();

        if (row?.NutritionGoalJson is null)
            return Results.Ok(new { goal = (NutritionGoalDto?)null });

        return Results.Ok(new { goal = new NutritionGoalDto(row.NutritionGoalJson, row.NutritionGoalUpdatedAtMs) });
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

// NOTE: this record must have a property for every field the client's RemoteProfile
// (packages/core/src/api/syncApi.ts) sends — System.Text.Json silently drops any JSON
// property with no matching constructor parameter here rather than erroring, so a client
// field with nothing to land on here round-trips through push and pull as if it were never
// sent. That's exactly how NavConfigJson went unsynced for a long time before this comment
// was added: the client always built and sent it, this record just never had anywhere to
// put it.
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
    string? NavConfigJson,
    string? ActiveSplitId,
    long UpdatedAtMs
);

/// One client-owned sync row — nutrition row, habit or habit entry (see ISyncedClientRow).
/// `Id` is the app-generated client id.
public record SyncRowDto(
    string Id, long CreatedAtMs, long UpdatedAtMs, string? DataJson, long? DeletedAtMs = null);

public record PushNutritionDaysRequest(List<SyncRowDto> Days);
public record PushCustomFoodsRequest(List<SyncRowDto> Foods);
public record PushRecipesRequest(List<SyncRowDto> Recipes);
public record PushFavoritesRequest(List<SyncRowDto> Favorites);
public record PushMealTemplatesRequest(List<SyncRowDto> Templates);
public record PushWeightEntriesRequest(List<SyncRowDto> Entries);
public record PushHabitsRequest(List<SyncRowDto> Habits);
public record PushHabitEntriesRequest(List<SyncRowDto> Entries);

public record NutritionGoalDto(string DataJson, long UpdatedAtMs);
