using System.Security.Claims;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Coach.Payments;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using static Logit.Api.Features.Coach.CoachIntake;

namespace Logit.Api.Features.Coach;

/// The ways out of coaching (canvas E1, E2, M1, Z2, Z3): the coach pauses or ends it (with a
/// refund and a coach to suggest), the client manages and stops it, stops with a refund when the
/// coach has gone quiet, and retries a failed payment with a new card. Every change is a card
/// in the conversation, so both sides see the same thing. Money goes through CoachingEnd (0.1).
public static class CoachEndingEndpoints
{
    /// No reply from the coach for this long: the client can stop with a refund (canvas Z2).
    public static readonly TimeSpan QuietAfter = TimeSpan.FromDays(7);

    public record EndBody(string? Refund, long? RefundCents, string? Message, string? Suggest);
    public record PauseBody(DateTime Until, string? Message);
    public record StopBody(bool Quiet = false);

    public static void MapCoachEndingEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/coach").WithTags("Coach").RequireAuthorization();
        g.MapGet("/clients/{relationshipId:guid}/ending", Preview).RequireCoaching();
        g.MapPost("/clients/{relationshipId:guid}/end", End).RequireCoaching();
        g.MapPost("/clients/{relationshipId:guid}/pause", Pause).RequireCoaching();
        g.MapPost("/clients/{relationshipId:guid}/resume", Resume).RequireCoaching();
        g.MapGet("/coaches/{relationshipId:guid}/manage", Manage);
        g.MapPost("/coaches/{relationshipId:guid}/stop", Stop);
        g.MapPost("/coaches/{relationshipId:guid}/retry-payment", RetryPayment);
    }

    // ── Coach: pause or end (E1) ─────────────────────────────────────────────

    private static Task<CoachClientRelationship?> MyClient(AppDbContext db, Guid relId, Guid coachId) =>
        db.CoachClientRelationships.Include(r => r.Payment).Include(r => r.Client).Include(r => r.Coach)
            .FirstOrDefaultAsync(r => r.Id == relId && r.CoachId == coachId
                && (r.Status == CoachClientStatus.Active || r.Status == CoachClientStatus.Paused));

    /// What ending would do with money: their last payment and the unused share of it.
    private static async Task<IResult> Preview(Guid relationshipId, ClaimsPrincipal caller, AppDbContext db, CoachPaymentService payments, CancellationToken ct)
    {
        var rel = await MyClient(db, relationshipId, caller.GetUserId());
        if (rel is null) return Results.NotFound();
        var now = DateTime.UtcNow;
        var p = rel.Payment;
        var last = p is { Mode: PaymentModes.Stripe } ? await payments.LastPaymentAsync(rel.Id, ct) : null;
        return Results.Ok(new
        {
            mode = p?.Mode ?? "none",
            lastPayment = last is null ? null : new { amountCents = last.AmountCents, currency = last.Currency, paidAt = last.PaidAt },
            unusedCents = last is not null && p?.PaidUntil is { } until ? CoachPaymentService.UnusedShare(last.AmountCents, last.PaidAt, until, now) : 0,
            paidUntil = p?.PaidUntil,
            pausedUntil = rel.PausedUntil,
        });
    }

    private static RefundRule? RuleOf(EndBody body) => body.Refund switch
    {
        null or "none" => RefundRule.None,
        "unused" => RefundRule.Unused,
        "full" => RefundRule.Full,
        "exact" when body.RefundCents is > 0 => RefundRule.Exact(body.RefundCents.Value),
        _ => null,
    };

    private static async Task<IResult> End(Guid relationshipId, [FromBody] EndBody body, ClaimsPrincipal caller, AppDbContext db,
        CoachingEnd coaching, CancellationToken ct)
    {
        var coachId = caller.GetUserId();
        var rel = await MyClient(db, relationshipId, coachId);
        if (rel is null) return Results.NotFound();
        if (RuleOf(body) is not { } rule) return Results.BadRequest(new { error = "Choose how much to refund." });
        if (body.Message?.Length > MaxMessage) return Results.BadRequest(new { error = "That message is too long." });
        User? suggest = null;
        if (!string.IsNullOrWhiteSpace(body.Suggest))
        {
            suggest = await db.Users.FirstOrDefaultAsync(u => u.Username == body.Suggest.Trim().TrimStart('@').ToLowerInvariant() && !u.IsSample, ct);
            if (suggest is null || suggest.Id == coachId || suggest.Id == rel.ClientId)
                return Results.BadRequest(new { error = "There's no coach with that username to suggest." });
        }
        var now = DateTime.UtcNow;
        EndMoney money;
        try { money = await coaching.EndAsync(rel, EndReason.CoachEnded, rule, now, ct, strict: true); }
        catch (CoachingPaymentException ex) { return Results.Json(new { error = ex.Message, code = "stripe" }, statusCode: StatusCodes.Status502BadGateway); }
        rel.PausedUntil = null;
        Post(db, rel, coachId, Events.Ended,
            $"{NameOf(rel.Coach)} ended coaching." + (money.RefundedCents > 0 ? $" {Money(money.RefundedCents, money.Currency)} is refunded to your card." : "")
                + (suggest is null ? "" : $" They suggest {NameOf(suggest)} (@{suggest.Username})."),
            new { refundCents = money.RefundedCents, currency = money.Currency, refundStatus = money.RefundStatus, suggest = suggest is null ? null : new { suggest.Username, displayName = NameOf(suggest) } },
            body.Message, now);
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { refundedCents = money.RefundedCents, currency = money.Currency, refundStatus = money.RefundStatus });
    }

    private static async Task<IResult> Pause(Guid relationshipId, [FromBody] PauseBody body, ClaimsPrincipal caller, AppDbContext db,
        ICoachStripe stripe, ILoggerFactory lf, CancellationToken ct)
    {
        var coachId = caller.GetUserId();
        var rel = await MyClient(db, relationshipId, coachId);
        if (rel is null) return Results.NotFound();
        var now = DateTime.UtcNow;
        var until = DateTime.SpecifyKind(body.Until.Date, DateTimeKind.Utc);
        if (until <= now.Date || until > now.AddDays(180)) return Results.BadRequest(new { error = "Pause until a day in the next six months." });
        if (body.Message?.Length > MaxMessage) return Results.BadRequest(new { error = "That message is too long." });
        if (await PauseStripe(db, stripe, rel, until, ct) is { } error)
        {
            lf.CreateLogger("Logit.CoachPayments").LogWarning("Couldn't pause payments for {Rel}: {Reason}", rel.Id, error);
            return Results.Json(new { error = "Couldn't pause their payments with Stripe. Try again in a minute.", code = "stripe" }, statusCode: 502);
        }
        rel.PausedUntil = until;
        Post(db, rel, coachId, Events.Paused,
            $"{NameOf(rel.Coach)} paused coaching until {until:ddd d MMM}. Payments and check-ins pause; your program keeps going.",
            new { untilMs = Ms(until) }, body.Message, now);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> Resume(Guid relationshipId, ClaimsPrincipal caller, AppDbContext db, ICoachStripe stripe, CancellationToken ct)
    {
        var coachId = caller.GetUserId();
        var rel = await MyClient(db, relationshipId, coachId);
        if (rel is null || rel.PausedUntil is null) return Results.NotFound();
        if (await PauseStripe(db, stripe, rel, null, ct) is not null)
            return Results.Json(new { error = "Couldn't restart their payments with Stripe. Try again in a minute.", code = "stripe" }, statusCode: 502);
        rel.PausedUntil = null;
        Post(db, rel, coachId, Events.Resumed, $"{NameOf(rel.Coach)} is back: coaching carries on.", null, null, DateTime.UtcNow);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    /// Pauses (or, with null, resumes) a monthly plan through LogIt. Null when done or nothing to do.
    private static async Task<string?> PauseStripe(AppDbContext db, ICoachStripe stripe, CoachClientRelationship rel, DateTime? until, CancellationToken ct)
    {
        if (rel.Payment is not { Mode: PaymentModes.Stripe, StripeSubscriptionId: { } sub } p || p.State == PaymentStates.Ended || !stripe.Configured) return null;
        var account = await db.CoachPaymentAccounts.AsNoTracking().FirstOrDefaultAsync(a => a.CoachId == rel.CoachId, ct);
        if (account?.StripeAccountId is null) return null;
        try
        {
            await stripe.PauseCollectionAsync(account.StripeAccountId, sub, until, ct);
            return null;
        }
        catch (Exception ex) { return ex.Message; }
    }

    // ── Client: manage and stop (M1, Z2, Z3) ─────────────────────────────────

    private static Task<CoachClientRelationship?> MyCoach(AppDbContext db, Guid relId, Guid clientId) =>
        db.CoachClientRelationships.Include(r => r.Payment).Include(r => r.Coach).Include(r => r.Client)
            .FirstOrDefaultAsync(r => r.Id == relId && r.ClientId == clientId
                && (r.Status == CoachClientStatus.Active || r.Status == CoachClientStatus.Paused));

    /// When the coach last left a message from the client unanswered: the client's first
    /// message after the coach's last one. Null when the coach has the last word.
    public static async Task<DateTime?> WaitingSinceAsync(AppDbContext db, CoachClientRelationship rel)
    {
        var lastCoach = await db.CoachMessages.Where(m => m.RelationshipId == rel.Id && m.SenderUserId == rel.CoachId)
            .MaxAsync(m => (long?)m.CreatedAtMs) ?? 0;
        var firstWaiting = await db.CoachMessages.Where(m => m.RelationshipId == rel.Id && m.SenderUserId == rel.ClientId && m.Kind == null && m.CreatedAtMs > lastCoach)
            .MinAsync(m => (long?)m.CreatedAtMs);
        return firstWaiting is { } ms ? DateTimeOffset.FromUnixTimeMilliseconds(ms).UtcDateTime : null;
    }

    /// Quiet: unanswered for 7 days, counting from the end of the coach's pause if they paused.
    public static bool IsQuiet(CoachClientRelationship rel, DateTime? waitingSince, DateTime now)
    {
        if (waitingSince is not { } since) return false;
        // Away (canvas Z7): never quiet while away.
        if (rel.Coach is { } coach && CoachAway.IsAway(coach, now)) return false;
        return now - QuietFrom(rel, since, now) >= QuietAfter;
    }

    /// Where the Z2 clock starts: the unanswered message, or the day the coach came back from
    /// an away (Z7) or a pause (E2), whichever is later.
    public static DateTime QuietFrom(CoachClientRelationship rel, DateTime since, DateTime now)
    {
        if (rel.Coach is { } coach) since = CoachAway.ClockFrom(coach, since, now);
        return rel.PausedUntil is { } back && back > since ? back : since;
    }

    private static async Task<IResult> Manage(Guid relationshipId, ClaimsPrincipal caller, AppDbContext db, CoachPaymentService payments, CancellationToken ct)
    {
        var me = caller.GetUserId();
        var rel = await MyCoach(db, relationshipId, me);
        if (rel is null) return Results.NotFound();
        var now = DateTime.UtcNow;
        var p = rel.Payment;
        var waiting = await WaitingSinceAsync(db, rel);
        var quiet = IsQuiet(rel, waiting, now);
        var last = p is { Mode: PaymentModes.Stripe } ? await payments.LastPaymentAsync(rel.Id, ct) : null;
        var lastMessage = waiting is null ? null : await db.CoachMessages.AsNoTracking()
            .Where(m => m.RelationshipId == rel.Id && m.SenderUserId == me && m.Kind == null)
            .OrderByDescending(m => m.CreatedAtMs).Select(m => new { m.Body, m.CreatedAtMs }).FirstOrDefaultAsync(ct);
        var receipts = await db.CoachPaymentReceipts.CountAsync(r => r.RelationshipId == rel.Id && r.AmountCents > 0, ct);
        // Canvas K14: a change of package waiting for their answer, or the changed-to package due now.
        var change = await db.CoachOffers.AsNoTracking()
            .Where(o => o.RelationshipId == rel.Id && o.IsChange && o.State == OfferStates.Open && o.HoldUntil > now)
            .OrderByDescending(o => o.CreatedAt).FirstOrDefaultAsync(ct);
        var due = p?.PendingPayPackageId is { } dueId ? await db.CoachPackages.AsNoTracking().FirstOrDefaultAsync(k => k.Id == dueId, ct) : null;
        return Results.Ok(new
        {
            change = change is null ? null : new
            {
                offerId = change.Id, packageName = change.PackageName, packageDescription = change.PackageDescription,
                amountCents = change.AmountCents, currency = change.Currency, interval = change.Interval, weeks = change.Weeks,
                pays = change.PackageId is not null,
                startsOn = p is { Mode: PaymentModes.Stripe, PaidUntil: { } pu } && pu > now ? pu : now,
            },
            payDue = due is null ? null : new { packageName = due.Name, amountCents = due.AmountCents, currency = due.Currency, interval = due.Interval },
            pendingPackage = p?.PendingNoPayment == true ? "No payment through LogIt" : p?.PendingPackageId is { } pid2
                ? await db.CoachPackages.Where(k => k.Id == pid2).Select(k => k.Name).FirstOrDefaultAsync(ct) : null,
            coach = rel.Coach.ToProfileDto(false),
            since = rel.UpdatedAt,
            plan = p is null || p.Mode != PaymentModes.Stripe ? null : new
            {
                name = p.PackageName,
                amountCents = p.AmountCents,
                currency = p.Currency,
                interval = p.Interval,
                state = p.State,
                paidUntil = p.PaidUntil,
                stopsAtPeriodEnd = p.StopsAtPeriodEnd,
                receipts,
            },
            paidElsewhere = p?.Mode == PaymentModes.Elsewhere,
            sharing = rel.ToSharingDto(),
            answers = AnswersOf(rel),
            agreedAt = rel.AgreedAt,
            agreedText = rel.AgreedText,
            pausedUntil = rel.PausedUntil,
            endsAt = rel.EndsAt,
            // Canvas Z2: the coach hasn't replied for a week.
            quiet = quiet ? new
            {
                days = (int)Math.Floor((now - QuietFrom(rel, waiting!.Value, now)).TotalDays),
                lastMessage = lastMessage?.Body,
                lastMessageAt = lastMessage is null ? (DateTime?)null : DateTimeOffset.FromUnixTimeMilliseconds(lastMessage.CreatedAtMs).UtcDateTime,
                refundCents = last is not null && p?.PaidUntil is { } u ? CoachPaymentService.UnusedShare(last.AmountCents, last.PaidAt, u, now) : 0,
            } : null,
        });
    }

    /// Stop coaching (canvas M1). A monthly plan through LogIt stops renewing and coaching runs
    /// to the end of what was paid. Quiet (Z2): it stops now with the unused days refunded.
    private static async Task<IResult> Stop(Guid relationshipId, [FromBody] StopBody body, ClaimsPrincipal caller, AppDbContext db,
        CoachPaymentService payments, CoachingEnd coaching, CancellationToken ct)
    {
        var me = caller.GetUserId();
        var rel = await MyCoach(db, relationshipId, me);
        if (rel is null) return Results.NotFound();
        var now = DateTime.UtcNow;
        var client = NameOf(rel.Client);

        if (body.Quiet)
        {
            var waiting = await WaitingSinceAsync(db, rel);
            if (!IsQuiet(rel, waiting, now))
                return Results.Conflict(new { error = $"{NameOf(rel.Coach)} has replied in the last week.", code = "not_quiet" });
            EndMoney money;
            try { money = await coaching.EndAsync(rel, EndReason.ClientStopped, RefundRule.Unused, now, ct, strict: true); }
            catch (CoachingPaymentException ex) { return Results.Json(new { error = ex.Message, code = "stripe" }, statusCode: 502); }
            var days = (int)Math.Floor((now - waiting!.Value).TotalDays);
            Post(db, rel, me, Events.Stopped,
                $"{client} stopped coaching: no reply for {days} days." + (money.RefundedCents > 0 ? $" {Money(money.RefundedCents, money.Currency)} was refunded to their card." : ""),
                new { quietDays = days, refundCents = money.RefundedCents, currency = money.Currency }, null, now);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { status = "ended", refundedCents = money.RefundedCents, currency = money.Currency });
        }

        if (rel.Payment is { Mode: PaymentModes.Stripe, State: PaymentStates.Paid, PaidUntil: { } until } && until > now && rel.Payment.Interval == PaymentIntervals.Month)
        {
            await payments.SetStopAtPeriodEndAsync(rel, true, now, ct);
            rel.EndsAt = until;
            Post(db, rel, me, Events.Stopping,
                $"{client} stopped coaching. The plan stops renewing, and coaching ends on {until:ddd d MMM}.",
                new { endsOnMs = Ms(until) }, null, now);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { status = "ending", endsAt = until });
        }

        await coaching.EndAsync(rel, EndReason.ClientStopped, RefundRule.None, now, ct);
        Post(db, rel, me, Events.Stopped, $"{client} stopped coaching.", null, null, now);
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { status = "ended" });
    }

    /// Back from Stripe's card page (canvas Z3): try the unpaid payment now. Coaching restarts
    /// when Stripe says it's paid (invoice.paid).
    private static async Task<IResult> RetryPayment(Guid relationshipId, ClaimsPrincipal caller, AppDbContext db, ICoachStripe stripe,
        ILoggerFactory lf, CancellationToken ct)
    {
        var rel = await MyCoach(db, relationshipId, caller.GetUserId());
        if (rel?.Payment is not { Mode: PaymentModes.Stripe, StripeSubscriptionId: { } sub } p || !stripe.Configured) return Results.NotFound();
        if (p.State == PaymentStates.Paid) return Results.Ok(new { paid = true });
        var account = await db.CoachPaymentAccounts.AsNoTracking().FirstOrDefaultAsync(a => a.CoachId == rel.CoachId, ct);
        if (account?.StripeAccountId is null) return Results.NotFound();
        try
        {
            return Results.Ok(new { paid = await stripe.RetryUnpaidAsync(account.StripeAccountId, sub, ct) });
        }
        catch (Stripe.StripeException ex)
        {
            lf.CreateLogger("Logit.CoachPayments").LogInformation("Retry for {Rel} didn't go through: {Reason}", rel.Id, ex.Message);
            return Results.Ok(new { paid = false, error = "The card was declined. Try another card." });
        }
    }
}
