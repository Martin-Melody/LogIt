using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Coach;
using Logit.Api.Features.Coach.Payments;
using Logit.Api.Features.Email;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace Logit.Api.Tests;

public class CoachPaymentTests : IAsyncLifetime
{
    private const string Acct = "acct_coach";
    private static readonly DateTime T0 = new(2026, 11, 1, 12, 0, 0, DateTimeKind.Utc);

    private SqliteConnection _conn = null!;
    private AppDbContext _db = null!;
    private readonly FakeStripe _stripe = new();
    private readonly FakeEmail _email = new();
    private CoachPaymentService _svc = null!;
    private User _coach = null!, _client = null!;
    private CoachPackage _monthly = null!, _block = null!;

    public async Task InitializeAsync()
    {
        _conn = new SqliteConnection("Data Source=:memory:");
        _conn.Open();
        _db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_conn).Options);
        await _db.Database.EnsureCreatedAsync();
        _coach = new User { Username = "coach", Email = "coach@example.com", DisplayName = "Alex", PasswordHash = "x", Tier = UserTier.Studio };
        _client = new User { Username = "sarah", Email = "sarah@example.com", DisplayName = "Sarah", PasswordHash = "x" };
        _db.Users.AddRange(_coach, _client);
        _db.CoachPaymentAccounts.Add(new CoachPaymentAccount { CoachId = _coach.Id, StripeAccountId = Acct, CardPaymentsActive = true });
        _monthly = new CoachPackage { CoachId = _coach.Id, Name = "Online coaching", AmountCents = 12000, Interval = PaymentIntervals.Month };
        _block = new CoachPackage { CoachId = _coach.Id, Name = "12-week block", AmountCents = 30000, Interval = PaymentIntervals.Once, Weeks = 12 };
        _db.CoachPackages.AddRange(_monthly, _block);
        await _db.SaveChangesAsync();
        _svc = new CoachPaymentService(_db, _stripe, _email, NullLogger<CoachPaymentService>.Instance);
    }

    public async Task DisposeAsync()
    {
        await _db.DisposeAsync();
        await _conn.DisposeAsync();
    }

    private CheckoutInfo Checkout(CoachPackage package, string session = "cs_1", string? sub = "sub_1", bool paid = true,
        SharingDto? sharing = null, Guid? coachId = null) =>
        new(session, paid, package.Interval == PaymentIntervals.Month ? sub : null, "cus_1", package.AmountCents, "eur",
            new CheckoutMeta(coachId ?? _coach.Id, _client.Id, null, package.Id, sharing ?? SharingDto.All).ToMetadata());

    private async Task<CoachClientRelationship> Rel() =>
        await _db.CoachClientRelationships.Include(r => r.Payment).AsNoTracking().SingleAsync();

    [Fact]
    public void Checkout_details_survive_stripe_metadata()
    {
        var meta = new CheckoutMeta(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), null, new SharingDto(true, false, true, false, true));
        var back = CheckoutMeta.From(meta.ToMetadata());
        Assert.Equal(meta, back);
        Assert.Null(CheckoutMeta.From(new Dictionary<string, string>()));
    }

    [Fact]
    public async Task Paying_starts_coaching_at_once_and_counts_once()
    {
        _stripe.PeriodEnd = T0.AddMonths(1);
        var info = Checkout(_monthly, sharing: new SharingDto(true, false, true, true, true));
        await _svc.FulfillCheckoutAsync(Acct, info, T0, default);
        await _svc.FulfillCheckoutAsync(Acct, info, T0, default); // webhook and success page both arrive

        var rel = await Rel();
        Assert.Equal(CoachClientStatus.Active, rel.Status);
        Assert.False(rel.ShareNutrition);
        Assert.Equal(PaymentStates.Paid, rel.Payment!.State);
        Assert.Equal("Online coaching", rel.Payment.PackageName);
        Assert.Equal(T0.AddMonths(1), rel.Payment.PaidUntil);
        Assert.Equal("sub_1", rel.Payment.StripeSubscriptionId);
        // Monthly receipts come from invoice.paid, so the checkout adds none.
        Assert.Equal(0, await _db.CoachPaymentReceipts.CountAsync());
        await _svc.InvoicePaidAsync(Acct, "sub_1", "in_1", 12000, "eur", T0.AddMonths(1), T0, default);
        await _svc.InvoicePaidAsync(Acct, "sub_1", "in_1", 12000, "eur", T0.AddMonths(1), T0, default);
        Assert.Equal(1, await _db.CoachPaymentReceipts.CountAsync());
    }

    [Fact]
    public async Task Unpaid_or_foreign_checkouts_are_ignored()
    {
        Assert.Null(await _svc.FulfillCheckoutAsync(Acct, Checkout(_monthly, paid: false), T0, default));
        // A checkout naming this coach but paid on someone else's account.
        Assert.Null(await _svc.FulfillCheckoutAsync("acct_other", Checkout(_monthly), T0, default));
        Assert.Equal(0, await _db.CoachClientRelationships.CountAsync());
    }

    [Fact]
    public async Task Failed_payment_pauses_after_the_coachs_days_and_paying_resumes()
    {
        await _svc.FulfillCheckoutAsync(Acct, Checkout(_monthly), T0, default);
        await _svc.InvoiceFailedAsync(Acct, "sub_1", T0.AddDays(30), default);
        Assert.Equal(PaymentStates.Failed, (await Rel()).Payment!.State);
        Assert.Single(_email.Sent); // the coach hears about it once
        await _svc.InvoiceFailedAsync(Acct, "sub_1", T0.AddDays(33), default); // Stripe's retry fails too
        Assert.Single(_email.Sent);

        await _svc.SweepAsync(T0.AddDays(36), default); // 6 days unpaid: default rule is 7
        Assert.Equal(CoachClientStatus.Active, (await Rel()).Status);
        await _svc.SweepAsync(T0.AddDays(37.1), default);
        var paused = await Rel();
        Assert.Equal(CoachClientStatus.Paused, paused.Status);
        Assert.True(paused.Payment!.PausedForPayment);

        await _svc.InvoicePaidAsync(Acct, "sub_1", "in_2", 12000, "eur", T0.AddDays(68), T0.AddDays(38), default);
        var back = await Rel();
        Assert.Equal(CoachClientStatus.Active, back.Status);
        Assert.Null(back.Payment!.UnpaidSince);
        Assert.Equal(PaymentStates.Paid, back.Payment.State);
    }

    [Theory]
    [InlineData(PaymentRules.Keep, CoachClientStatus.Active, false)]
    [InlineData(PaymentRules.Pause, CoachClientStatus.Paused, false)]
    [InlineData(PaymentRules.End, CoachClientStatus.Revoked, true)]
    public async Task The_coachs_rule_decides(string rule, CoachClientStatus expected, bool cancelsPlan)
    {
        var account = await _db.CoachPaymentAccounts.SingleAsync();
        account.FailRule = rule;
        account.FailDays = 3;
        await _db.SaveChangesAsync();
        await _svc.FulfillCheckoutAsync(Acct, Checkout(_monthly), T0, default);
        await _svc.InvoiceFailedAsync(Acct, "sub_1", T0.AddDays(30), default);

        await _svc.SweepAsync(T0.AddDays(40), default);
        Assert.Equal(expected, (await Rel()).Status);
        Assert.Equal(cancelsPlan, _stripe.Cancelled.Contains("sub_1"));
    }

    [Fact]
    public async Task A_clients_own_rule_beats_the_default()
    {
        await _svc.FulfillCheckoutAsync(Acct, Checkout(_monthly), T0, default);
        var p = await _db.CoachClientPayments.SingleAsync();
        p.FailRule = PaymentRules.Keep;
        await _db.SaveChangesAsync();
        await _svc.InvoiceFailedAsync(Acct, "sub_1", T0.AddDays(30), default);
        await _svc.SweepAsync(T0.AddDays(90), default);
        Assert.Equal(CoachClientStatus.Active, (await Rel()).Status);
        Assert.Null(CoachPaymentService.ActionAt((await Rel()).Payment!, await _db.CoachPaymentAccounts.SingleAsync()));
    }

    [Fact]
    public async Task A_one_off_package_runs_out_then_the_rule_applies()
    {
        await _svc.FulfillCheckoutAsync(Acct, Checkout(_block, session: "cs_block"), T0, default);
        var rel = await Rel();
        Assert.Equal(T0.AddDays(84), rel.Payment!.PaidUntil);
        Assert.Equal(1, await _db.CoachPaymentReceipts.CountAsync()); // one-off: the receipt is the checkout

        await _svc.SweepAsync(T0.AddDays(84.5), default);
        rel = await Rel();
        Assert.Equal(PaymentStates.Ended, rel.Payment!.State);
        Assert.Equal(T0.AddDays(84), rel.Payment.UnpaidSince);
        Assert.Equal(CoachClientStatus.Active, rel.Status);
        Assert.Single(_email.Sent);

        await _svc.SweepAsync(T0.AddDays(91.5), default);
        Assert.Equal(CoachClientStatus.Paused, (await Rel()).Status);

        // Buying it again restarts coaching.
        await _svc.FulfillCheckoutAsync(Acct, Checkout(_block, session: "cs_block_2"), T0.AddDays(92), default);
        Assert.Equal(CoachClientStatus.Active, (await Rel()).Status);
    }

    [Fact]
    public async Task Paid_elsewhere_stops_the_stripe_plan_and_lifts_a_pause()
    {
        await _svc.FulfillCheckoutAsync(Acct, Checkout(_monthly), T0, default);
        await _svc.InvoiceFailedAsync(Acct, "sub_1", T0.AddDays(30), default);
        await _svc.SweepAsync(T0.AddDays(40), default);
        Assert.Equal(CoachClientStatus.Paused, (await Rel()).Status);

        var rel = await _db.CoachClientRelationships.Include(r => r.Payment).SingleAsync();
        await _svc.MarkPaidElsewhereAsync(rel, T0.AddDays(70), T0.AddDays(41), default);
        var after = await Rel();
        Assert.Equal(CoachClientStatus.Active, after.Status);
        Assert.Equal(PaymentModes.Elsewhere, after.Payment!.Mode);
        Assert.Contains("sub_1", _stripe.Cancelled);

        // Past the date: the coach is reminded, nothing is paused.
        await _svc.SweepAsync(T0.AddDays(80), default);
        Assert.Equal(CoachClientStatus.Active, (await Rel()).Status);
    }

    [Fact]
    public async Task Stopping_a_plan_ends_it_at_month_end()
    {
        _stripe.PeriodEnd = T0.AddMonths(1);
        await _svc.FulfillCheckoutAsync(Acct, Checkout(_monthly), T0, default);
        var rel = await _db.CoachClientRelationships.Include(r => r.Payment).SingleAsync();
        Assert.True(await _svc.SetStopAtPeriodEndAsync(rel, true, T0.AddDays(5), default));
        Assert.Contains(("sub_1", true), _stripe.StopAtEnd);

        // Stripe ends the subscription at the end of the month.
        await _svc.SubscriptionChangedAsync(Acct, new StripeSubscriptionInfo("sub_1", "canceled", false, T0.AddMonths(1)), T0.AddMonths(1), default);
        var p = (await Rel()).Payment!;
        Assert.Equal(PaymentStates.Ended, p.State);
        Assert.Equal(T0.AddMonths(1), p.UnpaidSince);
    }

    [Fact]
    public async Task Leaving_coaching_cancels_the_plan()
    {
        await _svc.FulfillCheckoutAsync(Acct, Checkout(_monthly), T0, default);
        var rel = await _db.CoachClientRelationships.Include(r => r.Payment).SingleAsync();
        rel.Status = CoachClientStatus.Revoked;
        await _db.SaveChangesAsync();
        await _svc.CoachingEndedAsync(rel, T0.AddDays(3), default);
        Assert.Contains("sub_1", _stripe.Cancelled);
        Assert.Equal(PaymentStates.Ended, (await Rel()).Payment!.State);
    }

    private class FakeStripe : ICoachStripe
    {
        public DateTime? PeriodEnd { get; set; }
        public List<string> Cancelled { get; } = [];
        public List<(string, bool)> StopAtEnd { get; } = [];
        public bool Configured => true;
        public Task<string> CreateAccountAsync(string email, string displayName, string country, CancellationToken ct) => Task.FromResult("acct_new");
        public Task<string> OnboardingLinkAsync(string accountId, string returnUrl, string refreshUrl, CancellationToken ct) => Task.FromResult("https://connect.stripe.test");
        public Task<ConnectAccountStatus> GetAccountAsync(string accountId, CancellationToken ct) => Task.FromResult(new ConnectAccountStatus(true, false, "Alex", "eur"));
        public Task<CheckoutStart> CreateCheckoutAsync(CheckoutStartRequest req, CancellationToken ct) => Task.FromResult(new CheckoutStart("cs_new", "https://checkout.stripe.test"));
        public Task<CheckoutInfo> GetCheckoutAsync(string accountId, string sessionId, CancellationToken ct) => throw new NotSupportedException();
        public Task<StripeSubscriptionInfo> GetSubscriptionAsync(string accountId, string subscriptionId, CancellationToken ct) =>
            Task.FromResult(new StripeSubscriptionInfo(subscriptionId, "active", false, PeriodEnd));
        public Task SetCancelAtPeriodEndAsync(string accountId, string subscriptionId, bool cancel, CancellationToken ct)
        {
            StopAtEnd.Add((subscriptionId, cancel));
            return Task.CompletedTask;
        }
        public Task CancelNowAsync(string accountId, string subscriptionId, CancellationToken ct)
        {
            Cancelled.Add(subscriptionId);
            return Task.CompletedTask;
        }
    }

    private class FakeEmail : IEmailSender
    {
        public List<(string To, string Subject)> Sent { get; } = [];
        public bool IsConfigured => true;
        public Task SendAsync(string toAddress, string subject, string textBody)
        {
            Sent.Add((toAddress, subject));
            return Task.CompletedTask;
        }
    }
}
