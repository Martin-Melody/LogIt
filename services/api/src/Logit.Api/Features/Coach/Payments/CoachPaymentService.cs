using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Email;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Coach.Payments;

/// What a checkout carries in its metadata, so the webhook (or the success page) can start
/// coaching without anything stored before the client paid.
public record CheckoutMeta(Guid CoachId, Guid ClientId, Guid? LinkId, Guid? PackageId, SharingDto Sharing, Guid? OfferId = null)
{
    public Dictionary<string, string> ToMetadata() => new()
    {
        ["logit_coach"] = CoachId.ToString(),
        ["logit_client"] = ClientId.ToString(),
        ["logit_link"] = LinkId?.ToString() ?? "",
        ["logit_package"] = PackageId?.ToString() ?? "",
        // Paying for a coach's offer (canvas J1): taking it is what the payment does.
        ["logit_offer"] = OfferId?.ToString() ?? "",
        // One character per area, in SharingDto order.
        ["logit_share"] = string.Concat(new[] { Sharing.Workouts, Sharing.Nutrition, Sharing.Bodyweight, Sharing.Habits, Sharing.Checkins }
            .Select(b => b ? '1' : '0')),
    };

    public static CheckoutMeta? From(IReadOnlyDictionary<string, string> m)
    {
        if (!m.TryGetValue("logit_coach", out var c) || !Guid.TryParse(c, out var coachId)) return null;
        if (!m.TryGetValue("logit_client", out var k) || !Guid.TryParse(k, out var clientId)) return null;
        Guid? link = m.TryGetValue("logit_link", out var l) && Guid.TryParse(l, out var lid) ? lid : null;
        Guid? package = m.TryGetValue("logit_package", out var p) && Guid.TryParse(p, out var pid) ? pid : null;
        Guid? offer = m.TryGetValue("logit_offer", out var o) && Guid.TryParse(o, out var oid) ? oid : null;
        var s = m.TryGetValue("logit_share", out var share) && share.Length == 5 ? share : "11111";
        return new CheckoutMeta(coachId, clientId, link, package,
            new SharingDto(s[0] == '1', s[1] == '1', s[2] == '1', s[3] == '1', s[4] == '1'), offer);
    }
}

