using System.Security.Claims;
using System.Text.RegularExpressions;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Photos;

/// Upload a photo, fetch one by its address, delete your own. A photo's address is
/// /photos/{id}: anyone who has it can load it (an <img> sends no sign-in), and only people who
/// were shown it have it.
public static class PhotoEndpoints
{
    public const string UploadRateLimitPolicy = "photo-upload";
    /// Phones send their own picture already shrunk; this leaves room for a camera original.
    public const long MaxUploadBytes = 15 * 1024 * 1024;

    public static void MapPhotoEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/photos").WithTags("Photos");
        g.MapPost("", Upload).RequireAuthorization().RequireRateLimiting(UploadRateLimitPolicy).DisableAntiforgery();
        g.MapGet("/{id:guid}", Get).AllowAnonymous();
        g.MapDelete("/{id:guid}", Delete).RequireAuthorization();
    }

    public record PhotoDto(Guid Id, string Url, int Width, int Height);

    private static async Task<IResult> Upload(HttpRequest request, ClaimsPrincipal caller, AppDbContext db, IPhotoStore store, CancellationToken ct)
    {
        if (!request.HasFormContentType) return Results.BadRequest(new { error = "Send the photo as multipart form data, field \"file\"." });
        var form = await request.ReadFormAsync(ct);
        var file = form.Files.GetFile("file");
        if (file is null || file.Length == 0) return Results.BadRequest(new { error = "No photo was sent." });
        if (file.Length > MaxUploadBytes) return Results.Json(new { error = "That photo is too big (15 MB at most)." }, statusCode: StatusCodes.Status413PayloadTooLarge);

        using var buffer = new MemoryStream();
        await file.CopyToAsync(buffer, ct);
        var processed = PhotoProcessing.Process(buffer.ToArray());
        if (processed is null) return Results.BadRequest(new { error = "That isn't a picture LogIt can read (JPEG, PNG or WebP)." });

        var photo = new Photo { OwnerId = caller.GetUserId(), Width = processed.Width, Height = processed.Height, Bytes = processed.Bytes.Length };
        await store.PutAsync(photo.Id.ToString("N"), processed.Bytes, photo.ContentType, ct);
        db.Photos.Add(photo);
        await db.SaveChangesAsync(ct);
        return Results.Ok(new PhotoDto(photo.Id, UrlOf(photo.Id), photo.Width, photo.Height));
    }

    public static string UrlOf(Guid id) => $"/photos/{id:N}";

    /// A photo the user uploaded, for attaching to something they send; null if it isn't theirs.
    public static Task<Photo?> OwnedAsync(AppDbContext db, Guid ownerId, Guid id) =>
        db.Photos.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id && p.OwnerId == ownerId);

    private static readonly Regex PhotoRef = new("/photos/([0-9a-f]{32})", RegexOptions.Compiled);

    /// The photos a piece of text (an avatar address, a profile's JSON) points at.
    public static HashSet<Guid> RefsIn(params string?[] texts) =>
        texts.Where(t => t is not null).SelectMany(t => PhotoRef.Matches(t!)).Select(m => Guid.ParseExact(m.Groups[1].Value, "N")).ToHashSet();

    /// Deletes those of the ids the user owns (file and row). Caller saves.
    public static async Task DeleteOwnedAsync(AppDbContext db, IPhotoStore store, Guid ownerId, IEnumerable<Guid> ids, CancellationToken ct)
    {
        var list = ids.ToList();
        var owned = await db.Photos.Where(p => p.OwnerId == ownerId && list.Contains(p.Id)).ToListAsync(ct);
        foreach (var p in owned) await store.DeleteAsync(p.Id.ToString("N"), ct);
        db.Photos.RemoveRange(owned);
    }

    private static async Task<IResult> Get(Guid id, AppDbContext db, IPhotoStore store, HttpResponse response, CancellationToken ct)
    {
        var photo = await db.Photos.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id && p.OwnerId != null, ct);
        var stream = photo is null ? null : await store.OpenAsync(id.ToString("N"), ct);
        if (photo is null || stream is null) return Results.NotFound();
        // The picture behind an address never changes; a new picture gets a new address.
        response.Headers.CacheControl = "private, max-age=31536000, immutable";
        return Results.Stream(stream, photo.ContentType);
    }

    private static async Task<IResult> Delete(Guid id, ClaimsPrincipal caller, AppDbContext db, IPhotoStore store, CancellationToken ct)
    {
        var photo = await db.Photos.FirstOrDefaultAsync(p => p.Id == id && p.OwnerId == caller.GetUserId(), ct);
        if (photo is null) return Results.NotFound();
        await store.DeleteAsync(id.ToString("N"), ct);
        db.Photos.Remove(photo);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}

/// Photos whose owner deleted their account (OwnerId set to null by the database) leave the
/// store and the database, every 10 minutes.
public class PhotoSweeper(IServiceScopeFactory scopes, ILogger<PhotoSweeper> log, TimeProvider clock) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(TimeSpan.FromMinutes(1), clock, stoppingToken); }
        catch (OperationCanceledException) { return; }
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(10), clock);
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                await SweepAsync(scope.ServiceProvider, stoppingToken);
            }
            catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
            {
                log.LogError(ex, "Photo sweep failed");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    /// One pass; returns how many photos were removed. Public so tests can run it.
    public static async Task<int> SweepAsync(IServiceProvider services, CancellationToken ct)
    {
        var db = services.GetRequiredService<AppDbContext>();
        var store = services.GetRequiredService<IPhotoStore>();
        var orphans = await db.Photos.Where(p => p.OwnerId == null).Take(500).ToListAsync(ct);
        foreach (var p in orphans) await store.DeleteAsync(p.Id.ToString("N"), ct);
        db.Photos.RemoveRange(orphans);
        await db.SaveChangesAsync(ct);
        return orphans.Count;
    }
}
