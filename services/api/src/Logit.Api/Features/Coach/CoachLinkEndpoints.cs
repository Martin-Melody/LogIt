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
        group.MapPost("/links", CreateLink).RequireTier(UserTier.Studio);
        group.MapGet("/links", GetLinks).RequireTier(UserTier.Studio);
        group.MapDelete("/links/{linkId:guid}", TurnOffLink).RequireTier(UserTier.Studio);

        // Anyone signed in, any tier: a Free account can be coached.
        group.MapGet("/links/code/{code}", GetLinkByCode);
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

    private static object LinkDto(CoachInviteLink l, (int Joined, int Waiting) use, DateTime now) => new
    {
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
        [FromBody] CreateLinkRequest req, ClaimsPrincipal caller, AppDbContext db)
    {
        var name = (req.Name ?? "").Trim();
        if (name.Length == 0) return Results.BadRequest(new { error = "Give the link a name." });
        if (name.Length > CoachInviteLinkLimits.MaxNameChars)
            return Results.BadRequest(new { error = $"Keep the name under {CoachInviteLinkLimits.MaxNameChars} characters." });
        if (req.ExpiresInDays is < 1 or > CoachInviteLinkLimits.MaxDays)
            return Results.BadRequest(new { error = $"Expiry must be 1 to {CoachInviteLinkLimits.MaxDays} days." });
        if (req.MaxUses is < 1 or > CoachInviteLinkLimits.MaxUses)
            return Results.BadRequest(new { error = $"Max people must be 1 to {CoachInviteLinkLimits.MaxUses}." });

        if (await CoachPaymentEndpoints.CheckPackageForLink(db, caller.GetUserId(), req.PackageId, default) is { } packageError)
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
        };
        db.CoachInviteLinks.Add(link);
        await db.SaveChangesAsync();
        if (link.PackageId is not null) await db.Entry(link).Reference(l => l.Package).LoadAsync();
        return Results.Ok(LinkDto(link, (0, 0), now));
    }

    private static async Task<IResult> GetLinks(ClaimsPrincipal caller, AppDbContext db)
    {
        var coachId = caller.GetUserId();
        var links = await db.CoachInviteLinks.AsNoTracking()
            .Include(l => l.Package)
            .Where(l => l.CoachId == coachId)
            .OrderByDescending(l => l.CreatedAt)
            .ToListAsync();
        var use = await LinkUse(db, links.Select(l => l.Id));
        var now = DateTime.UtcNow;
        return Results.Ok(new { links = links.Select(l => LinkDto(l, use[l.Id], now)) });
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

    private static async Task<IResult> GetLinkByCode(string code, ClaimsPrincipal caller, AppDbContext db)
    {
        var link = await FindLink(db, code);
        if (link is null) return Results.NotFound(new { error = "That link doesn't exist." });

        var me = caller.GetUserId();
        var use = (await LinkUse(db, [link.Id]))[link.Id];
        var existing = await db.CoachClientRelationships.AsNoTracking()
            .Include(r => r.Payment)
            .FirstOrDefaultAsync(r => r.CoachId == link.CoachId && r.ClientId == me);
        var package = link.Package is { Hidden: false } p ? p : null;
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
            paymentsReady = account is { CardPaymentsActive: true },
            // Already paying this coach through LogIt (paying again would charge twice).
            paying = existing is { Status: CoachClientStatus.Active, Payment: { Mode: PaymentModes.Stripe } ep }
                && ep.State != PaymentStates.Ended,
            coach = link.Coach.ToProfileDto(false),
            state = link.Coach.Tier != UserTier.Studio ? "off" : LinkState(link, use.Joined + use.Waiting, DateTime.UtcNow),
            isSelf = link.CoachId == me,
            // "none", "invited" (the coach already invited you), "requested" or "active".
            relationship = RelationshipState(existing),
            relationshipId = existing is { Status: not CoachClientStatus.Revoked } ? existing.Id : (Guid?)null,
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
        string code, [FromBody] CoachingRequestBody req, ClaimsPrincipal caller, AppDbContext db)
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
        if (!isSample && relState is "none" or "requested" && link.Package is { Hidden: false })
            return Results.Json(new { error = "This link is paid: pay to start coaching.", code = "payment_required" },
                statusCode: StatusCodes.Status402PaymentRequired);

        switch (relState)
        {
            case "active":
                return Results.Conflict(new { error = "You're already coached by them.", code = "already_coached" });
            case "paused":
                return Results.Conflict(new { error = "Coaching with them is paused until it's paid.", code = "paused" });
            case "invited":
                // The coach already asked you, so asking back is a yes.
                existing!.ApplySharing(sharing);
                existing.Status = CoachClientStatus.Active;
                existing.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
                return Results.Ok(new { relationshipId = existing.Id, status = "active" });
            case "requested":
                existing!.ApplySharing(sharing);
                existing.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
                return Results.Ok(new { relationshipId = existing.Id, status = "requested" });
        }

        var use = (await LinkUse(db, [link.Id]))[link.Id];
        var state = link.Coach.Tier != UserTier.Studio ? "off" : LinkState(link, use.Joined + use.Waiting, DateTime.UtcNow);
        if (state != "active")
            return Results.Json(new { error = LinkStateMessage(state), code = state }, statusCode: StatusCodes.Status410Gone);

        if (existing is null)
        {
            existing = new CoachClientRelationship { CoachId = link.CoachId, ClientId = me };
            db.CoachClientRelationships.Add(existing);
        }
        existing.Status = CoachClientStatus.Pending;
        existing.RequestedByClient = true;
        existing.InviteLinkId = link.Id;
        existing.ApplySharing(sharing);
        existing.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Results.Ok(new { relationshipId = existing.Id, status = "requested" });
    }

    private static string LinkStateMessage(string state) => state switch
    {
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
        return Results.Ok(new
        {
            requests = rows.Select(r => new
            {
                relationshipId = r.Id,
                client = r.Client.ToProfileDto(false),
                linkName = r.InviteLink?.Name,
                sharing = r.ToSharingDto(),
                requestedAt = r.UpdatedAt,
            }),
        });
    }

    private static async Task<IResult> AcceptRequest(Guid relationshipId, ClaimsPrincipal caller, AppDbContext db)
    {
        var r = await FindRequest(db, relationshipId, caller.GetUserId());
        if (r is null) return Results.NotFound();
        r.Status = CoachClientStatus.Active;
        r.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> DeclineRequest(Guid relationshipId, ClaimsPrincipal caller, AppDbContext db)
    {
        var r = await FindRequest(db, relationshipId, caller.GetUserId());
        if (r is null) return Results.NotFound();
        r.Status = CoachClientStatus.Revoked; // see RevokeRelationship for why not deleted
        r.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static Task<CoachClientRelationship?> FindRequest(AppDbContext db, Guid id, Guid coachId) =>
        db.CoachClientRelationships.FirstOrDefaultAsync(r =>
            r.Id == id && r.CoachId == coachId && r.Status == CoachClientStatus.Pending && r.RequestedByClient);

    /// The client's own requests still waiting for a coach's answer.
    private static async Task<IResult> GetMyRequests(ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var rows = await db.CoachClientRelationships.AsNoTracking()
            .Include(r => r.Coach)
            .Where(r => r.ClientId == me && r.Status == CoachClientStatus.Pending && r.RequestedByClient)
            .OrderByDescending(r => r.UpdatedAt)
            .ToListAsync();
        return Results.Ok(new
        {
            requests = rows.Select(r => new
            {
                relationshipId = r.Id,
                coach = r.Coach.ToProfileDto(false),
                sharing = r.ToSharingDto(),
                requestedAt = r.UpdatedAt,
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

public record CreateLinkRequest(string? Name, int? ExpiresInDays, int? MaxUses, Guid? PackageId = null);
public record CoachingRequestBody(SharingDto? Sharing);
