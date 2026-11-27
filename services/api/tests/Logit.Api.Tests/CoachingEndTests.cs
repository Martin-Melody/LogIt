using System.Net.Http.Json;
using System.Net;
using System.Text;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Coach;
using Logit.Api.Features.Coach.Payments;
using Logit.Api.Features.Email;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging.Abstractions;

namespace Logit.Api.Tests;

/// Ending coaching, above all when an account is deleted: the plan in Stripe must stop (or the
/// deletion waits), a coach's clients get their unused days back, and the other side is told.
public class CoachingEndTests : IAsyncLifetime
{
    private const string Acct = "acct_coach";
    private static readonly DateTime T0 = new(2026, 11, 1, 12, 0, 0, DateTimeKind.Utc);
    // Paid on T0 for 30 days; ten days in, two thirds are left.
    private static readonly DateTime Now = T0.AddDays(10);

    private SqliteConnection _conn = null!;
    private AppDbContext _db = null!;
    private readonly FakeCoachStripe _stripe = new();
    private readonly FakeEmailSender _email = new();
    private CoachingEnd _end = null!;
    private User _coach = null!, _client = null!;
    private CoachClientRelationship _rel = null!;

    public async Task InitializeAsync()
    {
        _conn = new SqliteConnection("Data Source=:memory:");
        _conn.Open();
        _db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_conn).Options);
        await _db.Database.EnsureCreatedAsync();
        _coach = new User { Username = "coach", Email = "coach@example.com", DisplayName = "Sam", PasswordHash = "x", Tier = UserTier.Studio };
        _client = new User { Username = "aoife", Email = "aoife@example.com", DisplayName = "Aoife", PasswordHash = "x" };
        _db.Users.AddRange(_coach, _client);
        _db.CoachPaymentAccounts.Add(new CoachPaymentAccount { CoachId = _coach.Id, StripeAccountId = Acct, CardPaymentsActive = true });
        _rel = new CoachClientRelationship { CoachId = _coach.Id, ClientId = _client.Id, Status = CoachClientStatus.Active };
        _db.CoachClientRelationships.Add(_rel);
        _db.CoachClientPayments.Add(new CoachClientPayment
        {
            Relationship = _rel, Mode = PaymentModes.Stripe, PackageName = "Monthly coaching", AmountCents = 9000,
            Interval = PaymentIntervals.Month, StripeSubscriptionId = "sub_1", State = PaymentStates.Paid, PaidUntil = T0.AddDays(30),
        });
        _db.CoachPaymentReceipts.Add(new CoachPaymentReceipt
        {
            CoachId = _coach.Id, RelationshipId = _rel.Id, ExternalId = "in_1", AmountCents = 9000, Currency = "eur", PaidAt = T0,
        });
        await _db.SaveChangesAsync();
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>()).Build();
        var payments = new CoachPaymentService(_db, _stripe, _email, config, NullLogger<CoachPaymentService>.Instance);
        _end = new CoachingEnd(_db, payments, _email, NullLogger<CoachingEnd>.Instance);
    }

    public async Task DisposeAsync()
    {
        await _db.DisposeAsync();
        await _conn.DisposeAsync();
    }

    private async Task<CoachClientRelationship> Rel()
    {
        _db.ChangeTracker.Clear();
        return await _db.CoachClientRelationships.Include(r => r.Payment).SingleAsync(r => r.Id == _rel.Id);
    }

    [Fact]
    public async Task A_coach_closing_their_account_stops_the_plan_and_refunds_the_days_left()
    {
        var stuck = await _end.EndAllForAccountAsync(_coach, AccountRefunds.Unused, null, Now, default);

        Assert.Empty(stuck);
        Assert.Equal(["sub_1"], _stripe.Cancelled);
        // 20 of 30 days left of €90.
        Assert.Equal([("in_1", 6000L, "refund:in_1")], _stripe.Refunds);
        var rel = await Rel();
        Assert.Equal(CoachClientStatus.Revoked, rel.Status);
        Assert.Equal(PaymentStates.Ended, rel.Payment!.State);
        // "Paid to you" counts the refund.
        Assert.Equal(3000, await _db.CoachPaymentReceipts.SumAsync(r => r.AmountCents));
        var (to, subject, body) = Assert.Single(_email.Sent);
        Assert.Equal("aoife@example.com", to);
        Assert.Equal("Sam closed their LogIt account", subject);
        Assert.Contains("€60 has been refunded", body);
    }

    [Fact]
    public async Task A_coach_can_close_without_refunding()
    {
        Assert.Empty(await _end.EndAllForAccountAsync(_coach, new AccountRefunds(RefundRule.None), null, Now, default));
        Assert.Equal(["sub_1"], _stripe.Cancelled);
        Assert.Empty(_stripe.Refunds);
        Assert.DoesNotContain("refunded", Assert.Single(_email.Sent).Body);
    }

    [Fact]
    public async Task A_coach_can_refund_last_payments_in_full_or_choose_per_client_with_a_message()
    {
        var full = await _end.EndAllForAccountAsync(_coach, new AccountRefunds(RefundRule.Full), "Closing up shop. Thank you!", Now, default);
        Assert.Empty(full);
        Assert.Equal(9000, Assert.Single(_stripe.Refunds).Cents);
        var body = Assert.Single(_email.Sent).Body;
        Assert.Contains("Sam wrote:\n\n\"Closing up shop. Thank you!\"", body);
        Assert.Contains("€90 has been refunded", body);
    }

    [Fact]
    public async Task A_per_client_amount_overrides_the_rule_and_is_capped_at_what_was_paid()
    {
        var refunds = new AccountRefunds(RefundRule.None, new Dictionary<Guid, long> { [_rel.Id] = 50_000 });
        Assert.Empty(await _end.EndAllForAccountAsync(_coach, refunds, null, Now, default));
        Assert.Equal(9000, Assert.Single(_stripe.Refunds).Cents);
    }

    [Fact]
    public async Task The_preview_lists_clients_with_what_they_paid_and_the_unused_share()
    {
        var asCoach = await _end.PreviewAsync(_coach.Id, Now, default);
        var row = Assert.Single(asCoach.Clients);
        Assert.Equal(("Aoife", "paid", 9000L, 6000L), (row.Name, row.State, row.LastPaidCents, row.UnusedCents));
        Assert.Empty(asCoach.Coaches);

        var asClient = await _end.PreviewAsync(_client.Id, Now, default);
        Assert.Equal("Sam", Assert.Single(asClient.Coaches).Name);
        Assert.Empty(asClient.Clients);
    }

    [Fact]
    public async Task A_client_closing_their_account_stops_the_plan_without_a_refund_and_tells_the_coach()
    {
        Assert.Empty(await _end.EndAllForAccountAsync(_client, AccountRefunds.Unused, null, Now, default));

        Assert.Equal(["sub_1"], _stripe.Cancelled);
        Assert.Empty(_stripe.Refunds);
        var (to, subject, _) = Assert.Single(_email.Sent);
        Assert.Equal("coach@example.com", to);
        Assert.Equal("Aoife closed their LogIt account", subject);
    }

    [Fact]
    public async Task When_Stripe_cant_stop_a_plan_nothing_ends_and_a_retry_finishes()
    {
        _stripe.CancelFails = true;
        Assert.Equal(["Aoife"], await _end.EndAllForAccountAsync(_coach, AccountRefunds.Unused, null, Now, default));
        var rel = await Rel();
        Assert.Equal(CoachClientStatus.Active, rel.Status);
        Assert.Equal(PaymentStates.Paid, rel.Payment!.State);
        Assert.Empty(_email.Sent);

        _stripe.CancelFails = false;
        Assert.Empty(await _end.EndAllForAccountAsync(_coach, AccountRefunds.Unused, null, Now, default));
        Assert.Equal(CoachClientStatus.Revoked, (await Rel()).Status);
        Assert.Single(_stripe.Refunds);
    }

    [Fact]
    public async Task A_plan_Stripe_already_cancelled_counts_as_stopped()
    {
        _stripe.CancelFails = true;
        _stripe.SubscriptionStatus = "canceled";
        Assert.Empty(await _end.EndAllForAccountAsync(_client, AccountRefunds.Unused, null, Now, default));
        Assert.Equal(CoachClientStatus.Revoked, (await Rel()).Status);
    }

    [Fact]
    public async Task A_refund_that_fails_holds_the_deletion_but_the_plan_stays_stopped_and_is_refunded_once()
    {
        _stripe.RefundFails = true;
        Assert.Equal(["Aoife"], await _end.EndAllForAccountAsync(_coach, AccountRefunds.Unused, null, Now, default));
        var rel = await Rel();
        Assert.Equal(CoachClientStatus.Active, rel.Status);
        Assert.Equal(PaymentStates.Ended, rel.Payment!.State); // the plan did stop
        Assert.Equal(["sub_1"], _stripe.Cancelled);

        _stripe.RefundFails = false;
        Assert.Empty(await _end.EndAllForAccountAsync(_coach, AccountRefunds.Unused, null, Now, default));
        Assert.Single(_stripe.Cancelled); // not stopped twice
        Assert.Single(_stripe.Refunds);

        // Ending again (a stray second request) refunds nothing more.
        var payments = new CoachPaymentService(_db, _stripe, _email, new ConfigurationBuilder().Build(), NullLogger<CoachPaymentService>.Instance);
        await payments.StopForEndAsync(await Rel(), RefundRule.Unused, strict: true, Now, default);
        Assert.Single(_stripe.Refunds);
    }

    [Fact]
    public async Task Without_Stripe_on_the_server_an_account_can_still_be_deleted()
    {
        // Nothing here could ever stop the plan, so waiting for Stripe would be a dead end.
        _stripe.Configured = false;
        _stripe.CancelFails = true;
        Assert.Empty(await _end.EndAllForAccountAsync(_coach, AccountRefunds.Unused, null, Now, default));
        Assert.Equal(CoachClientStatus.Revoked, (await Rel()).Status);
        Assert.Empty(_stripe.Refunds);
    }

    [Fact]
    public async Task A_request_that_never_started_ends_quietly()
    {
        var other = new User { Username = "niamh", Email = "niamh@example.com", PasswordHash = "x" };
        _db.Users.Add(other);
        _db.CoachClientRelationships.Add(new CoachClientRelationship
        {
            CoachId = _coach.Id, ClientId = other.Id, Status = CoachClientStatus.Pending, RequestedByClient = true,
        });
        await _db.SaveChangesAsync();

        Assert.Empty(await _end.EndAllForAccountAsync(_coach, AccountRefunds.Unused, null, Now, default));

        Assert.Equal(0, await _db.CoachClientRelationships.CountAsync(r => r.Status != CoachClientStatus.Revoked));
        Assert.DoesNotContain(_email.Sent, e => e.To == "niamh@example.com");
    }

    [Theory]
    [InlineData(9000, 0, 30, 10, 6000)]    // two thirds left
    [InlineData(9000, 0, 30, 30, 0)]       // over
    [InlineData(9000, 0, 30, 40, 0)]       // long over
    [InlineData(9000, 0, 30, -1, 9000)]    // ended before it began: all of it
    [InlineData(10000, 0, 3, 1, 6666)]     // rounded down to the cent
    [InlineData(0, 0, 30, 10, 0)]
    public void The_unused_share_is_the_time_left_of_what_was_paid(long cents, int paidDay, int untilDay, int nowDay, long expected) =>
        Assert.Equal(expected, CoachPaymentService.UnusedShare(cents, T0.AddDays(paidDay), T0.AddDays(untilDay), T0.AddDays(nowDay)));
}

