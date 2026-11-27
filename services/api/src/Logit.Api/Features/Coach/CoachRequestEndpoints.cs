using System.Security.Claims;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Email;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using static Logit.Api.Features.Coach.CoachIntake;

namespace Logit.Api.Features.Coach;

/// Asking to be coached and answering (canvas P2, R3, C1–C6, A1–A5, A4). A request is the
/// Pending relationship plus its stage; the conversation is the relationship's messages, with
/// a card for each step. Coaching starts when the person takes an offer (paid offers go
/// through checkout, build plan 1.5).
public static class CoachRequestEndpoints
{
    public record IntakeDto(int? Spots, string WhenFull, string? ExpectSpots, List<Question> Questions, bool CustomQuestions, int Taken, bool Full);
    public record IntakeBody(int? Spots, string? WhenFull, string? ExpectSpots, List<Question>? Questions, bool ResetQuestions = false);
    public record OfferBody(Guid? PackageId, int? HoldDays, DateTime? StartsOn, DateTime? FirstChargeOn, string? Message);
    public record NoteBody(string? Message, string? ExpectSpots = null, bool Block = false);
    public record AskBody(Dictionary<string, string>? Answers, Guid? InterestedPackageId, SharingDto? Sharing);
    public record TakeBody(SharingDto? Sharing);

