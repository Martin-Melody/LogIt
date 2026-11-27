using System.Security.Claims;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.AspNetCore.Mvc;

namespace Logit.Api.Features.Coach;

/// A coach away until a date (canvas Z7): a note pinned in each client's conversation, "Away
/// until …" on the profile and the ask sheet, check-ins due meanwhile not marked late, and the
/// "no reply for 7 days" clock (Z2) counting again from the back-on day. No auto-replies: the
/// pinned note does that job. Payments carry on (pausing one client is Pause coaching).
public static class CoachAway
{
    public record AwayBody(DateTime From, DateTime Until, string? Note, bool ExcuseCheckins = true, bool TellAskers = true);
    public const int MaxNote = 500, MaxDays = 90;

    /// Set (not necessarily started yet) and not over.
    public static bool Planned(User coach, DateTime now) => coach.AwayUntil is { } until && until > now && coach.AwayFrom is not null;
    public static bool IsAway(User coach, DateTime now) => Planned(coach, now) && coach.AwayFrom <= now;

    /// What clients and the coach see; null when no away is set or it's over.
    public static object? Dto(User coach, DateTime now) => !Planned(coach, now) ? null : new
    {
        from = coach.AwayFrom,
        until = coach.AwayUntil,
        note = coach.AwayNote,
        now = IsAway(coach, now),
        excuseCheckins = coach.AwayExcusesCheckins,
        tellAskers = coach.AwayTellAskers,
    };

    /// "Away until …" for people who ask (profile and ask sheet), when the coach chose to tell them.
    public static DateTime? ForAskers(User coach, DateTime now) => IsAway(coach, now) && coach.AwayTellAskers ? coach.AwayUntil : null;

    /// The Z2 clock: a client's unanswered message sent before or during an away counts from the back-on day.
    /// An away that hasn't started yet changes nothing.
    public static DateTime ClockFrom(User coach, DateTime since, DateTime now) =>
        coach.AwayFrom is { } from && coach.AwayUntil is { } until && from <= now && since < until ? until : since;

    public static void MapCoachAwayEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/coach/away").WithTags("Coach").RequireAuthorization();
        g.MapGet("", Get).RequireCoaching();
        g.MapPut("", Set).RequireCoaching();
        g.MapDelete("", End).RequireCoaching();
    }

    private static async Task<IResult> Get(ClaimsPrincipal caller, AppDbContext db)
    {
        var me = await db.Users.FindAsync(caller.GetUserId());
        return me is null ? Results.NotFound() : Results.Ok(new { away = Dto(me, DateTime.UtcNow) });
    }

    private static async Task<IResult> Set([FromBody] AwayBody body, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = await db.Users.FindAsync(caller.GetUserId());
        if (me is null) return Results.NotFound();
        var now = DateTime.UtcNow;
        var from = DateTime.SpecifyKind(body.From, DateTimeKind.Utc);
        var until = DateTime.SpecifyKind(body.Until, DateTimeKind.Utc);
        if (until <= from) return Results.BadRequest(new { error = "\"Back on\" has to be after the day you go." });
        if (until <= now) return Results.BadRequest(new { error = "Pick a \"Back on\" day that hasn't passed." });
        if ((until - from).TotalDays > MaxDays) return Results.BadRequest(new { error = $"Away is for up to {MaxDays} days. For longer, pause coaching on each client's page." });
        var note = string.IsNullOrWhiteSpace(body.Note) ? null : body.Note.Trim();
        if (note?.Length > MaxNote) return Results.BadRequest(new { error = $"Keep the note under {MaxNote} characters." });
        me.AwayFrom = from;
        me.AwayUntil = until;
        me.AwayNote = note;
        me.AwayExcusesCheckins = body.ExcuseCheckins;
        me.AwayTellAskers = body.TellAskers;
        await db.SaveChangesAsync();
        return Results.Ok(new { away = Dto(me, now) });
    }

    /// "End now": back today. The Z2 clock counts from now for messages sent while away.
    private static async Task<IResult> End(ClaimsPrincipal caller, AppDbContext db)
    {
        var me = await db.Users.FindAsync(caller.GetUserId());
        if (me is null) return Results.NotFound();
        var now = DateTime.UtcNow;
        if (me.AwayFrom is { } from && from > now) { me.AwayFrom = null; me.AwayUntil = null; }
        else if (me.AwayUntil is { } until && until > now) me.AwayUntil = now;
        await db.SaveChangesAsync();
        return Results.NoContent();
    }
}
