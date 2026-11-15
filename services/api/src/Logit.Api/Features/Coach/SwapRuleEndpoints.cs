using System.Security.Claims;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Coach;

/// Which exercise swaps a client may make during a workout from their coach's program.
/// The coach sets one default for every client (User.CoachSwapRule) and can set a client
/// differently (CoachClientRelationship.SwapRule). The phone enforces it, since workouts are
/// logged there, offline too; the server only stores and hands out the rule.
public static class SwapRules
{
    /// Swap to anything (what every client could do before rules existed).
    public const string Any = "any";
    /// The coach's alternatives, plus exercises that work the same main muscles.
    public const string Muscles = "muscles";
    /// Only the alternatives the coach added to each exercise.
    public const string List = "list";

    public static readonly string[] All = [Any, Muscles, List];

    public static bool IsValid(string? rule) => rule is not null && All.Contains(rule);

    /// The rule that applies to this client: their own, else the coach's default, else "any".
    public static string Effective(CoachClientRelationship r, User coach) =>
        r.SwapRule ?? coach.CoachSwapRule ?? Any;
}

public static class SwapRuleEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/settings", GetSettings).RequireTier(UserTier.Studio);
        group.MapPut("/settings", PutSettings).RequireTier(UserTier.Studio);
        group.MapPut("/clients/{relationshipId:guid}/swap-rule", PutClientRule).RequireTier(UserTier.Studio);
    }

    private static async Task<IResult> GetSettings(ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var rule = await db.Users.Where(u => u.Id == me).Select(u => u.CoachSwapRule).FirstOrDefaultAsync();
        return Results.Ok(new CoachSettingsDto(rule ?? SwapRules.Any));
    }

    private static async Task<IResult> PutSettings(
        [FromBody] CoachSettingsDto body, ClaimsPrincipal caller, AppDbContext db)
    {
        if (!SwapRules.IsValid(body.SwapRule))
            return Results.BadRequest(new { error = "swapRule must be any, muscles or list.", code = "invalid_swap_rule" });
        var me = caller.GetUserId();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == me);
        if (user is null) return Results.NotFound();
        // "any" is stored as null so it reads the same as never having set it.
        user.CoachSwapRule = body.SwapRule == SwapRules.Any ? null : body.SwapRule;
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Results.Ok(new CoachSettingsDto(user.CoachSwapRule ?? SwapRules.Any));
    }

    /// Set one client differently from the coach's default; `swapRule: null` goes back to it.
    private static async Task<IResult> PutClientRule(
        Guid relationshipId, [FromBody] ClientSwapRuleDto body, ClaimsPrincipal caller, AppDbContext db)
    {
        if (body.SwapRule is not null && !SwapRules.IsValid(body.SwapRule))
            return Results.BadRequest(new { error = "swapRule must be any, muscles, list or null.", code = "invalid_swap_rule" });
        var me = caller.GetUserId();
        var r = await db.CoachClientRelationships.FirstOrDefaultAsync(x =>
            x.Id == relationshipId && x.CoachId == me && x.Status == CoachClientStatus.Active);
        if (r is null) return Results.NotFound();
        // UpdatedAt is left alone: it's what "client since" shows.
        r.SwapRule = body.SwapRule;
        await db.SaveChangesAsync();
        return Results.Ok(new ClientSwapRuleDto(r.SwapRule));
    }
}

public record CoachSettingsDto(string SwapRule);

public record ClientSwapRuleDto(string? SwapRule);
