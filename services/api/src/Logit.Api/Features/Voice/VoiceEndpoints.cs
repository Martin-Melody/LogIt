using System.Security.Claims;
using System.Text.RegularExpressions;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Photos;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Voice;

/// Voice messages (design canvas M5–M6, C1–C2): upload a recording, fetch one by its address,
/// delete your own. Up to a minute, as on Instagram. Like a photo, the address is random and an
/// <audio> element can load it without signing in.
public static class VoiceEndpoints
{
    public const long MaxBytes = 2 * 1024 * 1024;
    public const int MaxMs = 60_000;

    public static void MapVoiceEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/voice").WithTags("Voice");
        g.MapPost("", Upload).RequireAuthorization().RequireRateLimiting(PhotoEndpoints.UploadRateLimitPolicy).DisableAntiforgery();
        g.MapGet("/{id:guid}", Get).AllowAnonymous();
        g.MapDelete("/{id:guid}", Delete).RequireAuthorization();
    }

    public record VoiceDto(Guid Id, string Url, int DurationMs);

    public static string UrlOf(Guid id) => $"/voice/{id:N}";
    public static string KeyOf(Guid id) => $"v{id:N}";

    /// The recording's real type, from its first bytes (what the browser or phone recorded).
    public static string? Sniff(ReadOnlySpan<byte> b)
    {
        if (b.Length >= 4 && b[0] == 0x1A && b[1] == 0x45 && b[2] == 0xDF && b[3] == 0xA3) return "audio/webm";
        if (b.Length >= 4 && b[..4].SequenceEqual("OggS"u8)) return "audio/ogg";
        if (b.Length >= 8 && b[4..8].SequenceEqual("ftyp"u8)) return "audio/mp4";
        return null;
    }

    private static async Task<IResult> Upload(HttpRequest request, ClaimsPrincipal caller, AppDbContext db, IPhotoStore store, CancellationToken ct)
    {
        if (!request.HasFormContentType) return Results.BadRequest(new { error = "Send the recording as multipart form data, field \"file\"." });
        var form = await request.ReadFormAsync(ct);
        var file = form.Files.GetFile("file");
        if (file is null || file.Length == 0) return Results.BadRequest(new { error = "Nothing was recorded." });
        if (file.Length > MaxBytes) return Results.Json(new { error = "That recording is too long." }, statusCode: StatusCodes.Status413PayloadTooLarge);
        if (!int.TryParse(form["durationMs"], out var ms) || ms < 300) return Results.BadRequest(new { error = "That recording is too short." });
        if (ms > MaxMs + 2_000) return Results.BadRequest(new { error = "Voice messages are up to a minute." });

        using var buffer = new MemoryStream();
        await file.CopyToAsync(buffer, ct);
        var bytes = buffer.ToArray();
        var type = Sniff(bytes);
        if (type is null) return Results.BadRequest(new { error = "That isn't a recording LogIt can play." });

        var voice = new VoiceNote { OwnerId = caller.GetUserId(), ContentType = type, DurationMs = Math.Min(ms, MaxMs), Bytes = bytes.Length };
        await store.PutAsync(KeyOf(voice.Id), bytes, type, ct);
        db.VoiceNotes.Add(voice);
        await db.SaveChangesAsync(ct);
        return Results.Ok(new VoiceDto(voice.Id, UrlOf(voice.Id), voice.DurationMs));
    }

    /// A recording the user uploaded, for attaching to something they send; null if it isn't theirs.
    public static Task<VoiceNote?> OwnedAsync(AppDbContext db, Guid ownerId, Guid id) =>
        db.VoiceNotes.AsNoTracking().FirstOrDefaultAsync(v => v.Id == id && v.OwnerId == ownerId);

    private static readonly Regex Levels = new("^[0-9]{1,64}$", RegexOptions.Compiled);
    /// The waveform the sender's phone measured while recording: one digit (0–9) per bar.
    public static string Peaks(string? peaks) => peaks is not null && Levels.IsMatch(peaks) ? peaks : "";

    private static async Task<IResult> Get(Guid id, AppDbContext db, IPhotoStore store, HttpResponse response, CancellationToken ct)
    {
        var voice = await db.VoiceNotes.AsNoTracking().FirstOrDefaultAsync(v => v.Id == id && v.OwnerId != null, ct);
        await using var stream = voice is null ? null : await store.OpenAsync(KeyOf(id), ct);
        if (voice is null || stream is null) return Results.NotFound();
        // Small (a minute at most), so read it whole: players need byte ranges to seek.
        using var copy = new MemoryStream();
        await stream.CopyToAsync(copy, ct);
        response.Headers.CacheControl = "private, max-age=31536000, immutable";
        return Results.File(copy.ToArray(), voice.ContentType, enableRangeProcessing: true);
    }

    private static async Task<IResult> Delete(Guid id, ClaimsPrincipal caller, AppDbContext db, IPhotoStore store, CancellationToken ct)
    {
        var voice = await db.VoiceNotes.FirstOrDefaultAsync(v => v.Id == id && v.OwnerId == caller.GetUserId(), ct);
        if (voice is null) return Results.NotFound();
        await store.DeleteAsync(KeyOf(id), ct);
        db.VoiceNotes.Remove(voice);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}