/// The rules for coach payments: starting coaching when a client pays, following Stripe's
/// events, and pausing or ending coaching when a client isn't paid up (the coach's rule).
public class CoachPaymentService(
    AppDbContext db, ICoachStripe stripe, IEmailSender email, IConfiguration config, ILogger<CoachPaymentService> log)
{
    // ── Rules ────────────────────────────────────────────────────────────────

    /// The rule for one client: their own, else the coach's default.
    public static (string Rule, int Days) EffectiveRule(CoachClientPayment p, CoachPaymentAccount? a) =>
        (p.FailRule ?? a?.FailRule ?? PaymentRules.Pause,
         p.FailDays ?? a?.FailDays ?? PaymentRules.DefaultDays);

    /// When the rule pauses or ends coaching for a client who isn't paid up; null when it
    /// never will (paid up, the rule is "keep", or payment happens outside LogIt).
    public static DateTime? ActionAt(CoachClientPayment p, CoachPaymentAccount? a)
    {
        if (p.Mode != PaymentModes.Stripe || p.UnpaidSince is not { } since) return null;
        var (rule, days) = EffectiveRule(p, a);
        return rule == PaymentRules.Keep ? null : since.AddDays(days);
    }

    // ── Paying ───────────────────────────────────────────────────────────────

    /// A finished checkout: start (or restart) coaching. Safe to call twice for the same
    /// checkout (the webhook and the success page both do). Returns the relationship, or null
    /// when the checkout isn't paid or doesn't belong to a coach on this server.
    public Task<CoachClientRelationship?> FulfillCheckoutAsync(
        string accountId, CheckoutInfo info, DateTime now, CancellationToken ct) =>
        OnceMoreIfRaced(() => FulfillCheckoutOnceAsync(accountId, info, now, ct));

    private async Task<CoachClientRelationship?> FulfillCheckoutOnceAsync(
        string accountId, CheckoutInfo info, DateTime now, CancellationToken ct)
    {
        if (!info.Paid) return null;
        var meta = CheckoutMeta.From(info.Metadata);
        if (meta is null)
        {
            log.LogWarning("Checkout {SessionId} on {Account} has no LogIt details; ignored", info.SessionId, accountId);
            return null;
        }
        var account = await db.CoachPaymentAccounts.FirstOrDefaultAsync(a => a.CoachId == meta.CoachId, ct);
        if (account?.StripeAccountId != accountId)
        {
            log.LogWarning("Checkout {SessionId} names coach {CoachId}, who doesn't own {Account}; ignored",
                info.SessionId, meta.CoachId, accountId);
            return null;
        }

        var rel = await db.CoachClientRelationships.Include(r => r.Payment)
            .FirstOrDefaultAsync(r => r.CoachId == meta.CoachId && r.ClientId == meta.ClientId, ct);
        if (rel?.Payment?.StripeCheckoutSessionId == info.SessionId) return rel; // already done

        if (rel is null)
        {
            rel = new CoachClientRelationship { CoachId = meta.CoachId, ClientId = meta.ClientId };
            db.CoachClientRelationships.Add(rel);
        }
        if (rel.Status != CoachClientStatus.Active)
        {
            // Paid links start coaching straight away: the client paid, so there's no Accept step.
            rel.Status = CoachClientStatus.Active;
            rel.RequestedByClient = true;
            rel.InviteLinkId = meta.LinkId ?? rel.InviteLinkId;
            rel.ApplySharing(meta.Sharing);
            rel.UpdatedAt = now;
        }

        var package = meta.PackageId is { } pid
            ? await db.CoachPackages.FirstOrDefaultAsync(p => p.Id == pid && p.CoachId == meta.CoachId, ct)
            : null;
        var monthly = info.SubscriptionId is not null;

        var payment = rel.Payment;
        if (payment is null)
        {
            payment = new CoachClientPayment { Relationship = rel, CreatedAt = now };
            db.CoachClientPayments.Add(payment);
        }
        else if (payment.StripeSubscriptionId is { } old && old != info.SubscriptionId && payment.State != PaymentStates.Ended)
        {
            // Paid again on a new link while an older plan still runs: don't charge twice.
            await TryCancelNow(accountId, old, ct);
        }

        payment.Mode = PaymentModes.Stripe;
        payment.PackageId = package?.Id;
        payment.PackageName = package?.Name ?? payment.PackageName;
        payment.AmountCents = package?.AmountCents ?? info.AmountTotal;
        payment.Currency = info.Currency;
        payment.Interval = monthly ? PaymentIntervals.Month : PaymentIntervals.Once;
        payment.StripeCheckoutSessionId = info.SessionId;
        payment.StripeSubscriptionId = info.SubscriptionId;
        payment.StripeCustomerId = info.CustomerId;
        payment.State = PaymentStates.Paid;
        payment.UnpaidSince = null;
        payment.StopsAtPeriodEnd = false;
        payment.PausedForPayment = false;
        payment.CoachEmailedAt = null;
        payment.UpdatedAt = now;
        if (monthly)
        {
            DateTime? end = null;
            try { end = (await stripe.GetSubscriptionAsync(accountId, info.SubscriptionId!, ct)).PeriodEnd; }
            catch (Exception ex) { log.LogWarning("Couldn't read subscription {Sub}: {Reason}", info.SubscriptionId, ex.Message); }
            payment.PaidUntil = end ?? now.AddMonths(1);
        }
        else
        {
            payment.PaidUntil = now.AddDays(7 * (package?.Weeks ?? 4));
            // Monthly receipts come from invoice.paid; a one-off payment has no invoice.
            await AddReceipt(meta.CoachId, rel.Id, info.SessionId, info.AmountTotal, info.Currency, now, ct);
        }

        if (meta.OfferId is { } offerId)
        {
            // Paying took the spot, even if the offer ran out meanwhile (canvas C2: a little late
            // is still hers). The request becomes coaching; other coaches end (one at a time).
            var offer = await db.CoachOffers.FirstOrDefaultAsync(o => o.Id == offerId && o.RelationshipId == rel.Id, ct);
            if (offer is not null && offer.State != OfferStates.Taken)
            {
                offer.State = OfferStates.Taken;
                offer.ClosedAt = now;
                rel.RequestStage = null;
                var client = await db.Users.FirstAsync(u => u.Id == meta.ClientId, ct);
                CoachIntake.Post(db, rel, meta.ClientId, CoachIntake.Events.Joined,
                    $"{CoachIntake.NameOf(client)} paid and took the spot. Coaching has started.", new { offerId }, null, now);
            }
            await SwitchCoachesAsync(meta.ClientId, meta.CoachId, now, ct);
        }

        await db.SaveChangesAsync(ct);
        log.LogInformation("Coach {CoachId} got a paid client {ClientId} ({Interval})", meta.CoachId, meta.ClientId, payment.Interval);
        await EmailCoachPaid(account, rel, payment, meta.LinkId, ct);
        return rel;
    }

    /// A monthly payment went through: paid up again, and a pause from the rule is lifted.
    public Task InvoicePaidAsync(
        string accountId, string subscriptionId, string invoiceId, long amountPaid, string currency,
        DateTime? periodEnd, DateTime now, CancellationToken ct) =>
        OnceMoreIfRaced(async () =>
        {
            await InvoicePaidOnceAsync(accountId, subscriptionId, invoiceId, amountPaid, currency, periodEnd, now, ct);
            return true;
        });

    private async Task InvoicePaidOnceAsync(
        string accountId, string subscriptionId, string invoiceId, long amountPaid, string currency,
        DateTime? periodEnd, DateTime now, CancellationToken ct)
    {
        var account = await db.CoachPaymentAccounts.AsNoTracking().FirstOrDefaultAsync(a => a.StripeAccountId == accountId, ct);
        if (account is null) return;
        var payment = await FindBySubscription(account, subscriptionId, ct);
        if (amountPaid > 0)
            await AddReceipt(account.CoachId, payment?.RelationshipId, invoiceId, amountPaid, currency, now, ct);
        if (payment is not null)
        {
            payment.State = PaymentStates.Paid;
            payment.PaidUntil = periodEnd ?? payment.PaidUntil;
            payment.UnpaidSince = null;
            payment.CoachEmailedAt = null;
            payment.UpdatedAt = now;
            Resume(payment, now);
        }
        await db.SaveChangesAsync(ct);
    }

    /// A monthly payment failed. Stripe retries the card; the coach's rule counts from now.
    /// `attempt` is Stripe's try number for this invoice: the client is emailed on the first.
    public async Task InvoiceFailedAsync(string accountId, string subscriptionId, DateTime now, CancellationToken ct, long attempt = 1)
    {
        var account = await db.CoachPaymentAccounts.AsNoTracking().FirstOrDefaultAsync(a => a.StripeAccountId == accountId, ct);
        if (account is null) return;
        var payment = await FindBySubscription(account, subscriptionId, ct);
        if (payment is null) return;
        payment.State = PaymentStates.Failed;
        payment.UnpaidSince ??= now;
        payment.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        await EmailCoachOnce(account, payment, now, ct);
        if (attempt <= 1)
        {
            await EmailClientFailed(account, payment, now, ct);
            // In the app too, not only by email and on My coach (decision D6, bug hunt 6.3).
            db.Notifications.Add(new Notification
            {
                UserId = payment.Relationship.ClientId,
                ActorId = payment.Relationship.CoachId,
                Type = NotificationType.CoachPaymentFailed,
            });
            await db.SaveChangesAsync(ct);
        }
    }

    /// Any change to a monthly plan (stopped, restarted, given up on by Stripe, renewed).
    public async Task SubscriptionChangedAsync(string accountId, StripeSubscriptionInfo sub, DateTime now, CancellationToken ct)
    {
        var account = await db.CoachPaymentAccounts.AsNoTracking().FirstOrDefaultAsync(a => a.StripeAccountId == accountId, ct);
        if (account is null) return;
        var payment = await FindBySubscription(account, sub.Id, ct);
        if (payment is null) return;

        payment.StopsAtPeriodEnd = sub.CancelAtPeriodEnd;
        switch (sub.Status)
        {
            case "active" or "trialing":
                if (sub.PeriodEnd is { } end) payment.PaidUntil = end;
                if (payment.State != PaymentStates.Paid)
                {
                    payment.State = PaymentStates.Paid;
                    payment.UnpaidSince = null;
                    payment.CoachEmailedAt = null;
                    Resume(payment, now);
                }
                break;
            case "past_due":
                payment.State = PaymentStates.Failed;
                payment.UnpaidSince ??= now;
                break;
            case "canceled" when payment.State == PaymentStates.Paid && payment.PaidUntil is { } paidTo && paidTo > now:
                // Cancelled with time still paid for: coaching runs to the paid-up date, and the
                // coach's rule counts from there, not from today (decision D6, bug hunt 6.4).
                // The sweeper ends it on that date.
                payment.StopsAtPeriodEnd = true;
                break;
            case "canceled" or "unpaid" or "incomplete_expired":
                payment.State = PaymentStates.Ended;
                payment.UnpaidSince ??= payment.PaidUntil is { } until && until < now ? until : now;
                break;
        }
        payment.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
    }

    // ── One coach at a time ──────────────────────────────────────────────────

    /// Taking a spot with `newCoachId` ends coaching with anyone else (canvas J1). A plan paid
    /// through LogIt stops renewing and coaching runs to the end of what was paid; otherwise it
    /// ends now. Each old coach is told in their conversation. The caller saves.
    public async Task SwitchCoachesAsync(Guid clientId, Guid newCoachId, DateTime now, CancellationToken ct)
    {
        var client = await db.Users.FirstAsync(u => u.Id == clientId, ct);
        if (client.IsSample) return;
        var others = await db.CoachClientRelationships.Include(r => r.Payment).Include(r => r.Coach)
            .Where(r => r.ClientId == clientId && r.CoachId != newCoachId && !r.Coach.IsSample
                && (r.Status == CoachClientStatus.Active || r.Status == CoachClientStatus.Paused))
            .ToListAsync(ct);
        foreach (var rel in others)
        {
            if (rel.Payment is { Mode: PaymentModes.Stripe, State: PaymentStates.Paid, PaidUntil: { } until } && until > now)
            {
                await SetStopAtPeriodEndAsync(rel, true, now, ct);
                rel.EndsAt = until;
                CoachIntake.Post(db, rel, clientId, CoachIntake.Events.Leaving,
                    $"{CoachIntake.NameOf(client)} is moving to another coach. Their plan stops renewing, and coaching ends on {until:ddd d MMM}.",
                    new { endsOnMs = CoachIntake.Ms(until) }, null, now);
            }
            else
            {
                await StopForEndAsync(rel, RefundRule.None, false, now, ct);
                rel.Status = CoachClientStatus.Revoked;
                rel.UpdatedAt = now;
                CoachIntake.Post(db, rel, clientId, CoachIntake.Events.Leaving,
                    $"{CoachIntake.NameOf(client)} moved to another coach, so coaching has ended.", null, null, now);
            }
        }
    }

    /// Coaching that was set to end on a date (the client moved to another coach) ends then.
    private async Task EndScheduledAsync(DateTime now, CancellationToken ct)
    {
        var due = await db.CoachClientRelationships.Include(r => r.Payment)
            .Where(r => r.EndsAt != null && r.EndsAt <= now
                && (r.Status == CoachClientStatus.Active || r.Status == CoachClientStatus.Paused))
            .ToListAsync(ct);
        foreach (var rel in due)
        {
            await StopForEndAsync(rel, RefundRule.None, false, now, ct);
            rel.Status = CoachClientStatus.Revoked;
            rel.UpdatedAt = now;
            log.LogInformation("Coaching {RelationshipId} ended on its date (client moved coach)", rel.Id);
        }
        if (due.Count > 0) await db.SaveChangesAsync(ct);
    }

    // ── The coach's rule, applied over time ──────────────────────────────────

    /// Run hourly: one-off packages that ran out, plans stopped at month end, and the coach's
    /// rule (pause or end coaching N days after a client stopped being paid up).
    public async Task SweepAsync(DateTime now, CancellationToken ct)
    {
        await EndScheduledAsync(now, ct);
        var rows = await db.CoachClientPayments
            .Include(p => p.Relationship)
            .Where(p => p.Relationship.Status == CoachClientStatus.Active
                && (p.UnpaidSince != null || (p.PaidUntil != null && p.PaidUntil <= now)))
            .ToListAsync(ct);
        if (rows.Count == 0) return;

        var coachIds = rows.Select(r => r.Relationship.CoachId).Distinct().ToList();
        var accounts = await db.CoachPaymentAccounts.AsNoTracking()
            .Where(a => coachIds.Contains(a.CoachId)).ToDictionaryAsync(a => a.CoachId, ct);

        foreach (var p in rows)
        {
            accounts.TryGetValue(p.Relationship.CoachId, out var account);

            if (p.Mode == PaymentModes.Elsewhere)
            {
                // Paid outside LogIt: only remind the coach; they decide.
                if (p.PaidUntil <= now) await EmailCoachOnce(account, p, now, ct);
                continue;
            }

            // A one-off package ran out, or a stopped monthly plan reached the end of its month
            // (Stripe's own event normally gets there first).
            if (p.State == PaymentStates.Paid && p.PaidUntil is { } until && until <= now
                && (p.Interval == PaymentIntervals.Once || p.StopsAtPeriodEnd))
            {
                p.State = PaymentStates.Ended;
                p.UnpaidSince = until;
                p.UpdatedAt = now;
                await EmailCoachOnce(account, p, now, ct);
            }

            if (ActionAt(p, account) is not { } at || at > now) continue;
            var (rule, _) = EffectiveRule(p, account);
            p.Relationship.Status = rule == PaymentRules.End ? CoachClientStatus.Revoked : CoachClientStatus.Paused;
            p.PausedForPayment = true;
            p.UpdatedAt = now;
            if (rule == PaymentRules.End) await StopStripePlanNow(account, p, now, ct);
            log.LogInformation("Coaching {RelationshipId} {Action} after {Days} days unpaid",
                p.RelationshipId, rule == PaymentRules.End ? "ended" : "paused", (now - p.UnpaidSince!.Value).TotalDays.ToString("0"));
        }
        await db.SaveChangesAsync(ct);
    }

    // ── Coach and client actions ─────────────────────────────────────────────

    /// The coach marks a client as paid outside LogIt up to a date. Any plan through LogIt
    /// stops at once, so nobody pays twice.
    public async Task MarkPaidElsewhereAsync(CoachClientRelationship rel, DateTime? until, DateTime now, CancellationToken ct)
    {
        var account = await db.CoachPaymentAccounts.AsNoTracking().FirstOrDefaultAsync(a => a.CoachId == rel.CoachId, ct);
        var p = rel.Payment;
        if (p is null)
        {
            p = new CoachClientPayment { Relationship = rel, CreatedAt = now };
            db.CoachClientPayments.Add(p);
        }
        else await StopStripePlanNow(account, p, now, ct);

        p.Mode = PaymentModes.Elsewhere;
        p.PackageId = null;
        p.PackageName = "";
        p.AmountCents = 0;
        p.Interval = PaymentIntervals.Once;
        p.StripeSubscriptionId = null;
        p.State = PaymentStates.Paid;
        p.PaidUntil = until;
        p.UnpaidSince = null;
        p.StopsAtPeriodEnd = false;
        p.CoachEmailedAt = null;
        p.UpdatedAt = now;
        Resume(p, now);
        await db.SaveChangesAsync(ct);
    }

    /// Stop (or un-stop) a monthly plan at the end of the month already paid for. Either side
    /// can do it. Returns false when there's no running plan to stop.
    public async Task<bool> SetStopAtPeriodEndAsync(CoachClientRelationship rel, bool stop, DateTime now, CancellationToken ct)
    {
        var p = rel.Payment;
        if (p is not { Mode: PaymentModes.Stripe, StripeSubscriptionId: not null } || p.State == PaymentStates.Ended) return false;
        var account = await db.CoachPaymentAccounts.AsNoTracking().FirstOrDefaultAsync(a => a.CoachId == rel.CoachId, ct);
        if (account?.StripeAccountId is null) return false;
        await stripe.SetCancelAtPeriodEndAsync(account.StripeAccountId, p.StripeSubscriptionId, stop, ct);
        p.StopsAtPeriodEnd = stop;
        p.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        return true;
    }

    /// Coaching ended (either side left, or the coach removed the client): stop charging.
    public Task CoachingEndedAsync(CoachClientRelationship rel, DateTime now, CancellationToken ct) =>
        StopForEndAsync(rel, RefundRule.None, strict: false, now, ct);

    /// Coaching ends: the plan through LogIt stops now and, following `refund`, money goes back
    /// to the client's card (by default the days paid for but not used). `strict` turns a Stripe error into a
    /// CoachingPaymentException instead of a log line, for callers that must not go on when the
    /// money side didn't happen (deleting an account). Safe to run again after a failure: a
    /// stopped plan isn't stopped twice and a refund is never made twice.
    public async Task<EndMoney> StopForEndAsync(
        CoachClientRelationship rel, RefundRule refund, bool strict, DateTime now, CancellationToken ct)
    {
        var p = rel.Payment ?? await db.CoachClientPayments.FirstOrDefaultAsync(x => x.RelationshipId == rel.Id, ct);
        if (p is null) return EndMoney.None;
        var account = await db.CoachPaymentAccounts.AsNoTracking().FirstOrDefaultAsync(a => a.CoachId == rel.CoachId, ct);
        var paidUntil = p.PaidUntil;
        await StopStripePlanNow(account, p, now, ct, strict);
        // Saved before the refund, so a refund that fails leaves the plan recorded as stopped.
        await db.SaveChangesAsync(ct);

        if (refund.Kind == RefundKind.None || p.Mode != PaymentModes.Stripe || account?.StripeAccountId is not { } acct
            || !stripe.Configured)
            return EndMoney.None;
        var money = await RefundAsync(acct, rel, refund, paidUntil, now, strict, ct);
        await db.SaveChangesAsync(ct);
        return money;
    }

    /// The share of the last payment for the time left: paid on `paidAt` for the time up to
    /// `paidUntil`, ending at `now`. Rounded down to the cent, never more than was paid.
    public static long UnusedShare(long amountCents, DateTime paidAt, DateTime paidUntil, DateTime now)
    {
        if (amountCents <= 0 || paidUntil <= paidAt || now >= paidUntil) return 0;
        if (now <= paidAt) return amountCents;
        var left = (decimal)(paidUntil - now).Ticks / (paidUntil - paidAt).Ticks;
        return Math.Clamp((long)Math.Floor(amountCents * left), 0, amountCents);
    }

    /// The payment a refund would come from: the client's latest one through LogIt.
    public Task<CoachPaymentReceipt?> LastPaymentAsync(Guid relationshipId, CancellationToken ct) =>
        db.CoachPaymentReceipts.AsNoTracking()
            .Where(r => r.RelationshipId == relationshipId && r.AmountCents > 0)
            .OrderByDescending(r => r.PaidAt)
            .FirstOrDefaultAsync(ct);

    /// How much a rule gives back from `paid` (covering up to `paidUntil`), never more than it.
    public static long RefundAmount(RefundRule rule, CoachPaymentReceipt paid, DateTime? paidUntil, DateTime now) => rule.Kind switch
    {
        RefundKind.Unused => paidUntil is { } until ? UnusedShare(paid.AmountCents, paid.PaidAt, until, now) : 0,
        RefundKind.Full => paid.AmountCents,
        RefundKind.Exact => Math.Clamp(rule.Cents, 0, paid.AmountCents),
        _ => 0,
    };

    private async Task<EndMoney> RefundAsync(
        string accountId, CoachClientRelationship rel, RefundRule rule, DateTime? paidUntil, DateTime now, bool strict, CancellationToken ct)
    {
        var paid = await LastPaymentAsync(rel.Id, ct);
        if (paid is null) return EndMoney.None;
        // The refund is recorded as a negative receipt keyed on the payment it came from, so
        // "paid to you" counts it and a second run finds it.
        var key = RefundKey(paid.ExternalId);
        if (await db.CoachPaymentReceipts.AnyAsync(r => r.ExternalId == key, ct)) return EndMoney.None;
        var cents = RefundAmount(rule, paid, paidUntil, now);
        if (cents <= 0) return EndMoney.None;
        try
        {
            var refund = await stripe.RefundAsync(accountId, paid.ExternalId, cents, key, ct);
            db.CoachPaymentReceipts.Add(new CoachPaymentReceipt
            {
                CoachId = rel.CoachId,
                RelationshipId = rel.Id,
                ExternalId = key,
                AmountCents = -cents,
                Currency = paid.Currency,
                PaidAt = now,
            });
            return new EndMoney(cents, paid.Currency, refund.Status);
        }
        catch (Exception ex) when (ex is not CoachingPaymentException)
        {
            if (strict) throw new CoachingPaymentException($"Stripe couldn't refund {paid.ExternalId}: {ex.Message}", ex);
            log.LogWarning("Couldn't refund {Payment} on {Account}: {Reason}", paid.ExternalId, accountId, ex.Message);
            return new EndMoney(0, paid.Currency, "failed");
        }
    }

    internal static string RefundKey(string paymentRef) => "refund:" + paymentRef;

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static void Resume(CoachClientPayment p, DateTime now)
    {
        if (!p.PausedForPayment) return;
        p.PausedForPayment = false;
        if (p.Relationship is { Status: CoachClientStatus.Paused } rel)
        {
            rel.Status = CoachClientStatus.Active;
            // UpdatedAt is "client since"; a pause doesn't restart it.
        }
    }

    private Task<CoachClientPayment?> FindBySubscription(CoachPaymentAccount account, string subscriptionId, CancellationToken ct) =>
        db.CoachClientPayments.Include(p => p.Relationship)
            .FirstOrDefaultAsync(p => p.StripeSubscriptionId == subscriptionId && p.Relationship.CoachId == account.CoachId, ct);

    private async Task StopStripePlanNow(
        CoachPaymentAccount? account, CoachClientPayment p, DateTime now, CancellationToken ct, bool strict = false)
    {
        if (p.Mode != PaymentModes.Stripe || p.StripeSubscriptionId is null || p.State == PaymentStates.Ended) return;
        if (account?.StripeAccountId is { } acct)
        {
            // Without a Stripe key on this server nothing here can reach the plan (it can only be
            // stopped in the coach's own Stripe dashboard), so waiting for it would never end.
            if (strict && stripe.Configured) await CancelNowOrThrow(acct, p.StripeSubscriptionId, ct);
            else await TryCancelNow(acct, p.StripeSubscriptionId, ct);
        }
        p.State = PaymentStates.Ended;
        p.UnpaidSince ??= now;
        p.UpdatedAt = now;
    }

    private async Task TryCancelNow(string accountId, string subscriptionId, CancellationToken ct)
    {
        try { await stripe.CancelNowAsync(accountId, subscriptionId, ct); }
        catch (Exception ex)
        {
            // Already cancelled in Stripe, or Stripe is down: log it so it can be checked by hand.
            log.LogWarning("Couldn't cancel subscription {Sub} on {Account}: {Reason}", subscriptionId, accountId, ex.Message);
        }
    }

    /// Cancel, or throw if Stripe can't. A plan Stripe already shows as cancelled counts as done,
    /// so a retry after a half-finished run goes through.
    private async Task CancelNowOrThrow(string accountId, string subscriptionId, CancellationToken ct)
    {
        try { await stripe.CancelNowAsync(accountId, subscriptionId, ct); }
        catch (Exception ex)
        {
            try
            {
                var sub = await stripe.GetSubscriptionAsync(accountId, subscriptionId, ct);
                if (sub.Status is "canceled" or "incomplete_expired") return;
            }
            catch (Exception) { /* Stripe unreachable: report the first error */ }
            throw new CoachingPaymentException($"Stripe couldn't stop {subscriptionId}: {ex.Message}", ex);
        }
    }

    /// Stripe sends invoice.paid and checkout.session.completed within a second, and the
    /// client's return to the link page confirms the same checkout: their check-then-insert rows
    /// (the relationship, the receipt) can collide on a unique key. Running once more sees the
    /// other's rows and takes the "already done" path instead of answering 500.
    private async Task<T> OnceMoreIfRaced<T>(Func<Task<T>> work)
    {
        try { return await work(); }
        catch (DbUpdateException ex) when (IsDuplicate(ex))
        {
            db.ChangeTracker.Clear();
            return await work();
        }
    }

    internal static bool IsDuplicate(DbUpdateException ex) => ex.InnerException switch
    {
        Microsoft.Data.Sqlite.SqliteException { SqliteErrorCode: 19 } => true, // constraint
        Npgsql.PostgresException { SqlState: "23505" } => true, // unique_violation
        _ => false,
    };

    private async Task AddReceipt(Guid coachId, Guid? relId, string externalId, long amount, string currency, DateTime paidAt, CancellationToken ct)
    {
        if (await db.CoachPaymentReceipts.AnyAsync(r => r.ExternalId == externalId, ct)) return;
        if (db.ChangeTracker.Entries<CoachPaymentReceipt>().Any(e => e.Entity.ExternalId == externalId)) return;
        db.CoachPaymentReceipts.Add(new CoachPaymentReceipt
        {
            CoachId = coachId, RelationshipId = relId, ExternalId = externalId,
            AmountCents = amount, Currency = currency, PaidAt = paidAt,
        });
    }

    /// The client's own copy of a failed payment, with a link that opens Stripe's billing page
    /// to change the card. Always sent: the client can't fix what they don't know about.
    private async Task EmailClientFailed(CoachPaymentAccount account, CoachClientPayment p, DateTime now, CancellationToken ct)
    {
        var secret = config["Jwt:Secret"];
        var origin = config["Web:Origin"];
        if (!email.IsConfigured || string.IsNullOrEmpty(secret) || string.IsNullOrEmpty(origin)) return;
        var rel = p.Relationship ?? await db.CoachClientRelationships.FirstAsync(r => r.Id == p.RelationshipId, ct);
        var coach = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == rel.CoachId, ct);
        var client = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == rel.ClientId, ct);
        if (coach is null || client is null || string.IsNullOrWhiteSpace(client.Email)) return;
        var link = PaymentFixLinks.Url(origin, PaymentFixLinks.Create(p.Id, now + PaymentFixLinks.Lifetime, secret));
        var (subject, body) = PaymentEmails.ForClientFailed(NameOf(coach), NameOf(client), p, account, now, link);
        try { await email.SendAsync(client.Email, subject, body); }
        catch (Exception ex) { log.LogWarning("Couldn't email client {ClientId} about a failed payment: {Reason}", client.Id, ex.Message); }
    }

    /// Tell the coach someone paid (the same setting as the failed-payment emails).
    private async Task EmailCoachPaid(CoachPaymentAccount account, CoachClientRelationship rel, CoachClientPayment p, Guid? linkId, CancellationToken ct)
    {
        if (!account.EmailOnFail || !email.IsConfigured) return;
        var coach = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == rel.CoachId, ct);
        var client = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == rel.ClientId, ct);
        if (coach is null || client is null) return;
        var linkName = linkId is { } id
            ? await db.CoachInviteLinks.AsNoTracking().Where(l => l.Id == id).Select(l => l.Name).FirstOrDefaultAsync(ct)
            : null;
        var clientUrl = config["Web:Origin"] is { Length: > 0 } origin ? $"{origin.TrimEnd('/')}/clients/{client.Id}?tab=programs" : null;
        var (subject, body) = PaymentEmails.ForCoachPaid(NameOf(client), client.Username, p, linkName, clientUrl);
        try { await email.SendAsync(coach.Email, subject, body); }
        catch (Exception ex) { log.LogWarning("Couldn't email coach {CoachId} about a new payment: {Reason}", coach.Id, ex.Message); }
    }

    private static string NameOf(User u) => string.IsNullOrWhiteSpace(u.DisplayName) ? u.Username : u.DisplayName;

    private async Task EmailCoachOnce(CoachPaymentAccount? account, CoachClientPayment p, DateTime now, CancellationToken ct)
    {
        if (p.CoachEmailedAt is not null) return;
        p.CoachEmailedAt = now;
        await db.SaveChangesAsync(ct);
        if (account is { EmailOnFail: false } || !email.IsConfigured) return;

        var rel = p.Relationship ?? await db.CoachClientRelationships.FirstAsync(r => r.Id == p.RelationshipId, ct);
        var coach = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == rel.CoachId, ct);
        var client = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == rel.ClientId, ct);
        if (coach is null || client is null) return;
        var name = string.IsNullOrWhiteSpace(client.DisplayName) ? client.Username : client.DisplayName;
        var (subject, body) = PaymentEmails.ForCoach(name, p, account, now);
        try { await email.SendAsync(coach.Email, subject, body); }
        catch (Exception ex) { log.LogWarning("Couldn't email coach {CoachId} about a payment: {Reason}", coach.Id, ex.Message); }
    }
}

