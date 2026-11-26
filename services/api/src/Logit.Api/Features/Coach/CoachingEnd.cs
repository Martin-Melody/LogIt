using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Coach.Payments;
using Logit.Api.Features.Email;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Coach;

/// Why coaching ended. Every way out goes through CoachingEnd, so the rules (stop the plan,
/// refund or not, tell the other side) live in one place.
public enum EndReason
{
    /// The coach ended it (or withdrew an invite, or declined a request).
    CoachEnded,
    /// The client stopped (or withdrew a request).
    ClientStopped,
    /// One of the two deleted their account.
    AccountClosed,
}

/// What a closing coach gives back: one rule for everyone, and per-client amounts that
/// override it (keyed by relationship id).
public record AccountRefunds(RefundRule Default, IReadOnlyDictionary<Guid, long>? PerClient = null)
{
    public static readonly AccountRefunds Unused = new(RefundRule.Unused);

    public RefundRule For(Guid relationshipId) =>
        PerClient is not null && PerClient.TryGetValue(relationshipId, out var cents) ? RefundRule.Exact(cents) : Default;
}

/// One client of a closing coach, for the "Delete your account" screen (K5, K16).
public record ClosingClientDto(
    Guid RelationshipId, string Name, string Username, string State, string Currency,
    long LastPaidCents, long? LastPaidAtMs, long? PaidUntilMs, long UnusedCents);

/// One coach of a closing client (K6).
public record ClosingCoachDto(Guid RelationshipId, string Name, string Username, string State, long? PaidUntilMs);

public record ClosingPreviewDto(long NowMs, List<ClosingClientDto> Clients, List<ClosingCoachDto> Coaches);

