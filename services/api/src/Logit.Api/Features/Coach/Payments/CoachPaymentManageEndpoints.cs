using System.Security.Claims;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using static Logit.Api.Features.Coach.CoachIntake;

namespace Logit.Api.Features.Coach.Payments;

/// Payments › Manage (canvas Q9, K14, K18): refund a payment without ending coaching, change a
/// client's package (they accept; it starts at their next payment so nobody pays twice), and
/// stop taking payments through LogIt altogether.
public static class CoachPaymentManageEndpoints
{
    public record RefundBody(string? ReceiptId, long AmountCents, string? Reason);
    public record ChangeBody(Guid? PackageId, string? Message);
    public record PayChangeBody(string SuccessUrl, string CancelUrl);

    public static void MapCoachPaymentManageEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/coach").WithTags("Coach").RequireAuthorization();
        g.MapGet("/payments/clients/{relationshipId:guid}/receipts", Receipts).RequireTier(UserTier.Studio);
        g.MapPost("/payments/clients/{relationshipId:guid}/refund", Refund).RequireTier(UserTier.Studio);
        g.MapPost("/payments/clients/{relationshipId:guid}/change-package", OfferChange).RequireTier(UserTier.Studio);
        g.MapPost("/payments/stop", StopTakingPayments).RequireTier(UserTier.Studio);
        g.MapPost("/coaches/{relationshipId:guid}/package-change/{offerId:guid}/accept", AcceptChange);
        g.MapPost("/coaches/{relationshipId:guid}/package-change/{offerId:guid}/decline", DeclineChange);
        g.MapPost("/coaches/{relationshipId:guid}/pay-change", PayChange);
    }

    private static Task<CoachClientRelationship?> MyClient(AppDbContext db, Guid relId, Guid coachId) =>
        db.CoachClientRelationships.Include(r => r.Payment).Include(r => r.Client).Include(r => r.Coach)
            .FirstOrDefaultAsync(r => r.Id == relId && r.CoachId == coachId && !r.Client.IsSample
                && (r.Status == CoachClientStatus.Active || r.Status == CoachClientStatus.Paused));

    /// Their payments, with what's been refunded from each (canvas Q9 "Refund Aoife").
    private static async Task<IResult> Receipts(Guid relationshipId, ClaimsPrincipal caller, AppDbContext db, CancellationToken ct)
    {
        var rel = await MyClient(db, relationshipId, caller.GetUserId());
        if (rel is null) return Results.NotFound();
        var all = await db.CoachPaymentReceipts.AsNoTracking().Where(r => r.RelationshipId == rel.Id).OrderByDescending(r => r.PaidAt).ToListAsync(ct);
        var paid = all.Where(r => r.AmountCents > 0).ToList();
        return Results.Ok(new
        {
            receipts = paid.Select(r =>
            {
                var key = CoachPaymentService.RefundKey(r.ExternalId);
                var refunded = -all.Where(x => x.ExternalId == key || x.ExternalId.StartsWith(key + ":")).Sum(x => x.AmountCents);
                return new { id = r.Id, amountCents = r.AmountCents, currency = r.Currency, paidAt = r.PaidAt, refundedCents = refunded, packageName = rel.Payment?.PackageName };
            }),
        });
    }

    /// Give money back; coaching carries on (canvas Q9). Through the coach's Stripe account.
    private static async Task<IResult> Refund(Guid relationshipId, [FromBody] RefundBody body, ClaimsPrincipal caller, AppDbContext db,
        ICoachStripe stripe, ILoggerFactory lf, CancellationToken ct)
    {
        var coachId = caller.GetUserId();
        var rel = await MyClient(db, relationshipId, coachId);
        if (rel is null) return Results.NotFound();
        if (!Guid.TryParse(body.ReceiptId, out var receiptId)) return Results.BadRequest(new { error = "Pick the payment to refund." });
        if (body.Reason?.Length > 200) return Results.BadRequest(new { error = "Keep the reason short." });
        var receipt = await db.CoachPaymentReceipts.FirstOrDefaultAsync(r => r.Id == receiptId && r.RelationshipId == rel.Id && r.AmountCents > 0, ct);
        if (receipt is null) return Results.NotFound(new { error = "That payment isn't theirs." });
        var key = CoachPaymentService.RefundKey(receipt.ExternalId);
        var refunded = -await db.CoachPaymentReceipts.Where(x => x.ExternalId == key || x.ExternalId.StartsWith(key + ":")).SumAsync(x => (long?)x.AmountCents, ct) ?? 0;
        if (body.AmountCents < 1 || body.AmountCents > receipt.AmountCents - refunded)
            return Results.BadRequest(new { error = $"Refund between {Money(1, receipt.Currency)} and {Money(receipt.AmountCents - refunded, receipt.Currency)}." });
        var account = await db.CoachPaymentAccounts.AsNoTracking().FirstOrDefaultAsync(a => a.CoachId == coachId, ct);
        if (!stripe.Configured || account?.StripeAccountId is null) return Results.Json(new { error = "Payments aren't connected.", code = "payments_not_ready" }, statusCode: 409);

        var partKey = $"{key}:{Guid.NewGuid():N}";
        StripeRefund result;
        try { result = await stripe.RefundAsync(account.StripeAccountId, receipt.ExternalId, body.AmountCents, partKey, ct); }
        catch (Exception ex)
        {
            lf.CreateLogger("Logit.CoachPayments").LogWarning("Refund of {Receipt} failed: {Reason}", receipt.Id, ex.Message);
            return Results.Json(new { error = "Stripe couldn't make the refund, so nothing was refunded. Try again in a minute, or refund in your Stripe dashboard.", code = "stripe" }, statusCode: 502);
        }
        var now = DateTime.UtcNow;
        db.CoachPaymentReceipts.Add(new CoachPaymentReceipt
        {
            CoachId = coachId, RelationshipId = rel.Id, ExternalId = partKey, AmountCents = -body.AmountCents, Currency = receipt.Currency, PaidAt = now,
        });
        var reason = string.IsNullOrWhiteSpace(body.Reason) ? null : body.Reason.Trim();
        Post(db, rel, coachId, Events.Refunded,
            $"{NameOf(rel.Coach)} refunded {Money(body.AmountCents, receipt.Currency)} to your card{(reason is null ? "." : $": {reason}")}",
            new { amountCents = body.AmountCents, currency = receipt.Currency, reason }, null, now);
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { refundedCents = body.AmountCents, status = result.Status });
    }

    // ── Change package (K14) ─────────────────────────────────────────────────

    /// The coach offers a different package; nothing changes until the client accepts.
    private static async Task<IResult> OfferChange(Guid relationshipId, [FromBody] ChangeBody body, ClaimsPrincipal caller, AppDbContext db, CancellationToken ct)
    {
        var coachId = caller.GetUserId();
        var rel = await MyClient(db, relationshipId, coachId);
        if (rel is null) return Results.NotFound();
        if (body.Message?.Length > MaxMessage) return Results.BadRequest(new { error = "That message is too long." });
        CoachPackage? package = null;
        if (body.PackageId is { } pid)
        {
            package = await db.CoachPackages.FirstOrDefaultAsync(k => k.Id == pid && k.CoachId == coachId && !k.Hidden, ct);
            if (package is null) return Results.BadRequest(new { error = "That package isn't available." });
            if (rel.Payment is { Mode: PaymentModes.Stripe } current && current.PackageId == pid && current.State != PaymentStates.Ended)
                return Results.BadRequest(new { error = "That's the package they have." });
            if (!await db.CoachPaymentAccounts.AnyAsync(a => a.CoachId == coachId && a.CardPaymentsActive && !a.PaymentsStopped, ct))
                return Results.BadRequest(new { error = "Paid packages need payments set up first.", code = "payments_not_ready" });
        }
        var now = DateTime.UtcNow;
        // One change open at a time: a new one replaces it.
        foreach (var old in await db.CoachOffers.Where(o => o.RelationshipId == rel.Id && o.IsChange && o.State == OfferStates.Open).ToListAsync(ct))
        {
            old.State = OfferStates.Replaced;
            old.ClosedAt = now;
        }
        var offer = new CoachOffer
        {
            RelationshipId = rel.Id, IsChange = true, PackageId = package?.Id,
            PackageName = package?.Name ?? "No payment through LogIt", PackageDescription = package?.Description ?? "",
            AmountCents = package?.AmountCents ?? 0, Currency = package?.Currency ?? rel.Payment?.Currency ?? "eur",
            Interval = package?.Interval ?? PaymentIntervals.Once, Weeks = package?.Weeks,
            HoldUntil = now.AddDays(30), CreatedAt = now,
        };
        db.CoachOffers.Add(offer);
        var startsOn = rel.Payment is { Mode: PaymentModes.Stripe, PaidUntil: { } until } && until > now ? until : now;
        Post(db, rel, coachId, Events.PackageChange,
            $"{NameOf(rel.Coach)} suggests changing your package to {offer.PackageName}{(package is null ? "" : $", {PriceText(offer)}")}, from {startsOn:d MMM}. Nothing changes unless you accept.",
            new { offer = CardOf(offer), startsOnMs = Ms(startsOn) }, body.Message, now);
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { offerId = offer.Id });
    }

    private static async Task<(CoachClientRelationship? Rel, CoachOffer? Offer)> MyChange(AppDbContext db, Guid relId, Guid offerId, Guid me, CancellationToken ct)
    {
        var rel = await db.CoachClientRelationships.Include(r => r.Payment).Include(r => r.Coach).Include(r => r.Client)
            .FirstOrDefaultAsync(r => r.Id == relId && r.ClientId == me && (r.Status == CoachClientStatus.Active || r.Status == CoachClientStatus.Paused), ct);
        var offer = rel is null ? null : await db.CoachOffers.FirstOrDefaultAsync(o => o.Id == offerId && o.RelationshipId == rel.Id && o.IsChange, ct);
        return (rel, offer);
    }

    /// Accepting: it starts at the next payment. Monthly to monthly changes the price on Stripe;
    /// anything else stops the plan renewing and then asks them to pay the new package (or, with
    /// no payment through LogIt, makes them "paid elsewhere").
    private static async Task<IResult> AcceptChange(Guid relationshipId, Guid offerId, ClaimsPrincipal caller, AppDbContext db,
        ICoachStripe stripe, CoachPaymentService payments, CancellationToken ct)
    {
        var me = caller.GetUserId();
        var (rel, offer) = await MyChange(db, relationshipId, offerId, me, ct);
        if (rel is null || offer is null) return Results.NotFound();
        var now = DateTime.UtcNow;
        if (StateOf(offer, now) != OfferStates.Open) return Results.Json(new { error = "This change isn't open any more.", code = "closed" }, statusCode: 410);
        var p = rel.Payment;
        var monthlyNow = p is { Mode: PaymentModes.Stripe, Interval: PaymentIntervals.Month, StripeSubscriptionId: not null } && p.State != PaymentStates.Ended;
        var paidUntil = p?.PaidUntil is { } u && u > now ? u : now;

        if (monthlyNow && offer.PackageId is not null && offer.Interval == PaymentIntervals.Month)
        {
            var account = await db.CoachPaymentAccounts.AsNoTracking().FirstAsync(a => a.CoachId == rel.CoachId, ct);
            try { await stripe.ChangeMonthlyPriceAsync(account.StripeAccountId!, p!.StripeSubscriptionId!, offer.AmountCents, offer.Currency, offer.PackageName, ct); }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                return Results.Json(new { error = "Stripe couldn't change your plan, so nothing changed. Try again in a minute.", code = "stripe" }, statusCode: 502);
            }
            p.PackageId = offer.PackageId;
            p.PackageName = offer.PackageName;
            p.AmountCents = offer.AmountCents;
            p.UpdatedAt = now;
        }
        else if (p is { Mode: PaymentModes.Stripe } && p.State != PaymentStates.Ended)
        {
            if (monthlyNow)
            {
                try { await payments.SetStopAtPeriodEndAsync(rel, true, now, ct); }
                catch (Exception ex) when (ex is not OperationCanceledException)
                { return Results.Json(new { error = "Stripe couldn't change your plan, so nothing changed. Try again in a minute.", code = "stripe" }, statusCode: 502); }
            }
            p.PendingPackageId = offer.PackageId;
            p.PendingNoPayment = offer.PackageId is null;
            p.UpdatedAt = now;
        }
        else
        {
            // Not paying through LogIt now: a paid package is due now; none changes nothing.
            if (offer.PackageId is not null)
            {
                if (p is null)
                {
                    p = new CoachClientPayment { Relationship = rel, Mode = PaymentModes.Elsewhere, PackageName = "", CreatedAt = now };
                    db.CoachClientPayments.Add(p);
                }
                p.PendingPayPackageId = offer.PackageId;
                Post(db, rel, rel.CoachId, Events.PayForChange,
                    $"Time to pay for {offer.PackageName}: {Money(offer.AmountCents, offer.Currency)}.",
                    new { packageId = offer.PackageId, packageName = offer.PackageName, amountCents = offer.AmountCents, currency = offer.Currency, interval = offer.Interval }, null, now);
            }
        }
        offer.State = OfferStates.Taken;
        offer.ClosedAt = now;
        Post(db, rel, me, Events.PackageChangeAccepted,
            $"{NameOf(rel.Client)} accepted {offer.PackageName}, from {paidUntil:d MMM}.", new { offerId = offer.Id, startsOnMs = Ms(paidUntil) }, null, now);
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { startsOn = paidUntil });
    }

    private static async Task<IResult> DeclineChange(Guid relationshipId, Guid offerId, ClaimsPrincipal caller, AppDbContext db, CancellationToken ct)
    {
        var me = caller.GetUserId();
        var (rel, offer) = await MyChange(db, relationshipId, offerId, me, ct);
        if (rel is null || offer is null) return Results.NotFound();
        var now = DateTime.UtcNow;
        if (StateOf(offer, now) != OfferStates.Open) return Results.NoContent();
        offer.State = OfferStates.Withdrawn;
        offer.ClosedAt = now;
        Post(db, rel, me, Events.PackageChangeDeclined, $"{NameOf(rel.Client)} kept their package.", new { offerId = offer.Id }, null, now);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    /// The changed-to package is due: pay it on Stripe's page (coaching carries on once paid).
    private static async Task<IResult> PayChange(Guid relationshipId, [FromBody] PayChangeBody body, ClaimsPrincipal caller, AppDbContext db,
        ICoachStripe stripe, CancellationToken ct)
    {
        var me = caller.GetUserId();
        var rel = await db.CoachClientRelationships.Include(r => r.Payment).Include(r => r.Client)
            .FirstOrDefaultAsync(r => r.Id == relationshipId && r.ClientId == me && (r.Status == CoachClientStatus.Active || r.Status == CoachClientStatus.Paused), ct);
        if (rel?.Payment?.PendingPayPackageId is not { } pid) return Results.NotFound(new { error = "There's nothing to pay." });
        var package = await db.CoachPackages.AsNoTracking().FirstOrDefaultAsync(k => k.Id == pid, ct);
        var account = await db.CoachPaymentAccounts.AsNoTracking().FirstOrDefaultAsync(a => a.CoachId == rel.CoachId, ct);
        if (package is null || !stripe.Configured || account is not { CardPaymentsActive: true, PaymentsStopped: false, StripeAccountId: not null })
            return Results.Json(new { error = "Your coach can't take payments right now.", code = "payments_not_ready" }, statusCode: 409);
        var meta = new CheckoutMeta(rel.CoachId, me, null, package.Id, rel.ToSharingDto());
        var start = await stripe.CreateCheckoutAsync(new CheckoutStartRequest(
            account.StripeAccountId!, package.Interval == PaymentIntervals.Month, package.Currency, package.AmountCents, package.Name,
            string.IsNullOrWhiteSpace(package.Description) ? null : package.Description,
            string.IsNullOrWhiteSpace(rel.Client.Email) ? null : rel.Client.Email, me.ToString(), meta.ToMetadata(),
            body.SuccessUrl + (body.SuccessUrl.Contains('?') ? "&" : "?") + "session_id={CHECKOUT_SESSION_ID}", body.CancelUrl), ct);
        return Results.Ok(new { url = start.Url });
    }

    // ── Stop taking payments through LogIt (K18) ─────────────────────────────

    /// Every plan stops renewing; each client keeps coaching to the end of what they paid for,
    /// then shows as paid elsewhere. Nothing is refunded. The Stripe account stays the coach's.
    private static async Task<IResult> StopTakingPayments(ClaimsPrincipal caller, AppDbContext db, CoachPaymentService payments, ILoggerFactory lf, CancellationToken ct)
    {
        var log = lf.CreateLogger("Logit.CoachPayments");
        var coachId = caller.GetUserId();
        var account = await db.CoachPaymentAccounts.FirstOrDefaultAsync(a => a.CoachId == coachId, ct);
        if (account is null || account.PaymentsStopped) return Results.NoContent();
        var now = DateTime.UtcNow;
        var rels = await db.CoachClientRelationships.Include(r => r.Payment).Include(r => r.Coach)
            .Where(r => r.CoachId == coachId && (r.Status == CoachClientStatus.Active || r.Status == CoachClientStatus.Paused)
                && r.Payment != null && r.Payment.Mode == PaymentModes.Stripe && r.Payment.State != PaymentStates.Ended
                && !r.Payment.PendingNoPayment) // done on an earlier try
            .ToListAsync(ct);
        var failed = new List<string>();
        foreach (var rel in rels)
        {
            var p = rel.Payment!;
            if (p.Interval == PaymentIntervals.Month)
            {
                // A plan Stripe wouldn't stop keeps renewing, so it isn't marked; stopping again retries it.
                try { await payments.SetStopAtPeriodEndAsync(rel, true, now, ct); }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    log.LogWarning("Couldn't stop plan {Sub}: {Reason}", p.StripeSubscriptionId, ex.Message);
                    failed.Add(rel.ClientId.ToString());
                    continue;
                }
            }
            p.PendingNoPayment = true;
            p.PendingPackageId = null;
            Post(db, rel, coachId, Events.PlanChanged,
                $"{NameOf(rel.Coach)} has stopped taking payments through LogIt. Your plan stops renewing{(p.PaidUntil is { } u ? $" on {u:d MMM}" : "")}; coaching carries on, and you'll pay {NameOf(rel.Coach)} another way.",
                null, null, now);
        }
        if (failed.Count > 0)
        {
            await db.SaveChangesAsync(ct);
            return Results.Json(new { error = $"Stripe couldn't stop {failed.Count} of the plans, so payments are still on. Try again in a minute.", code = "stripe" }, statusCode: 502);
        }
        account.PaymentsStopped = true;
        account.UpdatedAt = now;
        // Open paid offers can't be paid any more.
        foreach (var o in await db.CoachOffers.Where(o => o.Relationship.CoachId == coachId && o.PackageId != null && o.State == OfferStates.Open).ToListAsync(ct))
        {
            o.State = OfferStates.Withdrawn;
            o.ClosedAt = now;
        }
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { plansStopped = rels.Count });
    }
}
