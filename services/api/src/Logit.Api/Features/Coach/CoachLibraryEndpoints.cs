using System.Security.Claims;
using System.Text.Json;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Coach;

/// A coach's library is their own synced items (SyncedExercise rows). The coach switches
/// "clients see it" per item; a client gets, read-only, every item a coach of theirs shares
/// plus anything in a program that coach assigned them (so they can see how to do it and
/// swap by muscle), whether shared or not.
public static class CoachLibraryEndpoints
{
    public const int MaxIdsPerRequest = 500;

    public static void Map(RouteGroupBuilder group)
    {
        group.MapPut("/library/sharing", SetSharing).RequireCoaching();
        // Any tier: a Free client can be coached.
        group.MapGet("/library/shared", GetShared);
    }

    public record SetSharingRequest(List<string> Ids, bool Shared);

    private static async Task<IResult> SetSharing(SetSharingRequest req, ClaimsPrincipal caller, AppDbContext db)
    {
        if (req.Ids is null || req.Ids.Count == 0) return Results.BadRequest(new { error = "No items." });
        if (req.Ids.Count > MaxIdsPerRequest) return Results.BadRequest(new { error = $"At most {MaxIdsPerRequest} items at a time." });

        var changed = await CoachLibrary.SetShared(db, caller.GetUserId(), req.Ids, req.Shared);
        return Results.Ok(new { changed });
    }

    private static async Task<IResult> GetShared(ClaimsPrincipal caller, AppDbContext db)
    {
        var items = await CoachLibrary.SharedWith(db, caller.GetUserId());
        return Results.Ok(new { items });
    }
}

public record SharedLibraryItemDto(
    Guid CoachId,
    string CoachName,
    string Id,
    string Kind,
    string DataJson,
    bool ViaProgram,
    long UpdatedAtMs);

public static class CoachLibrary
{
    /// Flips the switch on the coach's own live items. Returns how many changed. SyncedAt
    /// moves so the coach's other devices pick the change up.
    public static async Task<int> SetShared(AppDbContext db, Guid coachId, IReadOnlyCollection<string> ids, bool shared)
    {
        var rows = await db.SyncedExercises
            .Where(e => e.UserId == coachId && e.DeletedAtMs == null && ids.Contains(e.ClientId) && e.SharedWithClients != shared)
            .ToListAsync();
        foreach (var r in rows)
        {
            r.SharedWithClients = shared;
            r.SyncedAt = DateTime.UtcNow;
        }
        await db.SaveChangesAsync();
        return rows.Count;
    }

    /// Everything the client's coaches share with them, newest coaches' items included as
    /// soon as the relationship is active, gone as soon as it isn't.
    public static async Task<List<SharedLibraryItemDto>> SharedWith(AppDbContext db, Guid clientId)
    {
        var coaches = await db.CoachClientRelationships.AsNoTracking()
            .Where(r => r.ClientId == clientId && r.Status == CoachClientStatus.Active)
            .Select(r => new { r.CoachId, r.Coach.DisplayName, r.Coach.Username })
            .ToListAsync();
        if (coaches.Count == 0) return [];
        var coachIds = coaches.Select(c => c.CoachId).ToList();

        var programs = await db.CoachPrograms.AsNoTracking()
            .Where(p => p.RecipientUserId == clientId && p.DeletedAtMs == null && coachIds.Contains(p.CoachId))
            .Select(p => new { p.CoachId, p.DataJson })
            .ToListAsync();
        var refs = coachIds.ToDictionary(id => id, _ => new ProgramRefs());
        foreach (var p in programs) refs[p.CoachId].Add(p.DataJson);

        var rows = await db.SyncedExercises.AsNoTracking()
            .Where(e => coachIds.Contains(e.UserId) && e.DeletedAtMs == null)
            .Select(e => new { e.UserId, e.ClientId, e.Kind, e.DataJson, e.SharedWithClients, e.SyncedAt })
            .ToListAsync();

        var names = coaches.ToDictionary(c => c.CoachId, c => string.IsNullOrWhiteSpace(c.DisplayName) ? c.Username : c.DisplayName);
        var result = new List<SharedLibraryItemDto>();
        foreach (var r in rows)
        {
            var viaProgram = refs[r.UserId].Uses(r.ClientId, r.Kind, r.DataJson);
            if (!r.SharedWithClients && !viaProgram) continue;
            result.Add(new SharedLibraryItemDto(
                r.UserId, names[r.UserId], r.ClientId, r.Kind, r.DataJson, viaProgram,
                new DateTimeOffset(DateTime.SpecifyKind(r.SyncedAt, DateTimeKind.Utc)).ToUnixTimeMilliseconds()));
        }
        return result;
    }

    /// What a coach's programs for one client refer to: strength blocks by exercise id (and
    /// name, for blocks saved without one), cardio blocks by activity name.
    private sealed class ProgramRefs
    {
        private readonly HashSet<string> _exerciseIds = [];
        private readonly HashSet<string> _strengthNames = new(StringComparer.OrdinalIgnoreCase);
        private readonly HashSet<string> _cardioNames = new(StringComparer.OrdinalIgnoreCase);

        public void Add(string json)
        {
            if (string.IsNullOrEmpty(json)) return;
            try
            {
                using var doc = JsonDocument.Parse(json);
                if (!doc.RootElement.TryGetProperty("weeks", out var weeks) || weeks.ValueKind != JsonValueKind.Array) return;
                foreach (var week in weeks.EnumerateArray())
                {
                    if (!week.TryGetProperty("days", out var days) || days.ValueKind != JsonValueKind.Array) continue;
                    foreach (var day in days.EnumerateArray())
                    {
                        if (!day.TryGetProperty("blocks", out var blocks) || blocks.ValueKind != JsonValueKind.Array) continue;
                        foreach (var b in blocks.EnumerateArray()) AddBlock(b);
                    }
                }
            }
            catch (JsonException) { }
        }

        private void AddBlock(JsonElement b)
        {
            var type = Str(b, "type");
            if (type == "strength")
            {
                if (Str(b, "exerciseId") is { Length: > 0 } id) _exerciseIds.Add(id);
                if (Str(b, "exerciseName") is { Length: > 0 } n) _strengthNames.Add(n.Trim());
            }
            else if (type == "cardio" && Str(b, "activityName") is { Length: > 0 } a)
            {
                _cardioNames.Add(a.Trim());
            }
        }

        public bool Uses(string itemId, string kind, string dataJson)
        {
            if (kind == LibraryKinds.Strength)
                return _exerciseIds.Contains(itemId) || (_strengthNames.Count > 0 && _strengthNames.Contains(NameOf(dataJson)));
            if (kind == LibraryKinds.Cardio)
                return _cardioNames.Count > 0 && _cardioNames.Contains(NameOf(dataJson));
            return false;
        }

        private static string NameOf(string json)
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                return (Str(doc.RootElement, "name") ?? string.Empty).Trim();
            }
            catch (JsonException) { return string.Empty; }
        }

        private static string? Str(JsonElement e, string prop) =>
            e.ValueKind == JsonValueKind.Object && e.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.String
                ? v.GetString()
                : null;
    }
}