/// Ending coaching: the relationship is closed (Revoked, never deleted, so its history stays)
/// and the money side follows (CoachPaymentService.StopForEndAsync).
public class CoachingEnd(
    AppDbContext db, CoachPaymentService payments, IEmailSender email, ILogger<CoachingEnd> log)
{
    private static readonly CoachClientStatus[] Live =
        [CoachClientStatus.Active, CoachClientStatus.Pending, CoachClientStatus.Paused];

    /// End one relationship now, giving back what `refund` says. `strict` throws
    /// CoachingPaymentException when Stripe can't do its part, and then the relationship stays
    /// as it was.
    public async Task<EndMoney> EndAsync(
        CoachClientRelationship rel, EndReason reason, RefundRule refund, DateTime now, CancellationToken ct,
        bool strict = false)
    {
        var money = await payments.StopForEndAsync(rel, refund, strict, now, ct);
        rel.Status = CoachClientStatus.Revoked;
        rel.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        log.LogInformation("Coaching {Rel} ended ({Reason}); refunded {Cents}", rel.Id, reason, money.RefundedCents);
        return money;
    }

    /// What deleting this account would end: the people it coaches (with what each paid and
    /// the unused share) and the coaches it has. Requests that never started aren't listed.
    public async Task<ClosingPreviewDto> PreviewAsync(Guid userId, DateTime now, CancellationToken ct)
    {
        var rels = await LiveRelationships(userId).Where(r => r.Status != CoachClientStatus.Pending).ToListAsync(ct);
        var clients = new List<ClosingClientDto>();
        var coaches = new List<ClosingCoachDto>();
        foreach (var rel in rels.OrderBy(r => NameOf(r.CoachId == userId ? r.Client : r.Coach)))
        {
            var p = rel.Payment;
            if (rel.ClientId == userId)
            {
                coaches.Add(new ClosingCoachDto(rel.Id, NameOf(rel.Coach), rel.Coach.Username, StateOf(p), Ms(p?.PaidUntil)));
                continue;
            }
            if (rel.Client.IsSample) continue;
            var paid = p is { Mode: PaymentModes.Stripe } ? await payments.LastPaymentAsync(rel.Id, ct) : null;
            var unused = paid is null ? 0 : CoachPaymentService.RefundAmount(RefundRule.Unused, paid, p!.PaidUntil, now);
            clients.Add(new ClosingClientDto(
                rel.Id, NameOf(rel.Client), rel.Client.Username, StateOf(p), paid?.Currency ?? p?.Currency ?? "eur",
                paid?.AmountCents ?? 0, Ms(paid?.PaidAt), Ms(p?.PaidUntil), unused));
        }
        return new ClosingPreviewDto(Ms(now)!.Value, clients, coaches);
    }

    /// Before an account is deleted: end all its coaching, as coach and as client. A closing
    /// coach's clients get back what `refunds` says, and `message` (if any) goes in the email
    /// that tells them. Returns the names of the people whose payments Stripe couldn't stop or
    /// refund; the account must not be deleted while that list has anyone in it (it would
    /// leave them being charged). Running it again picks up where it stopped.
    public async Task<List<string>> EndAllForAccountAsync(
        User user, AccountRefunds refunds, string? message, DateTime now, CancellationToken ct)
    {
        var rels = await LiveRelationships(user.Id).ToListAsync(ct);
        var problems = new List<string>();
        var note = string.IsNullOrWhiteSpace(message) ? null : message.Trim();
        foreach (var rel in rels)
        {
            var asCoach = rel.CoachId == user.Id;
            var other = asCoach ? rel.Client : rel.Coach;
            // A request or invite that never started has nothing to stop, refund or announce.
            var started = rel.Status != CoachClientStatus.Pending;
            var refund = asCoach && started ? refunds.For(rel.Id) : RefundRule.None;
            try
            {
                var money = await EndAsync(rel, EndReason.AccountClosed, refund, now, ct, strict: true);
                if (started && !other.IsSample) await TellOtherSideAsync(user, other, asCoach, money, asCoach ? note : null);
            }
            catch (CoachingPaymentException ex)
            {
                log.LogWarning("Account {User} can't be deleted yet: {Reason}", user.Id, ex.Message);
                problems.Add(NameOf(other));
            }
        }
        return problems;
    }

    private IQueryable<CoachClientRelationship> LiveRelationships(Guid userId) =>
        db.CoachClientRelationships
            .Include(r => r.Payment)
            .Include(r => r.Coach)
            .Include(r => r.Client)
            .Where(r => (r.CoachId == userId || r.ClientId == userId) && Live.Contains(r.Status));

    /// "paid" (paying through LogIt and paid up), "failed" (a card payment failed),
    /// "unpaid" (through LogIt, nothing paid for now), "elsewhere", or "none" (no payment).
    private static string StateOf(CoachClientPayment? p) => p switch
    {
        null => "none",
        { Mode: PaymentModes.Elsewhere } => "elsewhere",
        { State: PaymentStates.Failed } => "failed",
        { State: PaymentStates.Paid } => "paid",
        _ => "unpaid",
    };

    private static long? Ms(DateTime? d) =>
        d is { } v ? new DateTimeOffset(DateTime.SpecifyKind(v, DateTimeKind.Utc)).ToUnixTimeMilliseconds() : null;

    private async Task TellOtherSideAsync(User closed, User other, bool closedWasCoach, EndMoney money, string? note)
    {
        if (!email.IsConfigured || string.IsNullOrWhiteSpace(other.Email)) return;
        var (subject, body) = closedWasCoach
            ? EndEmails.ForClientWhenCoachClosed(NameOf(closed), NameOf(other), money, note)
            : EndEmails.ForCoachWhenClientClosed(NameOf(closed), NameOf(other));
        try { await email.SendAsync(other.Email, subject, body); }
        catch (Exception ex) { log.LogWarning("Couldn't email {User} that coaching ended: {Reason}", other.Id, ex.Message); }
    }

    internal static string NameOf(User u) => string.IsNullOrWhiteSpace(u.DisplayName) ? u.Username : u.DisplayName;
}

public static class EndEmails
{
    public static (string Subject, string Body) ForClientWhenCoachClosed(string coach, string client, EndMoney money, string? note = null)
    {
        var said = note is null ? "" : $"{coach} wrote:\n\n\"{note}\"\n\n";
        var refund = money.RefundedCents > 0
            ? $"{PaymentEmails.Money(money.RefundedCents, money.Currency)} has been refunded to your card. Stripe sends its own email about the refund.\n\n"
            : "";
        return ($"{coach} closed their LogIt account",
            $"Hi {client},\n\n" +
            $"{coach} has closed their LogIt account, so your coaching with them has ended. Any plan you had with {coach} through LogIt is stopped and you won't be charged again.\n\n" +
            said +
            refund +
            "Your program, meal plan and history stay in your LogIt app.\n\n" +
            "LogIt");
    }

    public static (string Subject, string Body) ForCoachWhenClientClosed(string client, string coach) =>
        ($"{client} closed their LogIt account",
            $"Hi {coach},\n\n" +
            $"{client} has closed their LogIt account, so your coaching with them has ended. Any plan they had with you through LogIt is stopped, so they won't be charged again.\n\n" +
            "Their data was deleted with their account.\n\n" +
            "LogIt");
}
