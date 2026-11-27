using System.Security.Claims;
using System.Text.Json;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Coach;

/// The Coaching section of a coach's one profile (canvas P1, P3): a headline, where they coach,
/// About (Markdown), who they're a good fit for, and the packages they list. Edited in
/// Coaching › Profile; shown on getlogit.app/@name, the web and the phone once the account
/// coaches for real (Studio, or any account on a self-hosted server). Someone trying Studio
/// can write it and see it in the preview; it goes public with Studio.
public static class CoachProfileEndpoints
{
    public record CoachProfile(string Headline, string Mode, string? Place, string About, List<string> GoodFor);

    public record ProfilePackageDto(Guid Id, string Name, string Description, long AmountCents, string Currency, string Interval, int? Weeks, bool ShowOnProfile);

    /// Own view: the saved profile (null before the first save), all packages with their
    /// "on profile" switch, and whether the section is public yet.
    public record MyCoachProfileDto(CoachProfile? Profile, List<ProfilePackageDto> Packages, bool Public);

    public record SaveCoachProfileRequest(CoachProfile? Profile, List<Guid>? PackagesOnProfile);

    public record PublicPackageDto(string Name, string Description, long AmountCents, string Currency, string Interval, int? Weeks);

    /// What others see. AskCode is the invite link the button opens: the newest free link (ask
    /// first), else the newest paid one (AskPays: pay and start); null when there's no live link.
    public record CoachingSectionDto(
        string Headline, string Mode, string? Place, string About, List<string> GoodFor,
        List<PublicPackageDto> Packages, string? AskCode, bool AskPays,
        // Canvas A4: the client limit is reached; "waitlist" asks onto the waiting list, "stop" turns the button off.
        bool Full = false, string WhenFull = "waitlist", string? ExpectSpots = null,
        // Canvas Z7: away, when the coach tells people who ask.
        DateTime? AwayUntil = null);

    public const int MaxHeadline = 120, MaxPlace = 80, MaxAbout = 4000, MaxGoodFor = 6, MaxTag = 24;
    public static readonly string[] Modes = ["online", "inperson", "both"];

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static void MapCoachProfileEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/coach/profile").WithTags("Coach").RequireAuthorization();
        group.MapGet("", Get).RequireCoaching();
        group.MapPut("", Put).RequireCoaching();
    }

    public static CoachProfile? Read(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try { return JsonSerializer.Deserialize<CoachProfile>(json, Json); }
        catch (JsonException) { return null; }
    }

    /// The section someone else sees, or null when this account shows none.
    public static async Task<CoachingSectionDto?> SectionAsync(AppDbContext db, User u, IConfiguration config, DateTime now)
    {
        if (u.IsSample || !(u.Tier == UserTier.Studio || config.GetValue<bool>("Deployment:SelfHosted"))) return null;
        var p = Read(u.CoachProfileJson);
        if (p is null || string.IsNullOrWhiteSpace(p.Headline)) return null;
        var packages = await db.CoachPackages.AsNoTracking()
            .Where(k => k.CoachId == u.Id && !k.Hidden && k.ShowOnProfile)
            .OrderBy(k => k.AmountCents)
            .Select(k => new PublicPackageDto(k.Name, k.Description, k.AmountCents, k.Currency, k.Interval, k.Weeks))
            .ToListAsync();
        var ask = await db.CoachInviteLinks.AsNoTracking()
            .Where(l => l.CoachId == u.Id && l.RevokedAt == null && (l.ExpiresAt == null || l.ExpiresAt > now))
            .OrderBy(l => l.PackageId != null).ThenByDescending(l => l.CreatedAt)
            .Select(l => new { l.Code, Pays = l.PackageId != null })
            .FirstOrDefaultAsync();
        var spots = await CoachIntake.SpotsAsync(db, u, now);
        return new CoachingSectionDto(p.Headline, p.Mode, p.Place, p.About, p.GoodFor, packages, ask?.Code, ask?.Pays ?? false,
            spots.Full, spots.WhenFull, spots.ExpectSpots, CoachAway.ForAskers(u, now));
    }

    private static async Task<IResult> Get(ClaimsPrincipal caller, AppDbContext db, IConfiguration config)
    {
        var me = await db.Users.FindAsync(caller.GetUserId());
        if (me is null) return Results.NotFound();
        var packages = await PackagesAsync(db, me.Id);
        var isPublic = me.Tier == UserTier.Studio || config.GetValue<bool>("Deployment:SelfHosted");
        return Results.Ok(new MyCoachProfileDto(Read(me.CoachProfileJson), packages, isPublic));
    }

    private static async Task<IResult> Put(SaveCoachProfileRequest req, ClaimsPrincipal caller, AppDbContext db, IConfiguration config)
    {
        var me = await db.Users.FindAsync(caller.GetUserId());
        if (me is null) return Results.NotFound();
        if (req.Profile is null) return Results.BadRequest(new { error = "Send the profile." });
        var (profile, problem) = Clean(req.Profile);
        if (problem is not null) return Results.BadRequest(new { error = problem });

        me.CoachProfileJson = JsonSerializer.Serialize(profile, Json);
        me.UpdatedAt = DateTime.UtcNow;
        if (req.PackagesOnProfile is { } on)
        {
            var wanted = on.ToHashSet();
            foreach (var k in await db.CoachPackages.Where(k => k.CoachId == me.Id).ToListAsync())
                k.ShowOnProfile = wanted.Contains(k.Id);
        }
        await db.SaveChangesAsync();
        return await Get(caller, db, config);
    }

    /// Trims and checks a profile; the problem is said the way the page can show it.
    public static (CoachProfile Profile, string? Problem) Clean(CoachProfile p)
    {
        var headline = (p.Headline ?? "").Trim();
        var place = string.IsNullOrWhiteSpace(p.Place) ? null : p.Place.Trim();
        var about = (p.About ?? "").Trim();
        var goodFor = (p.GoodFor ?? []).Select(t => (t ?? "").Trim()).Where(t => t.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var clean = new CoachProfile(headline, p.Mode, place, about, goodFor);
        if (headline.Length == 0) return (clean, "Add a headline: one line about what you coach.");
        if (headline.Length > MaxHeadline) return (clean, $"Keep the headline under {MaxHeadline} characters.");
        if (!Modes.Contains(p.Mode)) return (clean, "Choose online, in person or both.");
        if (place?.Length > MaxPlace) return (clean, $"Keep the town or gym under {MaxPlace} characters.");
        if (about.Length > MaxAbout) return (clean, $"Keep About you under {MaxAbout:N0} characters.");
        if (goodFor.Count > MaxGoodFor) return (clean, $"Pick up to {MaxGoodFor} for Good fit for.");
        if (goodFor.Any(t => t.Length > MaxTag)) return (clean, $"Keep each Good fit for under {MaxTag} characters.");
        return (clean, null);
    }

    private static Task<List<ProfilePackageDto>> PackagesAsync(AppDbContext db, Guid coachId) =>
        db.CoachPackages.AsNoTracking()
            .Where(k => k.CoachId == coachId && !k.Hidden)
            .OrderBy(k => k.AmountCents)
            .Select(k => new ProfilePackageDto(k.Id, k.Name, k.Description, k.AmountCents, k.Currency, k.Interval, k.Weeks, k.ShowOnProfile))
            .ToListAsync();
}
