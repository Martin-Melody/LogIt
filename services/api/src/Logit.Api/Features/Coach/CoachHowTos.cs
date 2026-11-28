using System.Security.Claims;
using System.Text.Json;
using System.Text.RegularExpressions;
using Logit.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Coach;

/// A coach's own how-tos (canvas HT4): per exercise, pictures, a video link, three cues, the
/// most common mistake and a note. Shown to their clients instead of LogIt's; the web copies the
/// ones a program uses into each client's copy, so the phone has them offline. Videos are
/// YouTube or Vimeo only (stored as provider, id and start).
public static partial class CoachHowTos
{
    public record Video(string Provider, string Id, int? StartSec);
    public record HowTo(string ExerciseName, string[]? Pictures, Video? Video, string[]? Cues, string? Mistake, string? Note);
    public record Body(List<HowTo> HowTos);

    public const int MaxHowTos = 400;
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [GeneratedRegex(@"^[\w-]{6,20}$")] private static partial Regex YouTubeId();
    [GeneratedRegex(@"^\d{6,12}$")] private static partial Regex VimeoId();

    public static void MapCoachHowTos(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/coach/howtos").WithTags("Coach").RequireAuthorization();
        g.MapGet("", Get).RequireCoaching();
        g.MapPut("", Put).RequireCoaching();
    }

    public static List<HowTo> Read(string? json)
    {
        if (string.IsNullOrEmpty(json)) return [];
        try { return JsonSerializer.Deserialize<List<HowTo>>(json, Json) ?? []; }
        catch (JsonException) { return []; }
    }

    private static async Task<IResult> Get(ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var json = await db.Users.Where(u => u.Id == me).Select(u => u.CoachHowTosJson).FirstOrDefaultAsync();
        return Results.Ok(new { howTos = Read(json) });
    }

    /// Why a how-to can't be saved, or null.
    public static string? Problem(HowTo h)
    {
        if (string.IsNullOrWhiteSpace(h.ExerciseName) || h.ExerciseName.Length > 120) return "Each how-to needs its exercise.";
        if ((h.Cues?.Length ?? 0) > 3 || (h.Cues ?? []).Any(c => (c ?? "").Length > 140)) return "Up to three cues, 140 characters each.";
        if ((h.Mistake ?? "").Length > 200 || (h.Note ?? "").Length > 400) return "The mistake is up to 200 characters, the note 400.";
        if ((h.Pictures?.Length ?? 0) > 4 || (h.Pictures ?? []).Any(p => !Uri.TryCreate(p, UriKind.Absolute, out var u) || u.Scheme != "https")) return "Up to four pictures, each an https link.";
        if (h.Video is { } v)
        {
            var ok = v.Provider switch { "youtube" => YouTubeId().IsMatch(v.Id ?? ""), "vimeo" => VimeoId().IsMatch(v.Id ?? ""), _ => false };
            if (!ok || v.StartSec is < 0 or > 36000) return "Videos are YouTube or Vimeo links.";
        }
        return null;
    }

    private static async Task<IResult> Put([FromBody] Body body, ClaimsPrincipal caller, AppDbContext db)
    {
        if (body.HowTos is null || body.HowTos.Count > MaxHowTos) return Results.BadRequest(new { error = $"Up to {MaxHowTos} how-tos." });
        foreach (var h in body.HowTos)
            if (Problem(h) is { } p) return Results.BadRequest(new { error = p });
        var clean = body.HowTos
            .GroupBy(h => h.ExerciseName.Trim().ToLowerInvariant()).Select(g => g.Last())
            .Select(h => h with
            {
                ExerciseName = h.ExerciseName.Trim(),
                Cues = h.Cues?.Select(c => c.Trim()).Where(c => c.Length > 0).ToArray(),
                Mistake = string.IsNullOrWhiteSpace(h.Mistake) ? null : h.Mistake.Trim(),
                Note = string.IsNullOrWhiteSpace(h.Note) ? null : h.Note.Trim(),
            })
            .ToList();
        var me = caller.GetUserId();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == me);
        if (user is null) return Results.NotFound();
        user.CoachHowTosJson = JsonSerializer.Serialize(clean, Json);
        await db.SaveChangesAsync();
        return Results.Ok(new { howTos = clean });
    }
}
