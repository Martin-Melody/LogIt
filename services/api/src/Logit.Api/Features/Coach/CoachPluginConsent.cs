using System.Security.Claims;
using System.Text.Json;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Coach;

/// A client allowing a coach's plugin (canvas PG8): a block or a progression rule in the
/// coach's program that runs on a plugin. The client's phone says what they chose, or that the
/// plugin has gone from it; the coach sees it on the client's Training tab ("Aoife hasn't
/// allowed EMOM timer"). The install itself stays on the client's devices.
public static class CoachPluginConsent
{
    public static readonly string[] States = ["allowed", "declined", "removed"];
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public record ConsentBody(string PluginId, string Name, string State);
    public record Consent(string State, string Name, long AtMs);

    public static Dictionary<string, Consent> Read(string? json)
    {
        if (string.IsNullOrEmpty(json)) return [];
        try { return JsonSerializer.Deserialize<Dictionary<string, Consent>>(json, Json) ?? []; }
        catch (JsonException) { return []; }
    }

    public static void MapCoachPluginConsentEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPut("/coach/coaches/{relationshipId:guid}/plugins", Set).WithTags("Coach").RequireAuthorization();
    }

    private static async Task<IResult> Set(Guid relationshipId, ConsentBody body, ClaimsPrincipal caller, AppDbContext db, CancellationToken ct)
    {
        var me = caller.GetUserId();
        var rel = await db.CoachClientRelationships.FirstOrDefaultAsync(r => r.Id == relationshipId && r.ClientId == me
            && (r.Status == CoachClientStatus.Active || r.Status == CoachClientStatus.Paused), ct);
        if (rel is null) return Results.NotFound();
        if (string.IsNullOrWhiteSpace(body.PluginId) || body.PluginId.Length > 200 || !States.Contains(body.State))
            return Results.BadRequest(new { error = "pluginId and a state (allowed, declined or removed) are needed." });
        var all = Read(rel.PluginConsentJson);
        if (all.Count >= 50 && !all.ContainsKey(body.PluginId)) return Results.BadRequest(new { error = "Too many plugins." });
        var name = (body.Name ?? "").Trim();
        all[body.PluginId] = new Consent(body.State, name.Length is > 0 and <= 120 ? name : body.PluginId, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        rel.PluginConsentJson = JsonSerializer.Serialize(all, Json);
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { pluginConsent = all });
    }
}
