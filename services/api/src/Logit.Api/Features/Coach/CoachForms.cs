using System.Text.Json.Nodes;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Coach;

/// The forms a new client gets when they take a spot (canvas J3, J4): the coach's start-up form
/// (filled in once) and any shared check-in set to "start them with". Each becomes the client's
/// own copy that follows the shared form (core domain/Checkin.ts copyForClient). Forms are kept
/// as the apps' JSON, so this edits the JSON rather than a typed model.
public static class CoachForms
{
    public static async Task StartAsync(AppDbContext db, CoachClientRelationship rel, DateTime now, CancellationToken ct = default)
    {
        var templates = await db.CheckinSchedules.AsNoTracking()
            .Where(s => s.CoachId == rel.CoachId && s.RecipientUserId == null && s.DeletedAtMs == null)
            .ToListAsync(ct);
        if (templates.Count == 0) return;
        var copies = await db.CheckinSchedules.AsNoTracking()
            .Where(s => s.CoachId == rel.CoachId && s.RecipientUserId == rel.ClientId && s.DeletedAtMs == null)
            .Select(s => s.DataJson).ToListAsync(ct);
        var already = copies.Select(j => Parse(j)?["sourceId"]?.GetValue<string>()).Where(x => x is not null).ToHashSet();
        var ms = new DateTimeOffset(DateTime.SpecifyKind(now, DateTimeKind.Utc)).ToUnixTimeMilliseconds();

        foreach (var t in templates)
        {
            var form = Parse(t.DataJson);
            if (form is null || form["archived"]?.GetValue<bool>() == true) continue;
            var startup = form["kind"]?.GetValue<string>() == "startup";
            if (!startup && form["autoStart"]?.GetValue<bool>() != true) continue;
            if (already.Contains(t.ScheduleId)) continue;

            var id = "ckin_" + Guid.NewGuid().ToString("N")[..21];
            form["id"] = id;
            form["sourceId"] = t.ScheduleId;
            form["own"] = false;
            form.Remove("autoStart");
            if (startup) form["cadence"] = "manual";
            form["anchorMs"] = ms;
            form["createdAtMs"] = ms;
            form["updatedAtMs"] = ms;
            db.CheckinSchedules.Add(new CheckinSchedule
            {
                ScheduleId = id,
                CoachId = rel.CoachId,
                RecipientUserId = rel.ClientId,
                RelationshipId = rel.Id,
                UpdatedAtMs = ms,
                DataJson = form.ToJsonString(),
                SyncedAt = now,
            });
        }
    }

    private static JsonObject? Parse(string json)
    {
        try { return JsonNode.Parse(json) as JsonObject; }
        catch (System.Text.Json.JsonException) { return null; }
    }
}
