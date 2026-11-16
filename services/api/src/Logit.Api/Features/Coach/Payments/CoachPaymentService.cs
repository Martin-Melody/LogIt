using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Email;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Coach.Payments;

/// What a checkout carries in its metadata, so the webhook (or the success page) can start
/// coaching without anything stored before the client paid.
public record CheckoutMeta(Guid CoachId, Guid ClientId, Guid? LinkId, Guid? PackageId, SharingDto Sharing)
{
    public Dictionary<string, string> ToMetadata() => new()
    {
        ["logit_coach"] = CoachId.ToString(),
        ["logit_client"] = ClientId.ToString(),
        ["logit_link"] = LinkId?.ToString() ?? "",
        ["logit_package"] = PackageId?.ToString() ?? "",
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
        var s = m.TryGetValue("logit_share", out var share) && share.Length == 5 ? share : "11111";
        return new CheckoutMeta(coachId, clientId, link, package,
            new SharingDto(s[0] == '1', s[1] == '1', s[2] == '1', s[3] == '1', s[4] == '1'));
    }
}

/// The rules for coach payments: starting coaching when a client pays, following Stripe's
/// events, and pausing or ending coaching when a client isn't paid up (the coach's rule).
public class CoachPaymentService(
    AppDbContext db, ICoachStripe stripe, IEmailSender email, ILogger<CoachPaymentService> log)
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
    public async Task<CoachClientRelationship?> FulfillCheckoutAsync(
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

        await db.SaveChangesAsync(ct);
        log.LogInformation("Coach {CoachId} got a paid client {ClientId} ({Interval})", meta.CoachId, meta.ClientId, payment.Interval);
        return rel;
    }

    /// A monthly payment went through: paid up again, and a pause from the rule is lifted.
    public async Task InvoicePaidAsync(
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
    public async Task InvoiceFailedAsync(string accountId, string subscriptionId, DateTime now, CancellationToken ct)
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
            case "canceled" or "unpaid" or "incomplete_expired":
                payment.State = PaymentStates.Ended;
                payment.UnpaidSince ??= payment.PaidUntil is { } until && until < now ? until : now;
                break;
        }
        payment.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
    }

    // ── The coach's rule, applied over time ──────────────────────────────────

    /// Run hourly: one-off packages that ran out, plans stopped at month end, and the coach's
    /// rule (pause or end coaching N days after a client stopped being paid up).
    public async Task SweepAsync(DateTime now, CancellationToken ct)
    {
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
    public async Task CoachingEndedAsync(CoachClientRelationship rel, DateTime now, CancellationToken ct)
    {
        var p = rel.Payment ?? await db.CoachClientPayments.FirstOrDefaultAsync(x => x.RelationshipId == rel.Id, ct);
        if (p is null) return;
        var account = await db.CoachPaymentAccounts.AsNoTracking().FirstOrDefaultAsync(a => a.CoachId == rel.CoachId, ct);
        await StopStripePlanNow(account, p, now, ct);
        await db.SaveChangesAsync(ct);
    }

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

    private async Task StopStripePlanNow(CoachPaymentAccount? account, CoachClientPayment p, DateTime now, CancellationToken ct)
    {
        if (p.Mode != PaymentModes.Stripe || p.StripeSubscriptionId is null || p.State == PaymentStates.Ended) return;
        if (account?.StripeAccountId is { } acct) await TryCancelNow(acct, p.StripeSubscriptionId, ct);
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

public static class PaymentEmails
{
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