public enum RefundKind { None, Unused, Full, Exact }

/// How much goes back when coaching ends: nothing, the days paid for but not used, the last
/// payment in full, or an exact amount (capped at what was paid).
public record RefundRule(RefundKind Kind, long Cents = 0)
{
    public static readonly RefundRule None = new(RefundKind.None);
    public static readonly RefundRule Unused = new(RefundKind.Unused);
    public static readonly RefundRule Full = new(RefundKind.Full);
    public static RefundRule Exact(long cents) => new(RefundKind.Exact, cents);
}

/// What ending coaching did with money: how much went back to the client's card and Stripe's
/// status for that refund ("succeeded", "pending", or "failed" when it couldn't be made).
public record EndMoney(long RefundedCents, string Currency, string? RefundStatus)
{
    public static readonly EndMoney None = new(0, "eur", null);
}

/// Stripe didn't do what ending coaching needed (stop a plan, make a refund). Only thrown in
/// strict mode; the message is for logs, not for people.
public class CoachingPaymentException(string message, Exception inner) : Exception(message, inner);

public static class PaymentEmails
{
    public static (string Subject, string Body) ForClientFailed(
        string coach, string client, CoachClientPayment p, CoachPaymentAccount? a, DateTime now, string fixUrl)
    {
        var then = CoachPaymentService.ActionAt(p, a);
        var (rule, _) = CoachPaymentService.EffectiveRule(p, a);
        var what = then is { } t
            ? $"If it isn't sorted by {t:d MMM}, coaching with {coach} {(rule == PaymentRules.End ? "ends" : "pauses until it is")}. "
            : "";
        return ($"Your payment to {coach} didn't go through",
            $"Hi {client},\n\n" +
            $"Your card was declined when we tried to take {Money(p.AmountCents, p.Currency)} for {p.PackageName} with {coach} ({now:d MMM}).\n\n" +
            $"Update your card here. It opens Stripe's secure page and takes the payment straight away:\n{fixUrl}\n\n" +
            $"{what}Your own workouts and data in LogIt aren't affected either way.\n\n" +
            "Stripe will also try the card again over the next few days, so if you've already sorted it with your bank there's nothing to do.\n\n" +
            $"Questions about the plan? Message {coach} in the LogIt app.\n\n" +
            $"LogIt · You get this because you pay {coach} through LogIt. Stop paying any time in My coach.");
    }

