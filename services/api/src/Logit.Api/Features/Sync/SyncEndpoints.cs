using System.Security.Claims;
using System.Text.Json;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Coach;
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
        // "Back up this phone instead" (decision D5): a Free account's backup moves to this phone.
        group.MapPost("/backup/here", MoveBackupHere);
        group.MapGet("/sessions", PullSessions).RequireTier(UserTier.Pro, orActivelyCoached: true);

        group.MapPost("/checkins", PushCheckinSubmissions).RequireTier(UserTier.Pro, orActivelyCoached: true);
        group.MapGet("/checkins", PullCheckinSubmissions).RequireTier(UserTier.Pro, orActivelyCoached: true);

        // Whole-library multi-device sync stays Pro/Studio-only.
        group.MapPost("/splits", PushSplits).RequireTier(UserTier.Pro);
        group.MapGet("/splits", PullSplits).RequireTier(UserTier.Pro);

        group.MapPost("/exercises", PushExercises).RequireTier(UserTier.Pro);
        group.MapGet("/exercises", PullExercises).RequireTier(UserTier.Pro);

        // How each exercise progresses (its own algorithm, rep range, goal pace).
        group.MapPost("/exercise-settings", PushExerciseSettings).RequireTier(UserTier.Pro);
        group.MapGet("/exercise-settings", PullExerciseSettings).RequireTier(UserTier.Pro);

        // Progression algorithms built from blocks.
        group.MapPost("/progression-recipes", PushProgressionRecipes).RequireTier(UserTier.Pro);
        group.MapGet("/progression-recipes", PullProgressionRecipes).RequireTier(UserTier.Pro);

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
        group.MapPost("/plugins", PushPluginInstalls).RequireTier(UserTier.Pro);
        // Saved Insights charts. Saving is Pro; pulling is open to every tier so a chart a
        // coach makes for a Free client still reaches their phone.
        group.MapPost("/charts", PushInsightCharts).RequireTier(UserTier.Pro);
        group.MapGet("/charts", PullInsightCharts);
        group.MapGet("/plugins", PullPluginInstalls).RequireTier(UserTier.Pro);
        group.MapPost("/habits", PushHabits).RequireTier(UserTier.Pro);
        group.MapGet("/habits", PullHabits).RequireTier(UserTier.Pro);
        group.MapPost("/habit-entries", PushHabitEntries).RequireTier(UserTier.Pro);
        group.MapGet("/habit-entries", PullHabitEntries).RequireTier(UserTier.Pro);
        // Places you train (My gym): synced like habits; Free backs up one phone (FreeBackup).
        group.MapPost("/places", PushPlaces).RequireTier(UserTier.Pro);
        group.MapGet("/places", PullPlaces).RequireTier(UserTier.Pro);
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
                else if (!dto.DeletedAtMs.HasValue && stored.DeletedAtMs == null
                         && (dto.UpdatedAtMs is null || dto.UpdatedAtMs >= stored.UpdatedAtMs))
                {
                    // The newer copy wins: an edit made after the first push (correcting a set)
                    // replaces it, but a second device re-sending its older copy (Sync now
                    // pushes everything) no longer overwrites that edit. A push without a time
                    // (an older app) still wins, as before.
                    stored.StartedAtMs = dto.StartedAtMs;
                    stored.DataJson = dto.DataJson ?? string.Empty;
                    stored.UpdatedAtMs = dto.UpdatedAtMs ?? stored.UpdatedAtMs;
                    stored.SyncedAt = DateTime.UtcNow;
                }
            }
            else
            {
                var row = new SyncedWorkoutSession
                {
                    ClientId = dto.Id,
                    UserId = userId,
                    StartedAtMs = dto.StartedAtMs,
                    UpdatedAtMs = dto.UpdatedAtMs ?? 0,
                    DataJson = dto.DataJson ?? string.Empty,
                    DeletedAtMs = dto.DeletedAtMs,
                };
                toInsert.Add(row);
                // The app's offline queue keeps one entry per edit, so one push can carry the
                // same id several times. Later copies must update this row, not insert another.
                existingMap[dto.Id] = row;
            }
        }

        if (toInsert.Count > 0)
            db.SyncedWorkoutSessions.AddRange(toInsert);

        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> MoveBackupHere(ClaimsPrincipal caller, HttpRequest request, AppDbContext db)
    {
        var user = await db.Users.FindAsync(caller.GetUserId());
        if (user is null) return Results.NotFound();
        if (FreeBackup.Normalize(request.Headers[FreeBackup.DeviceHeader]) is null)
            return Results.BadRequest(new { error = "Only a phone can hold the free backup." });
        FreeBackup.MoveTo(user, request.Headers[FreeBackup.DeviceHeader]);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> PullSessions(
        [FromQuery] long since,
        [FromQuery] Guid? clientId,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var (userId, forbidden) = await ResolveTargetUserId(caller.GetUserId(), clientId, db, ShareArea.Workouts);
        if (forbidden is not null) return forbidden;

        // Filtered on SyncedAt, not StartedAtMs: StartedAtMs is immutable, so an edit
        // pushed after the initial sync (see PushSessions) would never cross a
        // StartedAtMs-based cursor on an already-synced second device. SyncedAt advances
        // on every insert/edit/delete, so it's the correct incremental-sync cursor.
        var sinceUtc = DateTimeOffset.FromUnixTimeMilliseconds(since).UtcDateTime;
        // A coach sees workouts from before coaching only if the client shares them (canvas SP3).
        var floor = clientId is { } cid ? await CoachAccess.WorkoutsSince(db, caller.GetUserId(), cid) ?? 0 : 0;
        var sessions = await db.SyncedWorkoutSessions
            .Where(s => s.UserId == userId && s.SyncedAt > sinceUtc && s.StartedAtMs >= floor)
            .OrderBy(s => s.SyncedAt)
            .Select(s => new SessionDto(s.ClientId, s.StartedAtMs, s.DeletedAtMs == null ? s.DataJson : null, s.DeletedAtMs, s.UpdatedAtMs))
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
                var row = new SyncedSplit
                {
                    ClientId = dto.Id,
                    UserId = userId,
                    UpdatedAtMs = dto.UpdatedAtMs,
                    DataJson = dto.DataJson ?? string.Empty,
                    DeletedAtMs = dto.DeletedAtMs,
                };
                toInsert.Add(row);
                existingMap[dto.Id] = row; // same id again later in this push → update (see PushSessions)
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
        var (userId, forbidden) = await ResolveTargetUserId(caller.GetUserId(), clientId, db, ShareArea.Workouts);
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
                    stored.Kind = LibraryKinds.FromDataJson(dto.DataJson);
                    stored.SyncedAt = DateTime.UtcNow;
                }
            }
            else
            {
                var row = new SyncedExercise
                {
                    ClientId = dto.Id,
                    UserId = userId,
                    CreatedAtMs = dto.CreatedAtMs,
                    DataJson = dto.DataJson ?? string.Empty,
                    DeletedAtMs = dto.DeletedAtMs,
                    Kind = LibraryKinds.FromDataJson(dto.DataJson),
                };
                toInsert.Add(row);
                existingMap[dto.Id] = row; // same id again later in this push → update (see PushSessions)
            }
        }

        if (toInsert.Count > 0)
            db.SyncedExercises.AddRange(toInsert);

        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    /// `kinds=all` returns cardio and mobility items too. Without it only strength rows come
    /// back, so app versions from before the library don't file a drill under exercises.
    /// Edits come back too (SyncedAt moves on every push), not only new rows.
    private static async Task<IResult> PullExercises(
        [FromQuery] long since,
        [FromQuery] Guid? clientId,
        [FromQuery] string? kinds,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var (userId, forbidden) = await ResolveTargetUserId(caller.GetUserId(), clientId, db, ShareArea.Workouts);
        if (forbidden is not null) return forbidden;

        var allKinds = kinds == "all";
        var sinceUtc = DateTimeOffset.FromUnixTimeMilliseconds(Math.Max(0, since)).UtcDateTime;
        var exercises = await db.SyncedExercises
            .Where(e => e.UserId == userId && (allKinds || e.Kind == LibraryKinds.Strength))
            .Where(e => e.CreatedAtMs > since || e.SyncedAt > sinceUtc || (e.DeletedAtMs != null && e.DeletedAtMs > since))
            .OrderBy(e => e.CreatedAtMs)
            .Select(e => new ExerciseDto(e.ClientId, e.CreatedAtMs, e.DeletedAtMs == null ? e.DataJson : null, e.DeletedAtMs, e.Kind, e.SharedWithClients))
            .ToListAsync();

        return Results.Ok(new { exercises });
    }

    // ── Profile ───────────────────────────────────────────────────────────────

    private static async Task<IResult> PushProfile(
        [FromBody] ProfileDto dto,
        ClaimsPrincipal caller,
        AppDbContext db,
        ILoggerFactory loggerFactory)
    {
        var userId = caller.GetUserId();

        var user = await db.Users.FindAsync(userId);
        if (user is null) return Results.NotFound();

        // The split rotation doesn't follow the profile's last-write-wins: each split keeps
        // whichever "last day done" is newest, from either side. Otherwise a device that saved
        // its profile before it had pulled another device's newer workout would rewind it.
        ProfileDto? stored = null;
        if (user.ProfileJson is not null)
        {
            try { stored = JsonSerializer.Deserialize<ProfileDto>(user.ProfileJson); }
            catch (JsonException ex)
            {
                loggerFactory.CreateLogger("Logit.Sync").LogWarning(
                    "Stored profile of user {UserId} is unreadable ({Reason}); its split rotation is dropped", userId, ex.Message);
            }
        }
        var rotations = MergeSplitRotations(stored?.SplitRotationJson, dto.SplitRotationJson);
        // Goals the same way, per goal on its updatedAtMs.
        var goals = MergeByTimestamp(stored?.GoalsJson, dto.GoalsJson, "updatedAtMs");
        // Plugin settings (the community plugins switch) the same way.
        var pluginSettings = MergeByTimestamp(stored?.PluginSettingsJson, dto.PluginSettingsJson, "updatedAtMs");

        // The first profile is stored even when it's dated 0: the dashboard stores one like that
        // for the plugins switch before any phone has synced, and a phone never takes a profile
        // that isn't newer than its own.
        if (dto.UpdatedAtMs > user.ProfileUpdatedAtMs || user.ProfileJson is null)
        {
            user.ProfileJson = JsonSerializer.Serialize(dto with
            {
                SplitRotationJson = rotations, GoalsJson = goals, PluginSettingsJson = pluginSettings,
                TrainingGoal = dto.TrainingGoal ?? stored?.TrainingGoal,
                KitJson = dto.KitJson ?? stored?.KitJson,
                Experience = dto.Experience ?? stored?.Experience,
            });
            user.ProfileUpdatedAtMs = dto.UpdatedAtMs;
            await db.SaveChangesAsync();
        }
        else if (stored is not null && (rotations != stored.SplitRotationJson || goals != stored.GoalsJson
                                        || pluginSettings != stored.PluginSettingsJson))
        {
            user.ProfileJson = JsonSerializer.Serialize(stored with { SplitRotationJson = rotations, GoalsJson = goals, PluginSettingsJson = pluginSettings });
            await db.SaveChangesAsync();
        }

        return Results.NoContent();
    }

    /// Merge two split-rotation maps ({ splitId: { lastDayId, recordedAtMs } }), keeping the
    /// newer entry per split. Unreadable input is ignored; returns null when both are empty.
    public static string? MergeSplitRotations(string? stored, string? incoming) =>
        MergeByTimestamp(stored, incoming, "recordedAtMs");

    /// Merge two JSON objects of { key: { <timestampField>: ms, ... } }, keeping the entry with
    /// the newer timestamp per key. Unreadable input is ignored; returns null when both are empty.
    public static string? MergeByTimestamp(string? stored, string? incoming, string timestampField)
    {
        var merged = new SortedDictionary<string, JsonElement>(StringComparer.Ordinal);
        long RecordedAt(JsonElement e) =>
            e.ValueKind == JsonValueKind.Object && e.TryGetProperty(timestampField, out var r) && r.TryGetInt64(out var v)
                ? v
                : long.MinValue;

        foreach (var json in new[] { stored, incoming })
        {
            if (string.IsNullOrWhiteSpace(json)) continue;
            try
            {
                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.ValueKind != JsonValueKind.Object) continue;
                foreach (var split in doc.RootElement.EnumerateObject())
                {
                    if (!merged.TryGetValue(split.Name, out var current) || RecordedAt(split.Value) > RecordedAt(current))
                        merged[split.Name] = split.Value.Clone();
                }
            }
            catch (JsonException) { }
        }

        return merged.Count == 0 ? null : JsonSerializer.Serialize(merged);
    }

    private static async Task<IResult> PullProfile(
        [FromQuery] Guid? clientId,
        ClaimsPrincipal caller,
        AppDbContext db,
        ILoggerFactory loggerFactory)
    {
        var (userId, forbidden) = await ResolveTargetUserId(caller.GetUserId(), clientId, db, null);
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
            // A coach whose client hides body weight doesn't get it (or the progress photo)
            // through the profile either.
            if (clientId is { } cid && profile is not null)
            {
                var rel = await CoachAccess.ActiveRelationship(db, caller.GetUserId(), cid);
                if (rel is not null && !rel.Shares(ShareArea.Bodyweight))
                    profile = profile with { Weight = null, ProgressPhotoDataUrl = null };
            }
            return Results.Ok(new { profile });
        }
        catch (Exception ex)
        {
            loggerFactory.CreateLogger("Logit.Sync").LogWarning(
                "Stored profile of user {UserId} is unreadable ({Reason}); sent as empty", userId, ex.Message);
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
                var row = new SyncedCheckinSubmission
                {
                    ClientId = dto.Id,
                    UserId = userId,
                    CreatedAtMs = dto.CreatedAtMs,
                    UpdatedAtMs = dto.UpdatedAtMs,
                    DataJson = dto.DataJson ?? string.Empty,
                    DeletedAtMs = dto.DeletedAtMs,
                };
                toInsert.Add(row);
                existingMap[dto.Id] = row; // same id again later in this push → update (see PushSessions)
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
        var (userId, forbidden) = await ResolveTargetUserId(caller.GetUserId(), clientId, db, ShareArea.Checkins);
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
    /// the caller has an Active coach relationship with them and the client shares `area`
    /// with that coach; null area = any Active coach, for the profile, which masks the parts
    /// it hides itself). Read-only by design: never called from a push/write handler.
    private static async Task<(Guid? userId, IResult? forbidden)> ResolveTargetUserId(
        Guid callerId, Guid? clientId, AppDbContext db, ShareArea? area)
    {
        if (clientId is null) return (callerId, null);

        var relationship = await CoachAccess.ActiveRelationship(db, callerId, clientId.Value);
        if (relationship is null) return (null, Results.Forbid());
        if (area is { } a && !relationship.Shares(a)) return (null, CoachAccess.NotShared());
        return (clientId, null);
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
                var row = new T
                {
                    ClientId = dto.Id,
                    UserId = userId,
                    CreatedAtMs = dto.CreatedAtMs,
                    UpdatedAtMs = dto.UpdatedAtMs,
                    DataJson = dto.DataJson ?? string.Empty,
                    DeletedAtMs = dto.DeletedAtMs,
                };
                toInsert.Add(row);
                existingMap[dto.Id] = row; // same id again later in this push → update (see PushSessions)
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
        var (userId, forbidden) = await ResolveTargetUserId(caller.GetUserId(), clientId, db, ShareArea.Nutrition);
        if (forbidden is not null) return forbidden;
        return Results.Ok(new { days = await PullSyncRows(userId, since, db.SyncedNutritionDays) });
    }

    private static Task<IResult> PushWeightEntries(
        [FromBody] PushWeightEntriesRequest req, ClaimsPrincipal caller, AppDbContext db)
        => PushSyncRows(caller.GetUserId(), req.Entries, db.SyncedWeightEntries, db);

    private static async Task<IResult> PullWeightEntries(
        [FromQuery] long since, [FromQuery] Guid? clientId, ClaimsPrincipal caller, AppDbContext db)
    {
        var (userId, forbidden) = await ResolveTargetUserId(caller.GetUserId(), clientId, db, ShareArea.Bodyweight);
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

    private static Task<IResult> PushExerciseSettings(
        [FromBody] PushExerciseSettingsRequest req, ClaimsPrincipal caller, AppDbContext db)
        => PushSyncRows(caller.GetUserId(), req.Settings, db.SyncedExerciseSettings, db);

    private static async Task<IResult> PullExerciseSettings(
        [FromQuery] long since, ClaimsPrincipal caller, AppDbContext db)
        => Results.Ok(new { settings = await PullSyncRows(caller.GetUserId(), since, db.SyncedExerciseSettings) });

    private static Task<IResult> PushProgressionRecipes(
        [FromBody] PushProgressionRecipesRequest req, ClaimsPrincipal caller, AppDbContext db)
        => PushSyncRows(caller.GetUserId(), req.Recipes, db.SyncedProgressionRecipes, db);

    private static async Task<IResult> PullProgressionRecipes(
        [FromQuery] long since, ClaimsPrincipal caller, AppDbContext db)
        => Results.Ok(new { recipes = await PullSyncRows(caller.GetUserId(), since, db.SyncedProgressionRecipes) });

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
        var (userId, forbidden) = await ResolveTargetUserId(caller.GetUserId(), clientId, db, ShareArea.Habits);
        if (forbidden is not null) return forbidden;
        return Results.Ok(new { habits = await PullSyncRows(userId, since, db.SyncedHabits) });
    }

    private static Task<IResult> PushHabitEntries(
        [FromBody] PushHabitEntriesRequest req, ClaimsPrincipal caller, AppDbContext db)
        => PushSyncRows(caller.GetUserId(), req.Entries, db.SyncedHabitEntries, db);

    private static async Task<IResult> PullHabitEntries(
        [FromQuery] long since, [FromQuery] Guid? clientId, ClaimsPrincipal caller, AppDbContext db)
    {
        var (userId, forbidden) = await ResolveTargetUserId(caller.GetUserId(), clientId, db, ShareArea.Habits);
        if (forbidden is not null) return forbidden;
        return Results.Ok(new { entries = await PullSyncRows(userId, since, db.SyncedHabitEntries) });
    }

    // ── Places (My gym) ─────────────────────────────────────────────────────

    private static Task<IResult> PushPlaces(
        [FromBody] PushPlacesRequest req, ClaimsPrincipal caller, AppDbContext db)
        => PushSyncRows(caller.GetUserId(), req.Places, db.SyncedPlaces, db);

    private static async Task<IResult> PullPlaces(
        [FromQuery] long since, ClaimsPrincipal caller, AppDbContext db)
        => Results.Ok(new { places = await PullSyncRows(caller.GetUserId(), since, db.SyncedPlaces) });

    // ── Installed plugins ────────────────────────────────────────────────────
    // One row per installed plugin (keyed by manifest id), so installing, switching off or
    // removing a plugin on one device reaches the others. Each device still downloads the
    // code itself and checks it against the manifest's integrity hash.

    private static Task<IResult> PushPluginInstalls(
        [FromBody] PushPluginInstallsRequest req, ClaimsPrincipal caller, AppDbContext db)
        => PushSyncRows(caller.GetUserId(), req.Plugins, db.SyncedPluginInstalls, db);

    private static async Task<IResult> PullPluginInstalls(
        [FromQuery] long since, ClaimsPrincipal caller, AppDbContext db)
        => Results.Ok(new { plugins = await PullSyncRows(caller.GetUserId(), since, db.SyncedPluginInstalls) });

    // ── Saved Insights charts ────────────────────────────────────────────────

    private static Task<IResult> PushInsightCharts(
        [FromBody] PushInsightChartsRequest req, ClaimsPrincipal caller, AppDbContext db)
        => PushSyncRows(caller.GetUserId(), req.Charts, db.SyncedInsightCharts, db);

    private static async Task<IResult> PullInsightCharts(
        [FromQuery] long since, ClaimsPrincipal caller, AppDbContext db)
        => Results.Ok(new { charts = await PullSyncRows(caller.GetUserId(), since, db.SyncedInsightCharts) });

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
        var (userId, forbidden) = await ResolveTargetUserId(caller.GetUserId(), clientId, db, ShareArea.Nutrition);
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
/// UpdatedAtMs: when the session last changed on the device (null from app versions before it).
public record SessionDto(string Id, long StartedAtMs, string? DataJson, long? DeletedAtMs = null, long? UpdatedAtMs = null);

public record PushSplitsRequest(List<SplitDto> Splits);
public record SplitDto(string Id, long UpdatedAtMs, string? DataJson, long? DeletedAtMs = null);

public record PushExercisesRequest(List<ExerciseDto> Exercises);
/// Kind and Shared are filled in on pull only; a push reads the kind from DataJson.
public record ExerciseDto(string Id, long CreatedAtMs, string? DataJson, long? DeletedAtMs = null, string? Kind = null, bool? Shared = null);

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
    string? ProgressPhotoDataUrl,
    double? Height,
    string HeightUnit,
    double? Weight,
    string WeightUnit,
    bool BlocksCollapsedByDefault,
    string RestDefaultsJson,
    string? NavConfigJson,
    string? HomeConfigJson,
    string? ActiveSplitId,
    long UpdatedAtMs,
    // Per split: { lastDayId, recordedAtMs }. Merged per split on push (see PushProfile), not
    // replaced with the rest of the profile. Last so older stored profiles still read.
    string? SplitRotationJson = null,
    // Goals + weekly streak settings: { goalId: { ..., updatedAtMs }, streak: { ..., updatedAtMs } }.
    // Merged per key on push like SplitRotationJson.
    string? GoalsJson = null,
    // Social profile cards: { slots: [{ id, enabled, orderIndex }] }. Edited on the phone or the
    // dashboard; last write wins with the rest of the profile.
    string? ProfileConfigJson = null,
    // Plugin settings: { community: { enabled, acknowledgedRisk, updatedAtMs } }. Merged per key
    // on push like GoalsJson, so the community plugins switch is the same on every device.
    string? PluginSettingsJson = null,
    // The goal picked in the app's onboarding: strength, muscle, both, fit, leaner. The
    // dashboard arranges Overview by it until the layout is changed by hand. Kept when a
    // push leaves it out (an app from before this field).
    string? TrainingGoal = null,
    // What they bring to the gym (canvas EQ4) and their experience from setup (HT3), both shown
    // to a coach. Kept when a push leaves them out.
    string? KitJson = null,
    string? Experience = null
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
public record PushExerciseSettingsRequest(List<SyncRowDto> Settings);
public record PushProgressionRecipesRequest(List<SyncRowDto> Recipes);
public record PushWeightEntriesRequest(List<SyncRowDto> Entries);
public record PushHabitsRequest(List<SyncRowDto> Habits);
public record PushPlacesRequest(List<SyncRowDto> Places);
public record PushPluginInstallsRequest(List<SyncRowDto> Plugins);
public record PushInsightChartsRequest(List<SyncRowDto> Charts);
public record PushHabitEntriesRequest(List<SyncRowDto> Entries);

public record NutritionGoalDto(string DataJson, long UpdatedAtMs);
