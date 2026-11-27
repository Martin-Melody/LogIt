using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Coach.Payments;
using Logit.Api.Features.Email;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Logit.Api.Tests;

/// Payments › Manage (canvas Q9, K14, K18, Z4, K10).
public class CoachPaymentManageTests
{
    private sealed record World(ApiFactory Api, FakeCoachStripe Stripe, HttpClient Coach, Guid CoachId, HttpClient Client, Guid ClientId, Guid RelId, Guid Monthly, Guid Block) : IAsyncDisposable
    {
        public ValueTask DisposeAsync() => Api.DisposeAsync();
    }

    private static async Task<World> PayingAsync(string tag)
    {
        var stripe = new FakeCoachStripe();
        var api = new ApiFactory
        {
            ConfigureTestServices = s =>
            {
                s.RemoveAll<ICoachStripe>();
                s.AddSingleton<ICoachStripe>(stripe);
                s.RemoveAll<IEmailSender>();
                s.AddSingleton<IEmailSender>(new FakeEmailSender());
            },
        };
        var (coach, coachId, _) = await api.SignUpAsync($"pcoach_{tag}", UserTier.Studio);
        var (client, clientId, _) = await api.SignUpAsync($"pclient_{tag}");
        Guid rel = Guid.Empty, monthly = Guid.Empty, block = Guid.Empty;
        var now = DateTime.UtcNow;
        await api.WithDbAsync(async db =>
        {
            db.CoachPaymentAccounts.Add(new CoachPaymentAccount { CoachId = coachId, StripeAccountId = "acct_" + tag, CardPaymentsActive = true });
            var m = new CoachPackage { CoachId = coachId, Name = "Monthly coaching", AmountCents = 8000, Interval = "month" };
            var m2 = new CoachPackage { CoachId = coachId, Name = "Monthly plus", AmountCents = 12000, Interval = "month" };
            var b = new CoachPackage { CoachId = coachId, Name = "12-week block", AmountCents = 20000, Interval = "once", Weeks = 12 };
            db.CoachPackages.AddRange(m, m2, b);
            var r = new CoachClientRelationship { CoachId = coachId, ClientId = clientId, Status = CoachClientStatus.Active };
            db.CoachClientRelationships.Add(r);
            db.CoachClientPayments.Add(new CoachClientPayment
            {
                Relationship = r, Mode = PaymentModes.Stripe, PackageId = m.Id, PackageName = m.Name, AmountCents = 8000,
                Interval = PaymentIntervals.Month, StripeSubscriptionId = "sub_" + tag, StripeCustomerId = "cus_pi_" + tag,
                State = PaymentStates.Paid, PaidUntil = now.AddDays(20),
            });
            db.CoachPaymentReceipts.Add(new CoachPaymentReceipt { CoachId = coachId, RelationshipId = r.Id, ExternalId = "in_" + tag, AmountCents = 8000, PaidAt = now.AddDays(-10) });
            await db.SaveChangesAsync();
            (rel, monthly, block) = (r.Id, m2.Id, b.Id);
        });
        return new World(api, stripe, coach, coachId, client, clientId, rel, monthly, block);
    }

    private static async Task<JsonElement> Json(HttpResponseMessage res)
    {
        var text = await res.Content.ReadAsStringAsync();
        Assert.True(res.IsSuccessStatusCode, $"{(int)res.StatusCode} {text}");
        return text.Length == 0 ? default : JsonDocument.Parse(text).RootElement.Clone();
    }

    [Fact]
    public async Task A_refund_only_gives_money_back_and_never_more_than_was_paid()
    {
        await using var w = await PayingAsync("refund");
        var receipt = (await Json(await w.Coach.GetAsync($"/coach/payments/clients/{w.RelId}/receipts"))).GetProperty("receipts")[0];
        var id = receipt.GetProperty("id").GetString();
        await Json(await w.Coach.PostAsJsonAsync($"/coach/payments/clients/{w.RelId}/refund", new { receiptId = id, amountCents = 2000, reason = "Missed week" }));
        Assert.Single(w.Stripe.Refunds);
        Assert.Equal(CoachClientStatus.Active, await w.Api.WithDbAsync(db => db.CoachClientRelationships.Where(r => r.Id == w.RelId).Select(r => r.Status).SingleAsync()));
        var after = (await Json(await w.Coach.GetAsync($"/coach/payments/clients/{w.RelId}/receipts"))).GetProperty("receipts")[0];
        Assert.Equal(2000, after.GetProperty("refundedCents").GetInt64());
        // 6,000 left of 8,000.
        Assert.Equal(HttpStatusCode.BadRequest, (await w.Coach.PostAsJsonAsync($"/coach/payments/clients/{w.RelId}/refund", new { receiptId = id, amountCents = 6001 })).StatusCode);
    }

    [Fact]
    public async Task Changing_to_another_monthly_package_changes_the_price_from_the_next_payment()
    {
        await using var w = await PayingAsync("monthly");
        var offerId = (await Json(await w.Coach.PostAsJsonAsync($"/coach/payments/clients/{w.RelId}/change-package", new { packageId = w.Monthly }))).GetProperty("offerId").GetGuid();
        Assert.Empty(w.Stripe.PriceChanges); // nothing until they accept
        await Json(await w.Client.PostAsync($"/coach/coaches/{w.RelId}/package-change/{offerId}/accept", null));
        Assert.Equal(12000, w.Stripe.PriceChanges["sub_monthly"]);
    }

