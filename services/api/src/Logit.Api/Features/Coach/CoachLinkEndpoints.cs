using System.Security.Claims;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Auth;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Logit.Api.Features.Coach.Payments;

namespace Logit.Api.Features.Coach;

/// Coach invite links (a coach shares a link, people who open it ask to be coached, the coach
/// accepts) and the client's sharing switches.
public static class CoachLinkEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        // Trying Studio, links are real but not live yet (canvas V3): only samples can use them.
        group.MapPost("/links", CreateLink).RequireCoaching();
        group.MapGet("/links", GetLinks).RequireCoaching();
        group.MapPut("/links/{linkId:guid}", EditLink).RequireCoaching();
        group.MapDelete("/links/{linkId:guid}", TurnOffLink).RequireCoaching();

        // Anyone, signed in or not: the link page shows the coach and the package before sign-up.
        group.MapGet("/links/code/{code}", GetLinkByCode).AllowAnonymous();
        group.MapPost("/links/code/{code}/request", RequestCoaching);

        group.MapGet("/requests", GetRequests).RequireTier(UserTier.Studio);
        group.MapPost("/requests/{relationshipId:guid}/accept", AcceptRequest).RequireTier(UserTier.Studio);
        group.MapPost("/requests/{relationshipId:guid}/decline", DeclineRequest).RequireTier(UserTier.Studio);
        group.MapGet("/requests/mine", GetMyRequests);

        group.MapPut("/relationships/{relationshipId:guid}/sharing", UpdateSharing);
    }

    // ── Link state ───────────────────────────────────────────────────────────

    /// "active", "off" (turned off), "expired" or "full". `used` = requests waiting plus
    /// people who joined through the link and are still coached.
    public static string LinkState(CoachInviteLink link, int used, DateTime now) =>
        link.RevokedAt is not null ? "off"
        : link.ExpiresAt is { } e && e <= now ? "expired"
        : link.MaxUses is { } max && used >= max ? "full"
        : "active";

    private static async Task<Dictionary<Guid, (int Joined, int Waiting)>> LinkUse(
        AppDbContext db, IEnumerable<Guid> linkIds)
    {
        var ids = linkIds.ToList();
        var rows = await db.CoachClientRelationships
            .Where(r => r.InviteLinkId != null && ids.Contains(r.InviteLinkId.Value)
                && (r.Status == CoachClientStatus.Active || r.Status == CoachClientStatus.Pending))
            .GroupBy(r => new { r.InviteLinkId, r.Status })
            .Select(g => new { g.Key.InviteLinkId, g.Key.Status, N = g.Count() })
            .ToListAsync();
        return ids.ToDictionary(id => id, id => (
            rows.Where(r => r.InviteLinkId == id && r.Status == CoachClientStatus.Active).Sum(r => r.N),
            rows.Where(r => r.InviteLinkId == id && r.Status == CoachClientStatus.Pending).Sum(r => r.N)));
    }

    /// Everyone who ever asked or paid through each link (canvas L1 "14 asked"), whatever
    /// happened since. LogIt doesn't count who opened a link, only who asked.
    private static async Task<Dictionary<Guid, int>> LinkAsked(AppDbContext db, List<Guid> ids) =>
        (await db.CoachClientRelationships.Where(r => r.InviteLinkId != null && ids.Contains(r.InviteLinkId.Value))
            .GroupBy(r => r.InviteLinkId!.Value).Select(g => new { g.Key, N = g.Count() }).ToListAsync())
            .ToDictionary(x => x.Key, x => x.N);

    private static object LinkDto(CoachInviteLink l, (int Joined, int Waiting) use, DateTime now, int asked = 0, bool live = true) => new
    {
        asked,
        // Trying Studio: real but not live yet; only sample clients can use it (canvas V3).
        live,
        payAndStart = l.PayAndStart,
        id = l.Id,
        code = Registration.Format(l.Code),
        name = l.Name,
        createdAt = l.CreatedAt,
        expiresAt = l.ExpiresAt,
        maxUses = l.MaxUses,
        joined = use.Joined,
        waiting = use.Waiting,
        state = LinkState(l, use.Joined + use.Waiting, now),
        packageId = l.PackageId,
        packageName = l.Package?.Name,
    };

    // ── Coach: manage links ──────────────────────────────────────────────────

    private static async Task<IResult> CreateLink(
        [FromBody] CreateLinkRequest req, ClaimsPrincipal caller, AppDbContext db, IConfiguration config)
    {
        var name = (req.Name ?? "").Trim();
        if (name.Length == 0) return Results.BadRequest(new { error = "Give the link a name." });
        if (name.Length > CoachInviteLinkLimits.MaxNameChars)
            return Results.BadRequest(new { error = $"Keep the name under {CoachInviteLinkLimits.MaxNameChars} characters." });
        if (req.ExpiresInDays is < 1 or > CoachInviteLinkLimits.MaxDays)
            return Results.BadRequest(new { error = $"Expiry must be 1 to {CoachInviteLinkLimits.MaxDays} days." });
        if (req.MaxUses is < 1 or > CoachInviteLinkLimits.MaxUses)
            return Results.BadRequest(new { error = $"Max people must be 1 to {CoachInviteLinkLimits.MaxUses}." });

        if (await CoachPaymentEndpoints.CheckPackageForLink(db, caller.GetUserId(), req.PackageId, req.PayAndStart, default) is { } packageError)
            return packageError;

        var now = DateTime.UtcNow;
        string code;
        do { code = Registration.NewCode(); }
        while (await db.CoachInviteLinks.AnyAsync(l => l.Code == code));

        var link = new CoachInviteLink
        {
            CoachId = caller.GetUserId(),
            Code = code,
            Name = name,
            CreatedAt = now,
            ExpiresAt = req.ExpiresInDays is { } d ? now.AddDays(d) : null,
            MaxUses = req.MaxUses,
            PackageId = req.PackageId,
            PayAndStart = req.PayAndStart && req.PackageId is not null,
        };
        db.CoachInviteLinks.Add(link);
        await db.SaveChangesAsync();
        if (link.PackageId is not null) await db.Entry(link).Reference(l => l.Package).LoadAsync();
        var me = await db.Users.FindAsync(caller.GetUserId());
        return Results.Ok(LinkDto(link, (0, 0), now, 0, CoachingAccess.CanCoach(me!, config)));
    }

    /// Change a link (canvas L1 "Edit…"), or switch it on again.
    private static async Task<IResult> EditLink(Guid linkId, [FromBody] EditLinkRequest req, ClaimsPrincipal caller, AppDbContext db, IConfiguration config)
    {
        var coachId = caller.GetUserId();
        var link = await db.CoachInviteLinks.Include(l => l.Package).FirstOrDefaultAsync(l => l.Id == linkId && l.CoachId == coachId);
        if (link is null) return Results.NotFound();
        var name = (req.Name ?? "").Trim();
        if (name.Length == 0) return Results.BadRequest(new { error = "Give the link a name." });
        if (name.Length > CoachInviteLinkLimits.MaxNameChars)
            return Results.BadRequest(new { error = $"Keep the name under {CoachInviteLinkLimits.MaxNameChars} characters." });
        if (req.MaxUses is < 1 or > CoachInviteLinkLimits.MaxUses)
            return Results.BadRequest(new { error = $"Max people must be 1 to {CoachInviteLinkLimits.MaxUses}." });
        if (await CoachPaymentEndpoints.CheckPackageForLink(db, coachId, req.PackageId, req.PayAndStart, default) is { } packageError)
            return packageError;
        link.Name = name;
        link.ExpiresAt = req.ExpiresAt;
        link.MaxUses = req.MaxUses;
        link.PackageId = req.PackageId;
        link.PayAndStart = req.PayAndStart && req.PackageId is not null;
        if (req.On) link.RevokedAt = null;
        else link.RevokedAt ??= DateTime.UtcNow;
        await db.SaveChangesAsync();
        await db.Entry(link).Reference(l => l.Package).LoadAsync();
        var me = await db.Users.FindAsync(coachId);
        var now = DateTime.UtcNow;
        var asked = await LinkAsked(db, [link.Id]);
        return Results.Ok(LinkDto(link, (await LinkUse(db, [link.Id]))[link.Id], now, asked.GetValueOrDefault(link.Id), CoachingAccess.CanCoach(me!, config)));
    }

    private static async Task<IResult> GetLinks(ClaimsPrincipal caller, AppDbContext db, IConfiguration config)
    {
        var coachId = caller.GetUserId();
        var links = await db.CoachInviteLinks.AsNoTracking()
            .Include(l => l.Package)
            .Where(l => l.CoachId == coachId)
            .OrderByDescending(l => l.CreatedAt)
            .ToListAsync();
        var use = await LinkUse(db, links.Select(l => l.Id));
        var asked = await LinkAsked(db, links.Select(l => l.Id).ToList());
        var now = DateTime.UtcNow;
        var me = await db.Users.FindAsync(coachId);
        var live = CoachingAccess.CanCoach(me!, config);
        return Results.Ok(new { links = links.Select(l => LinkDto(l, use[l.Id], now, asked.GetValueOrDefault(l.Id), live)) });
    }

    /// Turning a link off stops new requests. Requests already waiting stay for the coach to
    /// answer, and people who joined stay coached.
    private static async Task<IResult> TurnOffLink(Guid linkId, ClaimsPrincipal caller, AppDbContext db)
    {
        var link = await db.CoachInviteLinks.FirstOrDefaultAsync(l => l.Id == linkId && l.CoachId == caller.GetUserId());
        if (link is null) return Results.NotFound();
        link.RevokedAt ??= DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    // ── Anyone: open a link, ask to be coached ───────────────────────────────

    private static async Task<IResult> GetLinkByCode(string code, ClaimsPrincipal caller, AppDbContext db, IConfiguration config)
    {
        var link = await FindLink(db, code);
        if (link is null) return Results.NotFound(new { error = "That link doesn't exist." });

        Guid? me = caller.Identity?.IsAuthenticated == true ? caller.GetUserId() : null;
        var use = (await LinkUse(db, [link.Id]))[link.Id];
        var existing = me is null ? null : await db.CoachClientRelationships.AsNoTracking()
            .Include(r => r.Payment)
            .FirstOrDefaultAsync(r => r.CoachId == link.CoachId && r.ClientId == me);
        var package = link.PaidPackage;
        var account = package is null ? null
            : await db.CoachPaymentAccounts.AsNoTracking().FirstOrDefaultAsync(a => a.CoachId == link.CoachId);

        return Results.Ok(new
        {
            // What this link costs; null = free (ask, and the coach accepts).
            package = package is null ? null : new
            {
                name = package.Name,
                description = package.Description,
                amountCents = package.AmountCents,
                currency = package.Currency,
                interval = package.Interval,
                weeks = package.Weeks,
            },
            paymentsReady = account is { CardPaymentsActive: true, PaymentsStopped: false },
            // Already paying this coach through LogIt (paying again would charge twice).
            paying = existing is { Status: CoachClientStatus.Active, Payment: { Mode: PaymentModes.Stripe } ep }
                && ep.State != PaymentStates.Ended,
            coach = link.Coach.ToProfileDto(false),
            // "notlive": the coach is trying Studio, so the link only works for their sample clients.
            state = !CoachingAccess.CanCoach(link.Coach, config) ? "notlive" : LinkState(link, use.Joined + use.Waiting, DateTime.UtcNow),
            isSelf = link.CoachId == me,
            // "none", "invited" (the coach already invited you), "requested" or "active".
            relationship = RelationshipState(existing),
            relationshipId = existing is { Status: not CoachClientStatus.Revoked } ? existing.Id : (Guid?)null,
            // A link to ask can have a package picked for them (canvas L1).
            pickedPackageId = link.PayAndStart ? null : link.Package is { Hidden: false } pk ? pk.Id : (Guid?)null,
            // Asking through a free link answers the coach's questions (canvas P2, R1).
            questions = CoachIntake.QuestionsOf(link.Coach),
            spots = await CoachIntake.SpotsAsync(db, link.Coach, DateTime.UtcNow),
            stage = existing is { Status: CoachClientStatus.Pending, RequestedByClient: true } ? existing.RequestStage ?? RequestStages.Asked : null,
            coachedSince = existing is { Status: CoachClientStatus.Active or CoachClientStatus.Paused } ? existing.UpdatedAt : (DateTime?)null,
            otherCoach = me is { } id ? await CoachIntake.OtherCoachAsync(db, id, link.CoachId) : null,
        });
    }

    private static string RelationshipState(CoachClientRelationship? r) => r switch
    {
        null or { Status: CoachClientStatus.Revoked } => "none",
        { Status: CoachClientStatus.Active } => "active",
        { Status: CoachClientStatus.Paused } => "paused",
        { RequestedByClient: true } => "requested",
        _ => "invited",
    };

    private static async Task<IResult> RequestCoaching(
        string code, [FromBody] CoachingRequestBody req, ClaimsPrincipal caller, AppDbContext db, IConfiguration config)
    {
        var link = await FindLink(db, code);
        if (link is null) return Results.NotFound(new { error = "That link doesn't exist." });

        var me = caller.GetUserId();
        if (link.CoachId == me) return Results.BadRequest(new { error = "This is your own link." });

        // A sandbox sample client only ever asks its own coach, and doesn't pay: the walkthrough
        // has it use whatever link the coach made, paid or not.
        var sampleOwner = await db.Users.Where(u => u.Id == me && u.IsSample).Select(u => u.SampleOwnerId).FirstOrDefaultAsync();
        var isSample = sampleOwner is not null;
        if (isSample && sampleOwner != link.CoachId)
            return Results.NotFound(new { error = "That link doesn't exist." });

        var sharing = req.Sharing ?? SharingDto.All;
        var existing = await db.CoachClientRelationships
            .FirstOrDefaultAsync(r => r.CoachId == link.CoachId && r.ClientId == me);

        var relState = RelationshipState(existing);
        if (!isSample && relState is "none" or "requested" && link.PaidPackage is not null)
            return Results.Json(new { error = "This link is paid: pay to start coaching.", code = "payment_required" },
                statusCode: StatusCodes.Status402PaymentRequired);

        if (relState == "none")
        {
            var use = (await LinkUse(db, [link.Id]))[link.Id];
            // A sample client can use a link that isn't live yet: that's how "Try it as Niamh" works.
            var state = !isSample && !CoachingAccess.CanCoach(link.Coach, config) ? "notlive" : LinkState(link, use.Joined + use.Waiting, DateTime.UtcNow);
            if (state != "active")
                return Results.Json(new { error = LinkStateMessage(state), code = state }, statusCode: StatusCodes.Status410Gone);
        }

        // New, waiting-list, already-asked and invited-by-the-coach requests all follow the same
        // rules as asking from the profile (CoachRequestEndpoints).
        var interested = req.InterestedPackageId ?? (link.PayAndStart ? null : link.PackageId);
        return await CoachRequestEndpoints.CreateOrUpdateAsync(db, link.Coach, me, req.Answers, interested, sharing, link.Id, isSample);
    }

    private static string LinkStateMessage(string state) => state switch
    {
        "notlive" => "This coach isn't taking clients through LogIt yet.",
        "expired" => "This link has expired.",
        "full" => "This link has reached its limit.",
        _ => "This link has been turned off.",
    };

    private static Task<CoachInviteLink?> FindLink(AppDbContext db, string code)
    {
        var normalized = Registration.Normalize(code);
        if (normalized is null) return Task.FromResult<CoachInviteLink?>(null);
        return db.CoachInviteLinks.Include(l => l.Coach).Include(l => l.Package).FirstOrDefaultAsync(l => l.Code == normalized);
    }

    // ── Coach: answer requests ───────────────────────────────────────────────

    private static async Task<IResult> GetRequests(ClaimsPrincipal caller, AppDbContext db)
    {
        var coachId = caller.GetUserId();
        var rows = await db.CoachClientRelationships.AsNoTracking()
            .Include(r => r.Client)
            .Include(r => r.InviteLink)
            .Where(r => r.CoachId == coachId && r.Status == CoachClientStatus.Pending && r.RequestedByClient)
            .OrderByDescending(r => r.UpdatedAt)
            .ToListAsync();
        var offers = await LatestOffersAsync(db, rows.Select(r => r.Id).ToList());
        var now = DateTime.UtcNow;
        return Results.Ok(new
        {
            requests = rows.Select(r => new
            {
                relationshipId = r.Id,
                client = r.Client.ToProfileDto(false),
                linkName = r.InviteLink?.Name,
                sharing = r.ToSharingDto(),
                requestedAt = r.UpdatedAt,
                // Requests (canvas C1–C6): where it stands, what they answered, any offer.
                stage = r.RequestStage ?? CoachIntake.Events.Asked,
                answers = CoachIntake.AnswersOf(r),
                interestedPackageId = r.InterestedPackageId,
                waitingSince = r.WaitingSince,
                offer = offers.TryGetValue(r.Id, out var o) ? OfferDto(o, now) : null,
            }),
        });
    }

    /// The newest offer on each request.
    private static async Task<Dictionary<Guid, CoachOffer>> LatestOffersAsync(AppDbContext db, List<Guid> relIds) =>
        (await db.CoachOffers.AsNoTracking().Where(o => relIds.Contains(o.RelationshipId)).ToListAsync())
            .GroupBy(o => o.RelationshipId)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(o => o.CreatedAt).First());

    private static object OfferDto(CoachOffer o, DateTime now) => new
    {
        card = CoachIntake.CardOf(o),
        state = CoachIntake.StateOf(o, now),
        createdAt = o.CreatedAt,
        packageId = o.PackageId, // editing the offer (canvas C6) starts from its package
        holdDays = (int)Math.Max(1, Math.Round((o.HoldUntil - o.CreatedAt).TotalDays)),
    };

    private static async Task<IResult> AcceptRequest(Guid relationshipId, ClaimsPrincipal caller, AppDbContext db)
    {
        var r = await FindRequest(db, relationshipId, caller.GetUserId());
        if (r is null) return Results.NotFound();
        r.Status = CoachClientStatus.Active;
        r.RequestStage = null;
        r.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> DeclineRequest(Guid relationshipId, ClaimsPrincipal caller, AppDbContext db)
    {
        var r = await FindRequest(db, relationshipId, caller.GetUserId());
        if (r is null) return Results.NotFound();
        r.Status = CoachClientStatus.Revoked; // see RevokeRelationship for why not deleted
        r.RequestStage = RequestStages.NotAFit;
        r.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static Task<CoachClientRelationship?> FindRequest(AppDbContext db, Guid id, Guid coachId) =>
        db.CoachClientRelationships.FirstOrDefaultAsync(r =>
            r.Id == id && r.CoachId == coachId && r.Status == CoachClientStatus.Pending && r.RequestedByClient);

    /// The client's own requests still waiting for a coach's answer; with includeClosed, also
    /// the ones closed (not a fit, withdrawn) and not deleted. Older apps don't ask for those.
    private static async Task<IResult> GetMyRequests(ClaimsPrincipal caller, AppDbContext db, bool includeClosed = false)
    {
        var me = caller.GetUserId();
        var rows = await db.CoachClientRelationships.AsNoTracking()
            .Include(r => r.Coach)
            .Where(r => r.ClientId == me && r.RequestedByClient && (r.Status == CoachClientStatus.Pending
                || (includeClosed && r.Status == CoachClientStatus.Revoked
                    && (r.RequestStage == RequestStages.NotAFit || r.RequestStage == RequestStages.Withdrawn))))
            .OrderByDescending(r => r.UpdatedAt)
            .ToListAsync();
        var offers = await LatestOffersAsync(db, rows.Select(r => r.Id).ToList());
        var now = DateTime.UtcNow;
        return Results.Ok(new
        {
            requests = rows.Select(r => new
            {
                relationshipId = r.Id,
                coach = r.Coach.ToProfileDto(false),
                sharing = r.ToSharingDto(),
                requestedAt = r.UpdatedAt,
                stage = r.RequestStage ?? CoachIntake.Events.Asked,
                closed = r.Status == CoachClientStatus.Revoked,
                answers = CoachIntake.AnswersOf(r),
                waitingSince = r.WaitingSince,
                expectSpots = r.RequestStage == RequestStages.Waiting ? r.Coach.CoachExpectSpots : null,
                offer = offers.TryGetValue(r.Id, out var o) ? OfferDto(o, now) : null,
            }),
        });
    }

    // ── Client: sharing switches ─────────────────────────────────────────────

    private static async Task<IResult> UpdateSharing(
        Guid relationshipId, [FromBody] SharingDto sharing, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var r = await db.CoachClientRelationships.FirstOrDefaultAsync(x =>
            x.Id == relationshipId && x.ClientId == me
            && (x.Status == CoachClientStatus.Active || x.Status == CoachClientStatus.Pending));
        if (r is null) return Results.NotFound();
        // UpdatedAt is left alone: it's when coaching started ("client since").
        r.ApplySharing(sharing);
        await db.SaveChangesAsync();
        return Results.Ok(new { sharing = r.ToSharingDto() });
    }
}

public record CreateLinkRequest(string? Name, int? ExpiresInDays, int? MaxUses, Guid? PackageId = null, bool PayAndStart = false);
public record EditLinkRequest(string? Name, DateTime? ExpiresAt, int? MaxUses, Guid? PackageId, bool PayAndStart, bool On = true);
/// Answers: the coach's questions (CoachIntake), keyed by question id; older apps send none.
public record CoachingRequestBody(SharingDto? Sharing, Dictionary<string, string>? Answers = null, Guid? InterestedPackageId = null);
