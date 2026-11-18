using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Auth;

/// Signing in on a computer by scanning a QR code with the phone (web sign-in, W1).
///
///   1. The web page asks for a request: POST /auth/pair. It gets back the request id, a code
///      to show as a QR, and a poll secret it keeps to itself. Both expire after 2 minutes.
///   2. The phone, already signed in, scans the QR and looks the code up: POST /auth/pair/look.
///      It shows where the request came from ("Chrome on Windows") and asks the person.
///   3. The person approves or turns it down on the phone: POST /auth/pair/answer.
///   4. The web page polls with its secret: POST /auth/pair/{id}/poll. Once approved, the first
///      poll gets a new session of its own (its own refresh token, listed in Where you're signed
///      in), and the request can't be used again.
///
/// What it protects against: the code alone can't collect a session (that needs the poll
/// secret, which never leaves the web page), a stolen code expires in 2 minutes and is used once,
/// a code can be approved only once, and the phone always asks first. What it can't stop: a
/// person approving a code someone else put in front of them, so the phone's question says to
/// approve only a computer you're using yourself, right now.
public static class PairingEndpoints
{
    public const string StartRateLimitPolicy = "pairing-start";
    public const string PollRateLimitPolicy = "pairing-poll";
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(2);
    /// What the QR holds: "logit-pair:" + the code. The phone's scanner knows this prefix.
    public const string QrPrefix = "logit-pair:";

    public record LookRequest(string Code);
    public record AnswerRequest(string Code, bool Approve);
    public record PollRequest(string Secret);

    public static void Map(RouteGroupBuilder auth)
    {
        auth.MapPost("/pair", Start).RequireRateLimiting(StartRateLimitPolicy);
        auth.MapPost("/pair/{id:guid}/poll", Poll).RequireRateLimiting(PollRateLimitPolicy);
        auth.MapPost("/pair/look", Look).RequireAuthorization().RequireRateLimiting(StartRateLimitPolicy);
        auth.MapPost("/pair/answer", Answer).RequireAuthorization().RequireRateLimiting(StartRateLimitPolicy);
    }

    public static string Hash(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();

    private static string NewSecret() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(24)).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    /// "logit-pair:abc" or just "abc": the phone may send the QR text as it read it.
    private static string CodeOf(string? raw)
    {
        var code = (raw ?? "").Trim();
        return code.StartsWith(QrPrefix, StringComparison.Ordinal) ? code[QrPrefix.Length..] : code;
    }

    private static async Task<IResult> Start(AppDbContext db, HttpRequest httpRequest)
    {
        var now = DateTime.UtcNow;
        // Old requests are of no use to anyone; clear them out as new ones come in.
        await db.PairingRequests.Where(p => p.ExpiresAt < now.AddHours(-1)).ExecuteDeleteAsync();

        var code = NewSecret();
        var secret = NewSecret();
        var request = new PairingRequest
        {
            CodeHash = Hash(code),
            PollSecretHash = Hash(secret),
            CreatedAt = now,
            ExpiresAt = now + Lifetime,
            Device = DeviceLabel.From(httpRequest),
        };
        db.PairingRequests.Add(request);
        await db.SaveChangesAsync();
        return Results.Ok(new
        {
            id = request.Id,
            qr = QrPrefix + code,
            secret,
            expiresAt = request.ExpiresAt,
        });
    }

    private static readonly IResult Expired = Results.Json(
        new { error = "That code has run out. Refresh the sign-in page on the computer and scan the new one.", code = "pair_expired" },
        statusCode: StatusCodes.Status410Gone);

    private static async Task<PairingRequest?> FindOpen(AppDbContext db, string? raw)
    {
        var code = CodeOf(raw);
        if (code.Length is < 16 or > 64) return null;
        var hash = Hash(code);
        var now = DateTime.UtcNow;
        return await db.PairingRequests.FirstOrDefaultAsync(p =>
            p.CodeHash == hash && p.ExpiresAt > now
            && p.ApprovedAt == null && p.DeniedAt == null && p.CollectedAt == null);
    }

    private static async Task<IResult> Look([FromBody] LookRequest req, AppDbContext db, ClaimsPrincipal caller)
    {
        var request = await FindOpen(db, req.Code);
        if (request is null) return Expired;
        return Results.Ok(new { device = request.Device, createdAt = request.CreatedAt, expiresAt = request.ExpiresAt });
    }

    private static async Task<IResult> Answer([FromBody] AnswerRequest req, AppDbContext db, ClaimsPrincipal caller)
    {
        var request = await FindOpen(db, req.Code);
        if (request is null) return Expired;
        var me = caller.GetUserId();
        var user = await db.Users.FindAsync(me);
        if (user is null || user.IsSample) return Results.Unauthorized();
        // Answered once: a conditional update, so two phones answering together can't both win.
        var now = DateTime.UtcNow;
        var open = db.PairingRequests.Where(p => p.Id == request.Id
            && p.ApprovedAt == null && p.DeniedAt == null && p.CollectedAt == null);
        var changed = req.Approve
            ? await open.ExecuteUpdateAsync(u => u.SetProperty(p => p.ApprovedUserId, me).SetProperty(p => p.ApprovedAt, now))
            : await open.ExecuteUpdateAsync(u => u.SetProperty(p => p.DeniedAt, now));
        if (changed == 0) return Expired;
        return Results.Ok(new { approved = req.Approve });
    }

    private static async Task<IResult> Poll(
        Guid id, [FromBody] PollRequest req, AppDbContext db, TokenService tokens, IConfiguration config)
    {
        var request = await db.PairingRequests.FirstOrDefaultAsync(p => p.Id == id);
        // Unknown id and wrong secret answer the same, so ids can't be probed.
        if (request is null || string.IsNullOrEmpty(req.Secret)
            || !CryptographicOperations.FixedTimeEquals(
                Encoding.ASCII.GetBytes(Hash(req.Secret)), Encoding.ASCII.GetBytes(request.PollSecretHash)))
            return Results.NotFound();

        var now = DateTime.UtcNow;
        if (request.CollectedAt is not null) return Results.Ok(new { state = "used" });
        if (request.DeniedAt is not null) return Results.Ok(new { state = "denied" });
        if (request.ApprovedUserId is not { } userId)
            return Results.Ok(new { state = request.ExpiresAt <= now ? "expired" : "waiting" });
        // Approved in time, collected a little after: fine, as long as it's soon after.
        if (request.ExpiresAt.AddMinutes(1) <= now) return Results.Ok(new { state = "expired" });

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user is null) return Results.Ok(new { state = "denied" });

        // Collected once: two polls racing can't both get a session.
        var claimed = await db.PairingRequests
            .Where(p => p.Id == request.Id && p.CollectedAt == null)
            .ExecuteUpdateAsync(u => u.SetProperty(p => p.CollectedAt, now));
        if (claimed == 0) return Results.Ok(new { state = "used" });
        var refresh = tokens.CreateRefreshToken(user.Id, $"{request.Device} · from your phone");
        db.RefreshTokens.Add(refresh);
        await db.SaveChangesAsync();
        return Results.Ok(new { state = "approved", auth = AuthEndpoints.BuildAuthResponse(user, refresh, tokens, config) });
    }
}
