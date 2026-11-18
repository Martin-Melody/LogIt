using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Coach;

/// A coach's side of saved Insights charts (the client's side is /sync/charts):
/// the charts a client chose to show their coach, and charts the coach made for the client.
/// A chart is only a recipe; drawing it reads the client's data through the usual
/// ?clientId= pulls, which apply the client's sharing switches.
public static class InsightChartEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/clients/{clientId:guid}/charts", GetClientCharts).RequireCoaching();
        group.MapPut("/clients/{clientId:guid}/charts/{chartId}", PutClientChart).RequireCoaching();
        group.MapDelete("/clients/{clientId:guid}/charts/{chartId}", DeleteClientChart).RequireCoaching();
    }

    /// True when the chart's JSON has showOn.coach = true.
    public static bool ShownToCoach(string dataJson)
    {
        if (string.IsNullOrEmpty(dataJson)) return false;
        try
        {
            using var doc = JsonDocument.Parse(dataJson);
            return doc.RootElement.ValueKind == JsonValueKind.Object
                && doc.RootElement.TryGetProperty("showOn", out var showOn)
                && showOn.ValueKind == JsonValueKind.Object
                && showOn.TryGetProperty("coach", out var coach)
                && coach.ValueKind == JsonValueKind.True;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static async Task<IResult> GetClientCharts(Guid clientId, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        if (await CoachAccess.ActiveRelationship(db, me, clientId) is null) return Results.NotFound();

        var rows = await db.SyncedInsightCharts.AsNoTracking()
            .Where(c => c.UserId == clientId && c.DeletedAtMs == null)
            .OrderBy(c => c.CreatedAtMs)
            .ToListAsync();
        var shown = rows.Where(r => r.SentByUserId != me && ShownToCoach(r.DataJson))
            .Select(r => new CoachChartDto(r.ClientId, r.DataJson, r.UpdatedAtMs)).ToList();
        var sent = rows.Where(r => r.SentByUserId == me)
            .Select(r => new CoachChartDto(r.ClientId, r.DataJson, r.UpdatedAtMs)).ToList();
        return Results.Ok(new ClientChartsDto(shown, sent));
    }

    /// Make or update a chart for a client. The server stamps `from` with the coach so the
    /// client's apps can say "From Alex". A chart id the client already uses for one of their
    /// own charts is refused.
    private static async Task<IResult> PutClientChart(
        Guid clientId, string chartId, [FromBody] CoachChartBody body, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        if (string.IsNullOrWhiteSpace(chartId) || chartId.Length > 100)
            return Results.BadRequest(new { error = "Bad chart id.", code = "invalid_chart" });
        if (await CoachAccess.ActiveRelationship(db, me, clientId) is null) return Results.NotFound();

        JsonObject json;
        try
        {
            json = JsonNode.Parse(body.DataJson ?? "") as JsonObject
                ?? throw new JsonException();
        }
        catch (JsonException)
        {
            return Results.BadRequest(new { error = "dataJson must be a JSON object.", code = "invalid_chart" });
        }
        if (body.DataJson!.Length > 20_000)
            return Results.BadRequest(new { error = "Chart is too big.", code = "invalid_chart" });

        var coach = await db.Users.AsNoTracking().Where(u => u.Id == me)
            .Select(u => new { u.DisplayName, u.Username }).FirstAsync();
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        json["id"] = chartId;
        json["from"] = new JsonObject
        {
            ["userId"] = me.ToString(),
            ["name"] = string.IsNullOrWhiteSpace(coach.DisplayName) ? coach.Username : coach.DisplayName,
        };
        json["updatedAtMs"] = now;

        var row = await db.SyncedInsightCharts.FirstOrDefaultAsync(c => c.UserId == clientId && c.ClientId == chartId);
        if (row is null)
        {
            json["createdAtMs"] = now;
            db.SyncedInsightCharts.Add(new SyncedInsightChart
            {
                ClientId = chartId,
                UserId = clientId,
                SentByUserId = me,
                CreatedAtMs = now,
                UpdatedAtMs = now,
                DataJson = json.ToJsonString(),
            });
        }
        else
        {
            if (row.SentByUserId != me) return Results.Conflict(new { error = "That chart isn't one you made.", code = "not_yours" });
            if (row.DeletedAtMs != null) return Results.Conflict(new { error = "The client removed this chart.", code = "removed" });
            json["createdAtMs"] = row.CreatedAtMs;
            row.DataJson = json.ToJsonString();
            row.UpdatedAtMs = now;
            row.SyncedAt = DateTime.UtcNow;
        }
        await db.SaveChangesAsync();
        return Results.Ok(new CoachChartDto(chartId, json.ToJsonString(), now));
    }

    private static async Task<IResult> DeleteClientChart(Guid clientId, string chartId, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var row = await db.SyncedInsightCharts.FirstOrDefaultAsync(c =>
            c.UserId == clientId && c.ClientId == chartId && c.SentByUserId == me);
        if (row is null) return Results.NotFound();
        if (row.DeletedAtMs == null)
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            row.DeletedAtMs = now;
            row.UpdatedAtMs = now;
            row.DataJson = string.Empty;
            row.SyncedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }
        return Results.NoContent();
    }
}

public record CoachChartBody(string? DataJson);
public record CoachChartDto(string Id, string DataJson, long UpdatedAtMs);
public record ClientChartsDto(List<CoachChartDto> Shown, List<CoachChartDto> Sent);