    public static (string Subject, string Body) ForCoachPaid(
        string client, string username, CoachClientPayment p, string? linkName, string? clientUrl)
    {
        var via = string.IsNullOrWhiteSpace(linkName) ? "" : $" through your {linkName} link";
        var renews = p.Interval == PaymentIntervals.Month
            ? $" It renews monthly; the next payment is on {p.PaidUntil:d MMM}."
            : $" Their package runs until {p.PaidUntil:d MMM}.";
        return ($"{client} paid for {p.PackageName}",
            $"{client} (@{username}) paid {Money(p.AmountCents, p.Currency)} for {p.PackageName}{via}.{renews}\n\n" +
            "They're on your client list now." + (clientUrl is null ? "" : $" Give them a program:\n{clientUrl}") + "\n\n" +
            "The money goes to your Stripe account as usual. Stripe sends its own receipt.\n\n" +
            "LogIt · Turn these off in Coaching › Payments › Packages and settings.");
    }

    internal static string Money(long cents, string currency)
    {
        var symbol = currency.ToLowerInvariant() switch { "eur" => "€", "gbp" => "£", "usd" => "$", _ => "" };
        var amount = cents % 100 == 0 ? (cents / 100).ToString() : (cents / 100m).ToString("0.00");
        return symbol.Length > 0 ? symbol + amount : $"{amount} {currency.ToUpperInvariant()}";
    }