    [Fact]
    public async Task Changing_to_a_block_stops_the_plan_then_asks_them_to_pay_it_when_the_month_ends()
    {
        await using var w = await PayingAsync("block");
        var offerId = (await Json(await w.Coach.PostAsJsonAsync($"/coach/payments/clients/{w.RelId}/change-package", new { packageId = w.Block, message = "Cheaper for you" }))).GetProperty("offerId").GetGuid();
        await Json(await w.Client.PostAsync($"/coach/coaches/{w.RelId}/package-change/{offerId}/accept", null));
        var p = await w.Api.WithDbAsync(db => db.CoachClientPayments.SingleAsync(x => x.RelationshipId == w.RelId));
        Assert.True(p.StopsAtPeriodEnd);
        Assert.Equal(w.Block, p.PendingPackageId);

        await w.Api.WithServicesAsync(sp => sp.GetRequiredService<CoachPaymentService>().SweepAsync(p.PaidUntil!.Value.AddMinutes(1), default));
        Assert.Equal(w.Block, await w.Api.WithDbAsync(db => db.CoachClientPayments.Where(x => x.RelationshipId == w.RelId).Select(x => x.PendingPayPackageId).SingleAsync()));
        Assert.True(await w.Api.WithDbAsync(db => db.CoachMessages.AnyAsync(m => m.RelationshipId == w.RelId && m.Kind == "pay-for-change")));
        var pay = await Json(await w.Client.PostAsJsonAsync($"/coach/coaches/{w.RelId}/pay-change", new { successUrl = "https://x/my-coach", cancelUrl = "https://x/my-coach" }));
        Assert.StartsWith("https://checkout", pay.GetProperty("url").GetString());
        Assert.Equal(20000, w.Stripe.Checkouts.Single().AmountCents);
    }

    [Fact]
    public async Task Stopping_payments_through_LogIt_lets_plans_run_out_then_they_pay_elsewhere()
    {
        await using var w = await PayingAsync("stopall");
        Assert.Equal(1, (await Json(await w.Coach.PostAsync("/coach/payments/stop", null))).GetProperty("plansStopped").GetInt32());
        var overview = await Json(await w.Coach.GetAsync("/coach/payments"));
        Assert.False(overview.GetProperty("account").GetProperty("ready").GetBoolean());
        var until = await w.Api.WithDbAsync(db => db.CoachClientPayments.Where(x => x.RelationshipId == w.RelId).Select(x => x.PaidUntil).SingleAsync());
        await w.Api.WithServicesAsync(sp => sp.GetRequiredService<CoachPaymentService>().SweepAsync(until!.Value.AddMinutes(1), default));
        var p = await w.Api.WithDbAsync(db => db.CoachClientPayments.Include(x => x.Relationship).SingleAsync(x => x.RelationshipId == w.RelId));
        Assert.Equal(PaymentModes.Elsewhere, p.Mode);
        Assert.Equal(CoachClientStatus.Active, p.Relationship.Status); // coaching carries on
    }

    [Fact]
    public async Task When_Stripe_fails_nothing_is_half_done_and_trying_again_works()
    {
        await using var w = await PayingAsync("stripefail");
        w.Stripe.PeriodEndFails = true;
        var offerId = (await Json(await w.Coach.PostAsJsonAsync($"/coach/payments/clients/{w.RelId}/change-package", new { packageId = w.Block }))).GetProperty("offerId").GetGuid();
        Assert.Equal(HttpStatusCode.BadGateway, (await w.Client.PostAsync($"/coach/coaches/{w.RelId}/package-change/{offerId}/accept", null)).StatusCode);
        Assert.Equal(HttpStatusCode.BadGateway, (await w.Coach.PostAsync("/coach/payments/stop", null)).StatusCode);
        var p = await w.Api.WithDbAsync(db => db.CoachClientPayments.AsNoTracking().SingleAsync(x => x.RelationshipId == w.RelId));
        Assert.Null(p.PendingPackageId);
        Assert.False(p.PendingNoPayment);
        Assert.False(await w.Api.WithDbAsync(db => db.CoachPaymentAccounts.AnyAsync(a => a.CoachId == w.CoachId && a.PaymentsStopped)));

        w.Stripe.PeriodEndFails = false;
        await Json(await w.Coach.PostAsync("/coach/payments/stop", null));
        Assert.True(await w.Api.WithDbAsync(db => db.CoachPaymentAccounts.AnyAsync(a => a.CoachId == w.CoachId && a.PaymentsStopped)));
    }

    [Fact]
    public async Task A_dispute_shows_on_Payments_and_closes_again()
    {
        await using var w = await PayingAsync("dispute");
        await w.Api.WithServicesAsync(sp => sp.GetRequiredService<CoachPaymentService>().DisputeChangedAsync("acct_dispute", "pi_dispute", true, DateTime.UtcNow, default));
        var row = (await Json(await w.Coach.GetAsync("/coach/payments"))).GetProperty("clients")[0];
        Assert.True(row.GetProperty("disputed").GetBoolean());
        await w.Api.WithServicesAsync(sp => sp.GetRequiredService<CoachPaymentService>().DisputeChangedAsync("acct_dispute", "pi_dispute", false, DateTime.UtcNow, default));
        Assert.False((await Json(await w.Coach.GetAsync("/coach/payments"))).GetProperty("clients")[0].GetProperty("disputed").GetBoolean());
    }
}