    public static void MapCoachRequestEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/coach").WithTags("Coach").RequireAuthorization();
        // The coach's limit, what happens when full, and their questions.
        g.MapGet("/intake", GetIntake).RequireCoaching();
        g.MapPut("/intake", PutIntake).RequireCoaching();
        // Answering a request: reaching a real person, so Studio.
        g.MapPost("/requests/{relationshipId:guid}/offer", Offer).RequireTier(UserTier.Studio);
        g.MapPost("/requests/{relationshipId:guid}/withdraw-offer", WithdrawOffer).RequireTier(UserTier.Studio);
        g.MapPost("/requests/{relationshipId:guid}/waitlist", Waitlist).RequireTier(UserTier.Studio);
        g.MapPost("/requests/{relationshipId:guid}/not-a-fit", NotAFit).RequireTier(UserTier.Studio);
        g.MapPost("/requests/{relationshipId:guid}/reopen", Reopen).RequireTier(UserTier.Studio);
        g.MapGet("/requests/closed", Closed).RequireTier(UserTier.Studio);
        // Asking, from the profile (links ask through /coach/links/code/{code}/request).
        g.MapGet("/ask/{username}", AskInfo).AllowAnonymous(); // the ask sheet shows before signing up
        g.MapPost("/ask/{username}", Ask);
        g.MapPost("/requests/mine/{relationshipId:guid}/withdraw", WithdrawMine);
        g.MapDelete("/requests/mine/{relationshipId:guid}", DeleteMine);
        g.MapPost("/offers/{offerId:guid}/take", Take);
    }

    // ── The coach's intake settings ──────────────────────────────────────────

    private static async Task<IntakeDto> IntakeOf(AppDbContext db, User coach)
    {
        var now = DateTime.UtcNow;
        var taken = await TakenAsync(db, coach.Id, now);
        return new IntakeDto(coach.CoachSpots, coach.CoachWhenFull ?? "waitlist", coach.CoachExpectSpots, QuestionsOf(coach),
            !string.IsNullOrWhiteSpace(coach.CoachAskQuestionsJson), taken, IsFull(coach, taken));
    }

    private static async Task<IResult> GetIntake(ClaimsPrincipal caller, AppDbContext db)
    {
        var me = await db.Users.FindAsync(caller.GetUserId());
        return me is null ? Results.NotFound() : Results.Ok(await IntakeOf(db, me));
    }

    private static async Task<IResult> PutIntake([FromBody] IntakeBody body, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = await db.Users.FindAsync(caller.GetUserId());
        if (me is null) return Results.NotFound();
        if (body.Spots is < 1 or > MaxSpots) return Results.BadRequest(new { error = $"A client limit is between 1 and {MaxSpots}, or none." });
        if (body.WhenFull is not null && !WhenFull.Contains(body.WhenFull)) return Results.BadRequest(new { error = "When you're full: a waiting list, or stop taking requests." });
        if (body.ExpectSpots?.Trim().Length > MaxExpect) return Results.BadRequest(new { error = $"Keep \"Expect spots\" under {MaxExpect} characters." });
        if (CheckQuestions(body.Questions) is { } problem) return Results.BadRequest(new { error = problem });

        me.CoachSpots = body.Spots;
        me.CoachWhenFull = body.WhenFull ?? me.CoachWhenFull;
        me.CoachExpectSpots = string.IsNullOrWhiteSpace(body.ExpectSpots) ? null : body.ExpectSpots.Trim();
        if (body.ResetQuestions) me.CoachAskQuestionsJson = null;
        else if (body.Questions is { } q) me.CoachAskQuestionsJson = ToJson(q);
        me.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Results.Ok(await IntakeOf(db, me));
    }

    // ── Coach: answering ─────────────────────────────────────────────────────

    private static Task<CoachClientRelationship?> OpenRequest(AppDbContext db, Guid id, Guid coachId) =>
        db.CoachClientRelationships.Include(r => r.Coach).Include(r => r.Client).FirstOrDefaultAsync(r =>
            r.Id == id && r.CoachId == coachId && r.Status == CoachClientStatus.Pending && r.RequestedByClient);

    private static async Task<CoachOffer?> CloseOpenOffer(AppDbContext db, Guid relId, string to, DateTime now)
    {
        var open = await db.CoachOffers.FirstOrDefaultAsync(o => o.RelationshipId == relId && o.State == OfferStates.Open);
        if (open is null) return null;
        open.State = to;
        open.ClosedAt = now;
        return open;
    }

    private static async Task<IResult> Offer(Guid relationshipId, [FromBody] OfferBody body, ClaimsPrincipal caller, AppDbContext db, IEmailSender email, IConfiguration config)
    {
        var coachId = caller.GetUserId();
        var now = DateTime.UtcNow;
        var rel = await OpenRequest(db, relationshipId, coachId);
        if (rel is null) return Results.NotFound(new { error = "That request isn't open." });
        if (body.HoldDays is < 1 or > MaxHoldDays) return Results.BadRequest(new { error = $"Hold the spot for 1 to {MaxHoldDays} days." });
        if (body.Message?.Length > MaxMessage) return Results.BadRequest(new { error = "That message is too long." });
        if (body.StartsOn is { } s && s.Date < now.Date) return Results.BadRequest(new { error = "Coaching can't start in the past." });
        if (body.FirstChargeOn is { } f && f.Date < now.Date) return Results.BadRequest(new { error = "The first charge can't be in the past." });

        CoachPackage? package = null;
        if (body.PackageId is { } pid)
        {
            package = await db.CoachPackages.FirstOrDefaultAsync(k => k.Id == pid && k.CoachId == coachId && !k.Hidden);
            if (package is null) return Results.BadRequest(new { error = "That package isn't available." });
            // She'd be sent to a checkout that can't take her money (canvas Z4).
            if (!await db.CoachPaymentAccounts.AnyAsync(a => a.CoachId == coachId && a.CardPaymentsActive))
                return Results.BadRequest(new { error = "Paid packages need payments set up first. Offer it with no payment through LogIt, or set up payments.", code = "payments_not_ready" });
        }

        var replaced = await CloseOpenOffer(db, rel.Id, OfferStates.Replaced, now);
        var offer = new CoachOffer
        {
            RelationshipId = rel.Id,
            PackageId = package?.Id,
            PackageName = package?.Name ?? "Coaching",
            PackageDescription = package?.Description ?? "",
            AmountCents = package?.AmountCents ?? 0,
            Currency = package?.Currency ?? "eur",
            Interval = package?.Interval ?? PaymentIntervals.Once,
            Weeks = package?.Weeks,
            HoldUntil = now.AddDays(body.HoldDays ?? 7),
            StartsOn = body.StartsOn?.Date,
            FirstChargeOn = body.FirstChargeOn?.Date,
            CreatedAt = now,
        };
        db.CoachOffers.Add(offer);
        rel.RequestStage = RequestStages.Offered;
        rel.UpdatedAt = now;
        var coach = NameOf(rel.Coach);
        var kind = replaced is null ? Events.Offer : Events.OfferChanged;
        var evt = Post(db, rel, coachId, kind,
            $"{coach} {(replaced is null ? "offered you a spot" : "changed the offer")}: {offer.PackageName}, {PriceText(offer)}. Held until {offer.HoldUntil:ddd d MMM}.",
            CardOf(offer), body.Message, now);
        await db.SaveChangesAsync();
        await RequestEmails.MaybeSendAsync(db, email, config, rel.Id, kind, evt.Id);
        return Results.Ok(new { offerId = offer.Id });
    }

    private static async Task<IResult> WithdrawOffer(Guid relationshipId, ClaimsPrincipal caller, AppDbContext db, IEmailSender email, IConfiguration config)
    {
        var coachId = caller.GetUserId();
        var now = DateTime.UtcNow;
        var rel = await OpenRequest(db, relationshipId, coachId);
        if (rel is null) return Results.NotFound(new { error = "That request isn't open." });
        var closed = await CloseOpenOffer(db, rel.Id, OfferStates.Withdrawn, now);
        if (closed is null) return Results.Conflict(new { error = "There's no open offer to withdraw." });
        rel.RequestStage = RequestStages.Asked;
        rel.UpdatedAt = now;
        var evt = Post(db, rel, coachId, Events.OfferWithdrawn,
            $"{NameOf(rel.Coach)} withdrew the offer. You weren't charged, and your request is still open.", new { offerId = closed.Id }, null, now);
        await db.SaveChangesAsync();
        await RequestEmails.MaybeSendAsync(db, email, config, rel.Id, Events.OfferWithdrawn, evt.Id);
        return Results.NoContent();
    }

    private static async Task<IResult> Waitlist(Guid relationshipId, [FromBody] NoteBody body, ClaimsPrincipal caller, AppDbContext db, IEmailSender email, IConfiguration config)
    {
        var coachId = caller.GetUserId();
        var now = DateTime.UtcNow;
        var rel = await OpenRequest(db, relationshipId, coachId);
        if (rel is null) return Results.NotFound(new { error = "That request isn't open." });
        if (body.Message?.Length > MaxMessage) return Results.BadRequest(new { error = "That message is too long." });
        if (body.ExpectSpots?.Trim().Length > MaxExpect) return Results.BadRequest(new { error = $"Keep \"Expect spots\" under {MaxExpect} characters." });
        if (body.ExpectSpots is not null) rel.Coach.CoachExpectSpots = string.IsNullOrWhiteSpace(body.ExpectSpots) ? null : body.ExpectSpots.Trim();
        await CloseOpenOffer(db, rel.Id, OfferStates.Withdrawn, now);
        rel.RequestStage = RequestStages.Waiting;
        rel.WaitingSince ??= now;
        rel.UpdatedAt = now;
        var evt = Post(db, rel, coachId, Events.Waitlist,
            $"You're on {NameOf(rel.Coach)}'s waiting list. They'll offer you a spot here when one opens.",
            new { expectSpots = rel.Coach.CoachExpectSpots }, body.Message, now);
        await db.SaveChangesAsync();
        await RequestEmails.MaybeSendAsync(db, email, config, rel.Id, Events.Waitlist, evt.Id);
        return Results.NoContent();
    }

    private static async Task<IResult> NotAFit(Guid relationshipId, [FromBody] NoteBody body, ClaimsPrincipal caller, AppDbContext db, IEmailSender email, IConfiguration config)
    {
        var coachId = caller.GetUserId();
        var now = DateTime.UtcNow;
        var rel = await OpenRequest(db, relationshipId, coachId);
        if (rel is null) return Results.NotFound(new { error = "That request isn't open." });
        if (body.Message?.Length > MaxMessage) return Results.BadRequest(new { error = "That message is too long." });
        await CloseOpenOffer(db, rel.Id, OfferStates.Withdrawn, now);
        rel.Status = CoachClientStatus.Revoked; // kept, not deleted: the conversation stays readable
        rel.RequestStage = RequestStages.NotAFit;
        rel.UpdatedAt = now;
        var evt = Post(db, rel, coachId, Events.Closed,
            $"{NameOf(rel.Coach)} can't coach you right now. Nothing was shared and nothing was paid.", null, body.Message, now);
        // "Block further requests" (canvas C3): for spam or abuse; they aren't told.
        if (body.Block && !await db.Blocks.AnyAsync(b => b.BlockerId == coachId && b.BlockedId == rel.ClientId))
            db.Blocks.Add(new Block { BlockerId = coachId, BlockedId = rel.ClientId, CreatedAt = now });
        await db.SaveChangesAsync();
        if (!body.Block) await RequestEmails.MaybeSendAsync(db, email, config, rel.Id, Events.Closed, evt.Id);
        return Results.NoContent();
    }

    private static async Task<IResult> Reopen(Guid relationshipId, ClaimsPrincipal caller, AppDbContext db, IEmailSender email, IConfiguration config)
    {
        var coachId = caller.GetUserId();
        var now = DateTime.UtcNow;
        var rel = await db.CoachClientRelationships.Include(r => r.Coach).FirstOrDefaultAsync(r =>
            r.Id == relationshipId && r.CoachId == coachId && r.Status == CoachClientStatus.Revoked && r.RequestedByClient
            && (r.RequestStage == RequestStages.NotAFit || r.RequestStage == RequestStages.Withdrawn));
        if (rel is null) return Results.NotFound(new { error = "That request can't be reopened." });
        if (await db.Blocks.AnyAsync(b => b.BlockerId == rel.ClientId && b.BlockedId == coachId))
            return Results.NotFound(new { error = "That request can't be reopened." });
        rel.Status = CoachClientStatus.Pending;
        rel.RequestStage = RequestStages.Asked;
        rel.UpdatedAt = now;
        var evt = Post(db, rel, coachId, Events.Reopened, $"{NameOf(rel.Coach)} reopened your request.", null, null, now);
        await db.SaveChangesAsync();
        await RequestEmails.MaybeSendAsync(db, email, config, rel.Id, Events.Reopened, evt.Id);
        return Results.NoContent();
    }

    private static async Task<IResult> Closed(ClaimsPrincipal caller, AppDbContext db)
    {
        var coachId = caller.GetUserId();
        var rows = await db.CoachClientRelationships.AsNoTracking().Include(r => r.Client).Include(r => r.InviteLink)
            .Where(r => r.CoachId == coachId && r.Status == CoachClientStatus.Revoked && r.RequestedByClient
                && (r.RequestStage == RequestStages.NotAFit || r.RequestStage == RequestStages.Withdrawn))
            .OrderByDescending(r => r.UpdatedAt).Take(100).ToListAsync();
        return Results.Ok(new
        {
            requests = rows.Select(r => new
            {
                relationshipId = r.Id,
                client = r.Client.ToProfileDto(false),
                linkName = r.InviteLink?.Name,
                stage = r.RequestStage,
                answers = AnswersOf(r),
                closedAt = r.UpdatedAt,
            }),
        });
    }

    // ── Client: asking from a profile ────────────────────────────────────────

    private static Task<User?> CoachByUsername(AppDbContext db, string username) =>
        db.Users.FirstOrDefaultAsync(u => u.Username == username.ToLowerInvariant() && !u.IsSample);

    private static async Task<IResult> AskInfo(string username, ClaimsPrincipal caller, AppDbContext db, IConfiguration config)
    {
        var coach = await CoachByUsername(db, username);
        if (coach is null || !CoachingAccess.CanCoach(coach, config)) return Results.NotFound(new { error = "They aren't coaching on LogIt." });
        Guid? me = caller.Identity?.IsAuthenticated == true ? caller.GetUserId() : null;
        var now = DateTime.UtcNow;
        var taken = await TakenAsync(db, coach.Id, now);
        var existing = me is null ? null : await db.CoachClientRelationships.AsNoTracking()
            .FirstOrDefaultAsync(r => r.CoachId == coach.Id && r.ClientId == me && r.Status != CoachClientStatus.Revoked);
        var packages = await db.CoachPackages.AsNoTracking().Where(k => k.CoachId == coach.Id && !k.Hidden && k.ShowOnProfile)
            .OrderBy(k => k.AmountCents).Select(k => new { k.Id, k.Name, k.AmountCents, k.Currency, k.Interval, k.Weeks }).ToListAsync();
        return Results.Ok(new
        {
            coach = coach.ToProfileDto(false),
            questions = QuestionsOf(coach),
            packages,
            full = IsFull(coach, taken),
            whenFull = coach.CoachWhenFull ?? "waitlist",
            expectSpots = coach.CoachExpectSpots,
            isSelf = coach.Id == me,
            relationshipId = existing?.Id,
            relationship = existing is null ? "none"
                : existing.Status is CoachClientStatus.Active or CoachClientStatus.Paused ? "active"
                : existing.RequestedByClient ? "requested" : "invited",
            stage = existing?.RequestStage,
            // Already this coach's client: since when (canvas R1).
            coachedSince = existing is { Status: CoachClientStatus.Active or CoachClientStatus.Paused } ? existing.UpdatedAt : (DateTime?)null,
            otherCoach = me is { } id ? await OtherCoachAsync(db, id, coach.Id) : null,
        });
    }

    private static async Task<IResult> Ask(string username, [FromBody] AskBody body, ClaimsPrincipal caller, AppDbContext db, IConfiguration config)
    {
        var coach = await CoachByUsername(db, username);
        if (coach is null || !CoachingAccess.CanCoach(coach, config)) return Results.NotFound(new { error = "They aren't coaching on LogIt." });
        var me = caller.GetUserId();
        if (coach.Id == me) return Results.BadRequest(new { error = "You can't ask yourself." });
        if (await db.Blocks.AnyAsync(b => (b.BlockerId == coach.Id && b.BlockedId == me) || (b.BlockerId == me && b.BlockedId == coach.Id)))
            return Results.NotFound(new { error = "They aren't coaching on LogIt." });
        return await CreateOrUpdateAsync(db, coach, me, body.Answers, body.InterestedPackageId, body.Sharing, null, isSample: false);
    }

    /// Asking (from a profile, or a free link): a new request, or new answers on one already
    /// waiting. When the coach is full it joins their waiting list, or is turned away if they've
    /// stopped taking requests. Shared with CoachLinkEndpoints.
    public static async Task<IResult> CreateOrUpdateAsync(AppDbContext db, User coach, Guid me,
        Dictionary<string, string>? given, Guid? interested, SharingDto? sharing, Guid? linkId, bool isSample)
    {
        var now = DateTime.UtcNow;
        // Older apps send no answers; newer ones answer the coach's questions.
        List<Answer>? answers = null;
        if (given is not null)
        {
            var (a, problem) = CheckAnswers(QuestionsOf(coach), given);
            if (problem is not null) return Results.BadRequest(new { error = problem });
            answers = a;
        }
        if (interested is { } pid && !await db.CoachPackages.AnyAsync(k => k.Id == pid && k.CoachId == coach.Id && !k.Hidden))
            interested = null;

        var existing = await db.CoachClientRelationships.FirstOrDefaultAsync(r => r.CoachId == coach.Id && r.ClientId == me);
        switch (existing)
        {
            case { Status: CoachClientStatus.Active }:
                return Results.Conflict(new { error = "You're already coached by them.", code = "already_coached" });
            case { Status: CoachClientStatus.Paused }:
                return Results.Conflict(new { error = "Coaching with them is paused until it's paid.", code = "paused" });
            case { Status: CoachClientStatus.Pending, RequestedByClient: false }:
                // The coach already invited you, so asking back is a yes.
                existing.ApplySharing(sharing ?? SharingDto.All);
                existing.Status = CoachClientStatus.Active;
                existing.RequestStage = null;
                existing.UpdatedAt = now;
                await db.SaveChangesAsync();
                return Results.Ok(new { relationshipId = existing.Id, status = "active", stage = (string?)null });
            case { Status: CoachClientStatus.Pending }:
                if (sharing is not null) existing.ApplySharing(sharing);
                if (answers is not null) existing.AnswersJson = ToJson(answers);
                if (interested is not null) existing.InterestedPackageId = interested;
                existing.UpdatedAt = now;
                await db.SaveChangesAsync();
                return Results.Ok(new { relationshipId = existing.Id, status = "requested", stage = existing.RequestStage });
        }

        var stage = RequestStages.Asked;
        if (!isSample && IsFull(coach, await TakenAsync(db, coach.Id, now)))
        {
            if (coach.CoachWhenFull == "stop")
                return Results.Json(new { error = $"{NameOf(coach)} isn't taking new clients right now.", code = "not_taking" }, statusCode: StatusCodes.Status409Conflict);
            stage = RequestStages.Waiting;
        }
        if (existing is null)
        {
            existing = new CoachClientRelationship { CoachId = coach.Id, ClientId = me };
            db.CoachClientRelationships.Add(existing);
        }
        existing.Status = CoachClientStatus.Pending;
        existing.RequestedByClient = true;
        existing.InviteLinkId = linkId;
        existing.RequestStage = stage;
        existing.WaitingSince = stage == RequestStages.Waiting ? now : null;
        existing.AnswersJson = answers is null ? null : ToJson(answers);
        existing.InterestedPackageId = interested;
        existing.ApplySharing(sharing ?? SharingDto.All);
        existing.UpdatedAt = now;
        await db.SaveChangesAsync();
        return Results.Ok(new { relationshipId = existing.Id, status = "requested", stage });
    }

    // ── Client: their request ────────────────────────────────────────────────

    private static async Task<IResult> WithdrawMine(Guid relationshipId, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var now = DateTime.UtcNow;
        var rel = await db.CoachClientRelationships.Include(r => r.Client).FirstOrDefaultAsync(r =>
            r.Id == relationshipId && r.ClientId == me && r.Status == CoachClientStatus.Pending && r.RequestedByClient);
        if (rel is null) return Results.NotFound();
        var leftWaitingList = rel.RequestStage == RequestStages.Waiting;
        await CloseOpenOffer(db, rel.Id, OfferStates.Withdrawn, now);
        rel.Status = CoachClientStatus.Revoked;
        rel.RequestStage = RequestStages.Withdrawn;
        rel.UpdatedAt = now;
        Post(db, rel, me, Events.Withdrawn,
            leftWaitingList ? $"{NameOf(rel.Client)} left your waiting list." : $"{NameOf(rel.Client)} withdrew their request.", null, null, now);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    /// "Delete this request" (canvas A3): a closed request's answers go; the coach no longer
    /// lists it. The conversation stays readable to both, like any closed one.
    private static async Task<IResult> DeleteMine(Guid relationshipId, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var rel = await db.CoachClientRelationships.FirstOrDefaultAsync(r =>
            r.Id == relationshipId && r.ClientId == me && r.Status == CoachClientStatus.Revoked && r.RequestedByClient
            && (r.RequestStage == RequestStages.NotAFit || r.RequestStage == RequestStages.Withdrawn));
        if (rel is null) return Results.NotFound();
        rel.AnswersJson = null;
        rel.InterestedPackageId = null;
        rel.RequestStage = null;
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    /// Taking an offer with no payment through LogIt starts coaching now. A paid offer goes
    /// through checkout instead (402 until build plan 1.5 connects it).
    private static async Task<IResult> Take(Guid offerId, [FromBody] TakeBody body, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var now = DateTime.UtcNow;
        var offer = await db.CoachOffers.Include(o => o.Relationship).ThenInclude(r => r.Client)
            .FirstOrDefaultAsync(o => o.Id == offerId && o.Relationship.ClientId == me);
        if (offer is null) return Results.NotFound();
        var rel = offer.Relationship;
        if (rel.Status != CoachClientStatus.Pending) return Results.Conflict(new { error = "This request isn't open any more." });
        switch (StateOf(offer, now))
        {
            case OfferStates.Expired:
                return Results.Json(new { error = "This offer ran out. Ask if the spot is still free.", code = "expired" }, statusCode: StatusCodes.Status410Gone);
            case not OfferStates.Open:
                return Results.Json(new { error = "This offer isn't open any more.", code = "closed" }, statusCode: StatusCodes.Status410Gone);
        }
        // A sandbox sample client never pays (as on a paid link).
        if (offer.PackageId is not null && !rel.Client.IsSample)
            return Results.Json(new { error = "This offer is paid: pay to start coaching.", code = "payment_required" }, statusCode: StatusCodes.Status402PaymentRequired);

        offer.State = OfferStates.Taken;
        offer.ClosedAt = now;
        if (body.Sharing is { } s) rel.ApplySharing(s);
        rel.Status = CoachClientStatus.Active;
        rel.RequestStage = null;
        rel.UpdatedAt = now; // "client since"
        Post(db, rel, me, Events.Joined, $"{NameOf(rel.Client)} took the spot. Coaching has started.", new { offerId = offer.Id }, null, now);
        await db.SaveChangesAsync();
        return Results.Ok(new { relationshipId = rel.Id, status = "active" });
    }
}
