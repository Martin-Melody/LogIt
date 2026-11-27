using System.Security.Claims;
using System.Text.Json;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Coach;

/// Messages sent for the coach (canvas MS3): only where something happens without a click from
/// them. A welcome when someone starts straight away (a pay-and-start link), a first reply to a
/// new request, a message when someone lands on the waiting list by itself. Sent as the coach,
/// marked kind "auto" so both sides see "Sent automatically". Never to or from sample clients.
public static class CoachAutoMessages
{
    public record Item(bool On, string Text);
    public record Settings(Item OnStart, Item OnAsk, Item OnWaitingList);
    public const int MaxText = 2000;
    public const string Kind = "auto";
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly Item Off = new(false, "");
    public static readonly Settings None = new(Off, Off, Off);

    public enum When { Start, Ask, WaitingList }

    public static void MapCoachAutoMessages(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/coach/auto-messages").WithTags("Coach").RequireAuthorization();
        g.MapGet("", Get).RequireCoaching();
        g.MapPut("", Put).RequireCoaching();
    }

    public static Settings Read(string? json)
    {
        if (string.IsNullOrEmpty(json)) return None;
        try { return JsonSerializer.Deserialize<Settings>(json, Json) ?? None; }
        catch (JsonException) { return None; }
    }

    private static async Task<IResult> Get(ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var json = await db.Users.Where(u => u.Id == me).Select(u => u.CoachAutoMessagesJson).FirstOrDefaultAsync();
        return Results.Ok(Read(json));
    }

    private static async Task<IResult> Put([FromBody] Settings body, ClaimsPrincipal caller, AppDbContext db)
    {
        foreach (var i in new[] { body.OnStart, body.OnAsk, body.OnWaitingList })
        {
            if (i is null) return Results.BadRequest(new { error = "Missing a message." });
            if ((i.Text ?? "").Length > MaxText) return Results.BadRequest(new { error = $"A message is up to {MaxText} characters." });
            if (i.On && string.IsNullOrWhiteSpace(i.Text)) return Results.BadRequest(new { error = "Write the message before switching it on." });
        }
        var me = caller.GetUserId();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == me);
        if (user is null) return Results.NotFound();
        user.CoachAutoMessagesJson = JsonSerializer.Serialize(body with
        {
            OnStart = body.OnStart with { Text = body.OnStart.Text.Trim() },
            OnAsk = body.OnAsk with { Text = body.OnAsk.Text.Trim() },
            OnWaitingList = body.OnWaitingList with { Text = body.OnWaitingList.Text.Trim() },
        }, Json);
        await db.SaveChangesAsync();
        return Results.Ok(Read(user.CoachAutoMessagesJson));
    }

    /// Adds the coach's message for this moment to the conversation, if they have one on. The
    /// caller saves. {first name} and {coach name} are filled in here (it's sent, not typed).
    public static void Queue(AppDbContext db, CoachClientRelationship rel, User coach, User client, When when, DateTime now)
    {
        if (coach.IsSample || client.IsSample) return;
        var s = Read(coach.CoachAutoMessagesJson);
        var item = when switch { When.Start => s.OnStart, When.Ask => s.OnAsk, _ => s.OnWaitingList };
        if (!item.On || string.IsNullOrWhiteSpace(item.Text)) return;
        var first = (string.IsNullOrWhiteSpace(client.DisplayName) ? client.Username : client.DisplayName).Split(' ')[0];
        var coachName = string.IsNullOrWhiteSpace(coach.DisplayName) ? coach.Username : coach.DisplayName;
        var body = item.Text.Replace("{first name}", first, StringComparison.OrdinalIgnoreCase)
            .Replace("{coach name}", coachName, StringComparison.OrdinalIgnoreCase).Replace("{exercise}", "", StringComparison.OrdinalIgnoreCase);
        db.CoachMessages.Add(new CoachMessage
        {
            MessageId = $"auto-{Guid.NewGuid():N}", RelationshipId = rel.Id, SenderUserId = coach.Id,
            Body = body, CreatedAtMs = new DateTimeOffset(now).ToUnixTimeMilliseconds() + 5, Kind = Kind,
        });
    }
}
