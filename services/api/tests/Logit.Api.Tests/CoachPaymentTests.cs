using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Coach;
using Logit.Api.Features.Coach.Payments;
using Logit.Api.Features.Email;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace Logit.Api.Tests;

public class CoachPaymentTests : IAsyncLifetime
{
    private const string Acct = "acct_coach";
    private const string Secret = "test-secret-0123456789abcdef0123456789abcdef";
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
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Secret"] = Secret,
            ["Web:Origin"] = "https://app.example.test",
        }).Build();
        _svc = new CoachPaymentService(_db, _stripe, _email, config, NullLogger<CoachPaymentService>.Instance);
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
    public async Task The_webhook_and_the_success_page_arriving_together_dont_fail()
    {
        // Seen with real Stripe: checkout.session.completed and the client's return to the link
        // page landed together; one of them failed on the relationship's unique key (500).
        _stripe.PeriodEnd = T0.AddMonths(1);
        var info = Checkout(_monthly);
        await using var other = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_conn).Options);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Jwt:Secret"] = Secret }).Build();
        var otherSvc = new CoachPaymentService(other, _stripe, _email, config, NullLogger<CoachPaymentService>.Instance);
        _stripe.Meanwhile = () => otherSvc.FulfillCheckoutAsync(Acct, info, T0, default);

        var rel = await _svc.FulfillCheckoutAsync(Acct, info, T0, default);

        Assert.NotNull(rel);
        Assert.Equal(1, await _db.CoachClientRelationships.CountAsync());
        Assert.Equal(1, await _db.CoachClientPayments.CountAsync());
    }

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
        // The coach heard about the new client, then the failure; the client got a link to fix it.
        Assert.Equal(["coach@example.com", "coach@example.com", "sarah@example.com"], _email.Sent.Select(e => e.To));
        var toClient = _email.Sent[2];
        Assert.Equal("Your payment to Alex didn't go through", toClient.Subject);
        var token = toClient.Body.Split("/pay/fix/")[1].Split('\n')[0];
        Assert.Equal((await Rel()).Payment!.Id, PaymentFixLinks.Read(token, Secret, T0.AddDays(31)));
        await _svc.InvoiceFailedAsync(Acct, "sub_1", T0.AddDays(33), default, attempt: 2); // Stripe's retry fails too
        Assert.Equal(3, _email.Sent.Count); // nobody is emailed again
        // The client is told in the app too, once (decision D6, bug hunt 6.3).
        var notes = await _db.Notifications.Where(n => n.UserId == _client.Id).ToListAsync();
        Assert.Equal([NotificationType.CoachPaymentFailed], notes.Select(n => n.Type));
        Assert.Equal(_coach.Id, notes[0].ActorId);

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
        Assert.Equal(["Sarah paid for 12-week block", "Sarah's 12-week block has ended"], _email.Sent.Select(e => e.Subject));

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
    public async Task Cancelled_before_the_paid_up_date_keeps_coaching_until_then()
    {
        // Decision D6, bug hunt 6.4: paid to the end of the month, cancelled in Stripe on day 5.
        _stripe.PeriodEnd = T0.AddMonths(1);
        await _svc.FulfillCheckoutAsync(Acct, Checkout(_monthly), T0, default);
        await _svc.SubscriptionChangedAsync(Acct, new StripeSubscriptionInfo("sub_1", "canceled", false, T0.AddMonths(1)), T0.AddDays(5), default);
        var p = (await Rel()).Payment!;
        Assert.Equal(PaymentStates.Paid, p.State);
        Assert.Null(p.UnpaidSince);

        await _svc.SweepAsync(T0.AddDays(12.1), default); // 7 days after the cancel: still paid up
        Assert.Equal(CoachClientStatus.Active, (await Rel()).Status);
        await _svc.SweepAsync(T0.AddMonths(1).AddHours(1), default);
        Assert.Equal(T0.AddMonths(1), (await Rel()).Payment!.UnpaidSince);
        await _svc.SweepAsync(T0.AddMonths(1).AddDays(7.1), default); // the coach's 7 days, from the paid-up date
        Assert.Equal(CoachClientStatus.Paused, (await Rel()).Status);
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

    [Theory]
    [InlineData(UserTier.Studio, false, "active")]
    [InlineData(UserTier.Free, false, "notlive")] // trying Studio: real, not live yet (canvas V3)
    [InlineData(UserTier.Free, true, "active")] // self-hosted servers need no plan to coach
    public async Task Paid_links_follow_who_can_coach(UserTier tier, bool selfHosted, string expected)
    {
        _coach.Tier = tier;
        var link = new CoachInviteLink { Coach = _coach, Code = "ABCD1234", Name = "Bio", PackageId = _monthly.Id };
        _db.CoachInviteLinks.Add(link);
        await _db.SaveChangesAsync();
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Deployment:SelfHosted"] = selfHosted.ToString() }).Build();
        Assert.Equal(expected, await CoachPaymentEndpoints.LinkStateFor(_db, link, config, CancellationToken.None));
    }

    [Fact]
    public void Fix_links_open_only_their_payment_until_they_expire()
    {
        var id = Guid.NewGuid();
        var token = PaymentFixLinks.Create(id, T0.AddDays(30), Secret);
        Assert.Equal(id, PaymentFixLinks.Read(token, Secret, T0.AddDays(29)));
        Assert.Null(PaymentFixLinks.Read(token, Secret, T0.AddDays(31)));             // expired
        Assert.Null(PaymentFixLinks.Read(token, "another-secret", T0));               // signed elsewhere
        Assert.Null(PaymentFixLinks.Read(token[..^2] + (token[^2] == 'A' ? "BA" : "AA"), Secret, T0)); // tampered
        Assert.Null(PaymentFixLinks.Read("not a token", Secret, T0));
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
        /// Runs once, the next time a subscription is read: lets a test land a second request
        /// in the middle of the first (the moment between its checks and its save).
        public Func<Task>? Meanwhile { get; set; }
        public async Task<StripeSubscriptionInfo> GetSubscriptionAsync(string accountId, string subscriptionId, CancellationToken ct)
        {
            if (Meanwhile is { } meanwhile) { Meanwhile = null; await meanwhile(); }
            return new StripeSubscriptionInfo(subscriptionId, "active", false, PeriodEnd);
        }
        public Task PauseCollectionAsync(string accountId, string subscriptionId, DateTime? resumesAt, CancellationToken ct) => Task.CompletedTask;
        public Task<bool> RetryUnpaidAsync(string accountId, string subscriptionId, CancellationToken ct) => Task.FromResult(true);
        public Task<string?> CustomerOfPaymentAsync(string accountId, string paymentIntentId, CancellationToken ct) => Task.FromResult<string?>(null);
        public Task ChangeMonthlyPriceAsync(string accountId, string subscriptionId, long amountCents, string currency, string productName, CancellationToken ct) => Task.CompletedTask;
        public Task SetCancelAtPeriodEndAsync(string accountId, string subscriptionId, bool cancel, CancellationToken ct)
        {
            StopAtEnd.Add((subscriptionId, cancel));
            return Task.CompletedTask;
        }
        public Task<string> CreateBillingPortalAsync(string accountId, string customerId, string returnUrl, CancellationToken ct) =>
            Task.FromResult("https://billing.stripe.test/" + customerId);
        public Task CancelNowAsync(string accountId, string subscriptionId, CancellationToken ct)
        {
            Cancelled.Add(subscriptionId);
            return Task.CompletedTask;
        }
        public Task<StripeRefund> RefundAsync(string accountId, string paymentRef, long amountCents, string idempotencyKey, CancellationToken ct) =>
            Task.FromResult(new StripeRefund("re_1", "succeeded"));
    }

    private class FakeEmail : IEmailSender
    {
        public List<(string To, string Subject, string Body)> Sent { get; } = [];
        public bool IsConfigured => true;
        public Task SendAsync(string toAddress, string subject, string textBody)
        {
            Sent.Add((toAddress, subject, textBody));
            return Task.CompletedTask;
        }
    }
}
