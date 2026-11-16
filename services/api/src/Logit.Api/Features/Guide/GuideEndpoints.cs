using System.Security.Claims;
using System.Text.Json;
using Logit.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Guide;

/// Walkthrough progress, so the web and the phone share which chapters are done. Any plan:
/// the phone's own tours are free. The body is the apps' JSON (packages/core/src/guide/progress.ts);
/// the server only checks it's a small JSON object. The apps merge before they write, so a
/// plain last-write-wins store is enough.
public static class GuideEndpoints
{
    public const int MaxBytes = 16 * 1024;

    public static void MapGuideEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/users/me/guide").WithTags("Guide").RequireAuthorization();
        group.MapGet("", Get);
        group.MapPut("", Put);
    }

    private static async Task<IResult> Get(ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var json = await db.Users.Where(u => u.Id == me).Select(u => u.GuideJson).FirstOrDefaultAsync();
        return Results.Content(json ?? "{}", "application/json");
    }

    private static async Task<IResult> Put(HttpRequest request, ClaimsPrincipal caller, AppDbContext db)
    {
        using var reader = new StreamReader(request.Body);
        var body = await reader.ReadToEndAsync();
        if (body.Length > MaxBytes)
            return Results.BadRequest(new { error = "Walkthrough progress is too big." });
        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.ValueKind != JsonValueKind.Object)
                return Results.BadRequest(new { error = "Expected a JSON object." });
        }
        catch (JsonException)
        {
            return Results.BadRequest(new { error = "Expected a JSON object." });
        }

        var me = caller.GetUserId();
        var user = await db.Users.FindAsync(me);
        if (user is null) return Results.NotFound();
        user.GuideJson = body;
        await db.SaveChangesAsync();
        return Results.NoContent();
    }
}
