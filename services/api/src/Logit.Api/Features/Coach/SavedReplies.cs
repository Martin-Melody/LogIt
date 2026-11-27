using System.Security.Claims;
using System.Text.Json;
using Logit.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Coach;

/// A coach's saved replies (canvas W10): short snippets typed with "/" in a message box, with
/// {first name}, {exercise} and {coach name} filled in on the device. Plain text. The whole list
/// is saved at once; it's small and only ever edited by its coach.
public static class SavedReplies
{
    public record Reply(string Id, string Shortcut, string Title, string Body);
    public record Body(List<Reply> Replies);
    public const int MaxReplies = 100, MaxShortcut = 20, MaxTitle = 60, MaxBody = 2000;
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static void MapSavedReplies(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/coach/saved-replies").WithTags("Coach").RequireAuthorization();
        g.MapGet("", Get).RequireCoaching();
        g.MapPut("", Put).RequireCoaching();
    }

    private static List<Reply> Read(string? json)
    {
        if (string.IsNullOrEmpty(json)) return [];
        try { return JsonSerializer.Deserialize<List<Reply>>(json, Json) ?? []; }
        catch (JsonException) { return []; }
    }

    private static async Task<IResult> Get(ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var json = await db.Users.Where(u => u.Id == me).Select(u => u.CoachSavedRepliesJson).FirstOrDefaultAsync();
        return Results.Ok(new { replies = Read(json) });
    }

    private static async Task<IResult> Put([FromBody] Body body, ClaimsPrincipal caller, AppDbContext db)
    {
        var list = body.Replies ?? [];
        if (list.Count > MaxReplies) return Results.BadRequest(new { error = $"At most {MaxReplies} saved replies." });
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var r in list)
        {
            if (string.IsNullOrWhiteSpace(r.Id) || r.Id.Length > 60) return Results.BadRequest(new { error = "Each reply needs an id." });
            var shortcut = r.Shortcut?.Trim() ?? "";
            if (shortcut.Length is 0 or > MaxShortcut || shortcut.Any(char.IsWhiteSpace))
                return Results.BadRequest(new { error = $"A shortcut is one word, up to {MaxShortcut} characters." });
            if (!seen.Add(shortcut)) return Results.BadRequest(new { error = $"Two replies use /{shortcut}." });
            if ((r.Title ?? "").Length > MaxTitle) return Results.BadRequest(new { error = $"A title is up to {MaxTitle} characters." });
            if (string.IsNullOrWhiteSpace(r.Body) || r.Body.Length > MaxBody) return Results.BadRequest(new { error = $"A reply is 1 to {MaxBody} characters." });
        }
        var me = caller.GetUserId();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == me);
        if (user is null) return Results.NotFound();
        user.CoachSavedRepliesJson = JsonSerializer.Serialize(list.Select(r => r with { Shortcut = r.Shortcut.Trim() }), Json);
        await db.SaveChangesAsync();
        return Results.Ok(new { replies = Read(user.CoachSavedRepliesJson) });
    }
}