    public static (string Subject, string Body) ForCoach(string client, CoachClientPayment p, CoachPaymentAccount? a, DateTime now)
    {
        var then = CoachPaymentService.ActionAt(p, a);
        var (rule, _) = CoachPaymentService.EffectiveRule(p, a);
        var next = then is { } t
            ? $"Your rule: coaching {(rule == PaymentRules.End ? "ends" : "pauses")} on {t:d MMM} if it's still unpaid."
            : "Your rule for this client is to keep coaching, so nothing changes for them.";

        if (p.Mode == PaymentModes.Elsewhere)
            return ($"{client}'s payment is due",
                $"You marked {client} as paid outside LogIt up to {p.PaidUntil:d MMM}. That date has passed.\n\n" +
                "Mark them paid again in Coaching › Payments when they pay, or switch them to a package.");
        if (p.State == PaymentStates.Failed)
            return ($"{client}'s payment didn't go through",
                $"{client}'s payment for {p.PackageName} failed. Stripe tries the card again over the next few days.\n\n{next}\n\n" +
                "See Coaching › Payments in LogIt.");
        return ($"{client}'s {p.PackageName} has ended",
            $"{client}'s {p.PackageName} ran out on {p.UnpaidSince:d MMM}.\n\n{next}\n\n" +
            "Send them a new link, or mark them paid elsewhere, in Coaching › Payments.");
    }
}