/// The same through the real endpoint: deleting an account with a paying client.
public class DeleteAccountWithClientsTests
{
    [Fact]
    public async Task Deleting_waits_until_Stripe_has_stopped_every_plan()
    {
        var stripe = new FakeCoachStripe();
        var email = new FakeEmailSender();
        await using var api = new ApiFactory
        {
            ConfigureTestServices = s =>
            {
                s.RemoveAll<ICoachStripe>();
                s.AddSingleton<ICoachStripe>(stripe);
                s.RemoveAll<IEmailSender>();
                s.AddSingleton<IEmailSender>(email);
            },
        };
        var (coach, coachId, _) = await api.SignUpAsync("closing_coach", UserTier.Studio);
        var (_, clientId, _) = await api.SignUpAsync("paying_client");
        var now = DateTime.UtcNow;
        await api.WithDbAsync(async db =>
        {
            db.CoachPaymentAccounts.Add(new CoachPaymentAccount { CoachId = coachId, StripeAccountId = "acct_x", CardPaymentsActive = true });
            var rel = new CoachClientRelationship { CoachId = coachId, ClientId = clientId, Status = CoachClientStatus.Active };
            db.CoachClientRelationships.Add(rel);
            db.CoachClientPayments.Add(new CoachClientPayment
            {
                Relationship = rel, Mode = PaymentModes.Stripe, PackageName = "Monthly", AmountCents = 8000,
                StripeSubscriptionId = "sub_x", State = PaymentStates.Paid, PaidUntil = now.AddDays(20),
            });
            db.CoachPaymentReceipts.Add(new CoachPaymentReceipt
            {
                CoachId = coachId, RelationshipId = rel.Id, ExternalId = "in_x", AmountCents = 8000, PaidAt = now.AddDays(-10),
            });
            await db.SaveChangesAsync();
        });

        HttpRequestMessage Delete() => new(HttpMethod.Delete, "/auth/account")
        {
            Content = new StringContent("{\"password\":\"Passw0rd!long\"}", Encoding.UTF8, "application/json"),
        };

        var preview = await coach.GetFromJsonAsync<System.Text.Json.JsonElement>("/auth/account/coaching");
        var client = preview.GetProperty("clients")[0];
        Assert.Equal("paying_client", client.GetProperty("name").GetString());
        Assert.Equal(8000, client.GetProperty("lastPaidCents").GetInt64());

        stripe.CancelFails = true;
        var refused = await coach.SendAsync(Delete());
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Contains("paying_client", await refused.Content.ReadAsStringAsync());
        Assert.True(await api.WithDbAsync(db => db.Users.AnyAsync(u => u.Id == coachId)));

        stripe.CancelFails = false;
        Assert.Equal(HttpStatusCode.NoContent, (await coach.SendAsync(Delete())).StatusCode);
        Assert.False(await api.WithDbAsync(db => db.Users.AnyAsync(u => u.Id == coachId)));
        Assert.Equal(["sub_x"], stripe.Cancelled);
        var refund = Assert.Single(stripe.Refunds);
        Assert.InRange(refund.Cents, 5300, 5334); // about two thirds of €80
        Assert.Contains(email.Sent, e => e.To == "paying_client@example.com" && e.Subject == "closing_coach closed their LogIt account");
    }
}
