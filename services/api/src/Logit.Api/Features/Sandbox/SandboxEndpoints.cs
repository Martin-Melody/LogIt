using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Auth;
using Logit.Api.Features.Coach;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Sandbox;

/// A Studio coach's sandbox: up to a few sample clients to practise on (the Studio walkthrough
/// uses them, and coaches can keep them to try a program or form before a real client sees it).
///
/// The server only makes the accounts and the coaching links. Everything a sample client
/// "does" (history, starting a program, answering a check-in, replying) is done by the coach's
/// own app, signed in as the sample client with a short-lived token from /token, through the
/// same endpoints a real client uses. So there is no second copy of the sync, check-in or
/// message rules here to fall out of date. The app side lives in packages/core/src/guide.
public static partial class SandboxEndpoints
{
    public const int MaxClients = 5;
    /// The claim a sample client's token carries; SampleTokenGuard limits what it can reach.
    public const string SampleClaim = "sample";

    public record SampleClientSpec(string Key, string DisplayName, bool Active, SharingDto? Sharing);
    public record CreateSandboxRequest(List<SampleClientSpec> Clients);

    public static void MapSandboxEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/coach/sandbox").RequireAuthorization();
        // Reading and removing work on any plan, so a coach who left Studio can still clear it out.
        group.MapGet("", Get);
        group.MapDelete("", Remove);
        group.MapPost("", Create).RequireTier(UserTier.Studio);
        group.MapPost("/clients/{userId:guid}/token", Token).RequireTier(UserTier.Studio);
    }

    [GeneratedRegex("^[a-z][a-z0-9-]{0,19}$")]
    private static partial Regex KeyPattern();

    private static async Task<IResult> Get(ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        return Results.Ok(new { clients = await List(db, me) });
    }

    private static async Task<List<object>> List(AppDbContext db, Guid coachId)
    {
        var samples = await db.Users.AsNoTracking()
            .Where(u => u.IsSample && u.SampleOwnerId == coachId)
            .OrderBy(u => u.CreatedAt)
            .Select(u => new { u.Id, u.Username, u.DisplayName })
            .ToListAsync();
        var ids = samples.Select(s => s.Id).ToList();
        var rels = await db.CoachClientRelationships.AsNoTracking()
            .Where(r => r.CoachId == coachId && ids.Contains(r.ClientId))
            .ToDictionaryAsync(r => r.ClientId);
        return samples.Select(s => (object)new
        {
            userId = s.Id,
            username = s.Username,
            displayName = s.DisplayName,
            key = KeyOf(s.Username),
            relationshipId = rels.GetValueOrDefault(s.Id)?.Id,
            status = rels.GetValueOrDefault(s.Id) is { } r ? r.Status.ToString() : "None",
        }).ToList();
    }

    /// "sample.niamh.0a1b2c3d4e5f" -> "niamh": the key the apps use to know who's who.
    public static string KeyOf(string username)
    {
        var parts = username.Split('.');
        return parts.Length == 3 && parts[0] == "sample" ? parts[1] : "";
    }

    private static async Task<IResult> Create(
        [FromBody] CreateSandboxRequest req, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        if (req.Clients is not { Count: > 0 } || req.Clients.Count > MaxClients)
            return Results.BadRequest(new { error = $"Ask for 1 to {MaxClients} sample clients." });
        if (req.Clients.Any(c => c is null || !KeyPattern().IsMatch(c.Key ?? "")
                || string.IsNullOrWhiteSpace(c.DisplayName) || c.DisplayName.Trim().Length > 40))
            return Results.BadRequest(new { error = "Each sample client needs a key (a-z) and a name of up to 40 characters." });
        if (req.Clients.Select(c => c.Key).Distinct().Count() != req.Clients.Count)
            return Results.BadRequest(new { error = "Sample client keys must be different." });
        if (await db.Users.AnyAsync(u => u.IsSample && u.SampleOwnerId == me))
            return Results.Conflict(new { error = "You already have sample clients. Remove them first to start fresh.", code = "sandbox_exists" });

        // No usable password: the hash is of 32 random bytes nobody keeps.
        var unusable = BCrypt.Net.BCrypt.HashPassword(Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)));
        var now = DateTime.UtcNow;
        foreach (var spec in req.Clients)
        {
            var tag = Convert.ToHexString(RandomNumberGenerator.GetBytes(6)).ToLowerInvariant();
            var user = new User
            {
                Username = $"sample.{spec.Key}.{tag}",
                Email = $"sample.{tag}@sample.invalid",
                PasswordHash = unusable,
                DisplayName = spec.DisplayName.Trim(),
                IsSample = true,
                SampleOwnerId = me,
                // Pro, so the sample's app can sync everything a real Pro client would.
                ManualTier = UserTier.Pro,
                Tier = UserTier.Pro,
                OnboardingCompleted = true,
                ShowInDiscover = false,
                HideFromSuggestions = true,
                HidePeopleSuggestions = true,
                IsPrivate = true,
            };
            db.Users.Add(user);
            if (spec.Active)
            {
                var rel = new CoachClientRelationship
                {
                    CoachId = me,
                    ClientId = user.Id,
                    Status = CoachClientStatus.Active,
                    CreatedAt = now,
                    UpdatedAt = now,
                };
                rel.ApplySharing(spec.Sharing ?? SharingDto.All);
                db.CoachClientRelationships.Add(rel);
            }
        }
        await db.SaveChangesAsync();
        return Results.Ok(new { clients = await List(db, me) });
    }

    private static async Task<IResult> Remove(ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var removed = await RemoveAllAsync(db, me);
        return Results.Ok(new { removed });
    }

    /// Deletes a coach's sample clients the same way an account is deleted, so every row they
    /// own goes with them (cascades). Also called before the coach's own account is deleted.
    public static async Task<int> RemoveAllAsync(AppDbContext db, Guid coachId)
    {
        var samples = await db.Users.Where(u => u.IsSample && u.SampleOwnerId == coachId).ToListAsync();
        if (samples.Count == 0) return 0;
        db.Users.RemoveRange(samples);
        await db.SaveChangesAsync();
        return samples.Count;
    }

    private static async Task<IResult> Token(Guid userId, ClaimsPrincipal caller, AppDbContext db, TokenService tokens)
    {
        var me = caller.GetUserId();
        var sample = await db.Users.FirstOrDefaultAsync(u => u.Id == userId && u.IsSample && u.SampleOwnerId == me);
        if (sample is null) return Results.NotFound();
        return Results.Ok(new { accessToken = tokens.CreateAccessToken(sample, sample: true) });
    }
}
