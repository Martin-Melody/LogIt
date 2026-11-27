using System.Security.Claims;
using System.Text.Json;
using Logit.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Coach;

/// Which cards a coach shows on a client's Overview (canvas W11): for everyone, for everyone on a
/// package, or for one client; the most specific list wins. Today and Your month have one list
/// each (canvas W13). Card ids are LogIt's ("training", "food"…) or "plugin:<id>" for a widget
/// plugin; the web decides what each one draws.
public static class CoachCards
{
    public record Layout(List<string>? All, Dictionary<string, List<string>>? Packages, Dictionary<string, List<string>>? Clients, List<string>? Today = null, List<string>? Month = null);
    public const int MaxCards = 30, MaxLists = 500, MaxId = 120;
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static void MapCoachCards(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/coach/cards").WithTags("Coach").RequireAuthorization();
        g.MapGet("", Get).RequireCoaching();
        g.MapPut("", Put).RequireCoaching();
    }

    private static Layout Read(string? json)
    {
        if (string.IsNullOrEmpty(json)) return new Layout(null, null, null);
        try { return JsonSerializer.Deserialize<Layout>(json, Json) ?? new Layout(null, null, null); }
        catch (JsonException) { return new Layout(null, null, null); }
    }

    private static string? Check(List<string>? cards)
    {
        if (cards is null) return null;
        if (cards.Count > MaxCards) return $"At most {MaxCards} cards.";
        if (cards.Any(c => string.IsNullOrWhiteSpace(c) || c.Length > MaxId)) return "A card id is missing or too long.";
        if (cards.Distinct().Count() != cards.Count) return "A card is listed twice.";
        return null;
    }

    private static async Task<IResult> Get(ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var json = await db.Users.Where(u => u.Id == me).Select(u => u.CoachCardsJson).FirstOrDefaultAsync();
        return Results.Ok(Read(json));
    }

    private static async Task<IResult> Put([FromBody] Layout body, ClaimsPrincipal caller, AppDbContext db)
    {
        var lists = new[] { body.All, body.Today, body.Month }.Concat(body.Packages?.Values ?? Enumerable.Empty<List<string>>()).Concat(body.Clients?.Values ?? Enumerable.Empty<List<string>>()).ToList();
        if (lists.Count > MaxLists) return Results.BadRequest(new { error = "Too many card lists." });
        foreach (var l in lists) if (Check(l) is { } err) return Results.BadRequest(new { error = err });
        var keys = (body.Packages?.Keys ?? Enumerable.Empty<string>()).Concat(body.Clients?.Keys ?? Enumerable.Empty<string>());
        if (keys.Any(k => !Guid.TryParse(k, out _))) return Results.BadRequest(new { error = "Lists are for a package or a client id." });
        var me = caller.GetUserId();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == me);
        if (user is null) return Results.NotFound();
        user.CoachCardsJson = JsonSerializer.Serialize(body, Json);
        await db.SaveChangesAsync();
        return Results.Ok(Read(user.CoachCardsJson));
    }
}
