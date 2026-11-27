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

/// Taking a spot (canvas J1, J2, K9): the agreement, 18+ to pay, checkout for an offer with a
/// later first charge, and one coach at a time.
public class OfferTakeTests
{
    private static readonly Dictionary<string, string> Answers = new()
    {
        ["goal"] = "Strength", ["experience"] = "3+ years", ["days"] = "3", ["food"] = "No",
    };

    private sealed record World(ApiFactory Api, FakeCoachStripe Stripe, HttpClient Coach, Guid CoachId, HttpClient Client, Guid ClientId, Guid RelId) : IAsyncDisposable
    {
        public ValueTask DisposeAsync() => Api.DisposeAsync();
    }

    private static async Task<World> AskedAsync(string tag)
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
        var (coach, coachId, coachName) = await api.SignUpAsync($"coach_{tag}", UserTier.Studio);
        var (client, clientId, _) = await api.SignUpAsync($"client_{tag}");
        var asked = await Json(await client.PostAsJsonAsync($"/coach/ask/{coachName}", new { answers = Answers }));
        return new World(api, stripe, coach, coachId, client, clientId, asked.GetProperty("relationshipId").GetGuid());
    }

    private static async Task<JsonElement> Json(HttpResponseMessage res)
    {
        var text = await res.Content.ReadAsStringAsync();
        Assert.True(res.IsSuccessStatusCode, $"{(int)res.StatusCode} {text}");
        return text.Length == 0 ? default : JsonDocument.Parse(text).RootElement.Clone();
    }

    private static async Task<Guid> PaidPackageAsync(World w, string interval = "month")
    {
        var id = Guid.Empty;
        await w.Api.WithDbAsync(async db =>
        {
            var k = new CoachPackage { CoachId = w.CoachId, Name = "Monthly coaching", AmountCents = 8000, Interval = interval, Weeks = interval == "once" ? 12 : null };
            id = k.Id;
            db.CoachPackages.Add(k);
            db.CoachPaymentAccounts.Add(new CoachPaymentAccount { CoachId = w.CoachId, StripeAccountId = "acct_" + w.CoachId.ToString("N")[..8], CardPaymentsActive = true });
            await db.SaveChangesAsync();
        });
        return id;
    }

    [Fact]
    public async Task The_agreement_is_ticked_and_kept_with_the_words_agreed_to()
    {
        await using var w = await AskedAsync("agree");
        await Json(await w.Coach.PutAsJsonAsync("/coach/agreement", new { text = "1. Check in every Sunday.\n2. Cancel any time." }));
        var offerId = (await Json(await w.Coach.PostAsJsonAsync($"/coach/requests/{w.RelId}/offer", new { }))).GetProperty("offerId").GetGuid();

        var info = await Json(await w.Client.GetAsync($"/coach/offers/{offerId}"));
        Assert.StartsWith("1. Check in", info.GetProperty("agreement").GetProperty("text").GetString());

        var res = await w.Client.PostAsJsonAsync($"/coach/offers/{offerId}/take", new { });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Contains("agreement", await res.Content.ReadAsStringAsync());

        await Json(await w.Client.PostAsJsonAsync($"/coach/offers/{offerId}/take", new { agreed = true }));
        // Changing it later doesn't change what she agreed to.
        await Json(await w.Coach.PutAsJsonAsync("/coach/agreement", new { text = "New rules." }));
        var rel = await w.Api.WithDbAsync(db => db.CoachClientRelationships.SingleAsync(r => r.Id == w.RelId));
        Assert.Equal(CoachClientStatus.Active, rel.Status);
        Assert.NotNull(rel.AgreedAt);
        Assert.StartsWith("1. Check in", rel.AgreedText);
    }

    [Fact]
    public async Task Paying_for_an_offer_needs_18_plus_charges_later_when_asked_and_starts_coaching()
    {
        await using var w = await AskedAsync("pay");
        var packageId = await PaidPackageAsync(w);
        var firstCharge = DateTime.UtcNow.Date.AddDays(20);
        var offerId = (await Json(await w.Coach.PostAsJsonAsync($"/coach/requests/{w.RelId}/offer",
            new { packageId, firstChargeOn = firstCharge }))).GetProperty("offerId").GetGuid();

        // Paid offers go through checkout, not take.
        Assert.Equal(HttpStatusCode.PaymentRequired, (await w.Client.PostAsJsonAsync($"/coach/offers/{offerId}/take", new { })).StatusCode);
        var under18 = await w.Client.PostAsJsonAsync($"/coach/offers/{offerId}/checkout", new { adult = false, successUrl = "https://x/take", cancelUrl = "https://x/take" });
        Assert.Equal(HttpStatusCode.BadRequest, under18.StatusCode);
        Assert.Contains("adult", await under18.Content.ReadAsStringAsync());

        var start = await Json(await w.Client.PostAsJsonAsync($"/coach/offers/{offerId}/checkout",
            new { adult = true, successUrl = "https://x/take", cancelUrl = "https://x/take" }));
        Assert.StartsWith("https://checkout", start.GetProperty("url").GetString());
        var req = Assert.Single(w.Stripe.Checkouts);
        Assert.True(req.Monthly);
        Assert.Equal(firstCharge, req.FirstChargeAt);
        Assert.Equal(offerId.ToString(), req.Metadata["logit_offer"]);

        // The hold runs out before Stripe answers: paying still gets the spot.
        await w.Api.WithDbAsync(db => db.CoachOffers.Where(o => o.Id == offerId).ExecuteUpdateAsync(s => s.SetProperty(o => o.HoldUntil, DateTime.UtcNow.AddMinutes(-5))));
        var done = await Json(await w.Client.PostAsJsonAsync("/coach/payments/checkout/confirm", new { sessionId = "cs_new", offerId }));
        Assert.Equal("active", done.GetProperty("status").GetString());
        Assert.Equal("taken", await w.Api.WithDbAsync(db => db.CoachOffers.Where(o => o.Id == offerId).Select(o => o.State).SingleAsync()));
        var kinds = await w.Api.WithDbAsync(db => db.CoachMessages.Where(m => m.RelationshipId == w.RelId && m.Kind != null).Select(m => m.Kind).ToListAsync());
        Assert.Contains("joined", kinds);
    }

    [Fact]
    public async Task Taking_a_spot_ends_the_other_coach_at_the_end_of_what_was_paid()
    {
        await using var w = await AskedAsync("switch");
        var (_, oldCoachId, _) = await w.Api.SignUpAsync("old_coach", UserTier.Studio);
        var (_, freeCoachId, _) = await w.Api.SignUpAsync("free_coach", UserTier.Studio);
        var paidUntil = DateTime.UtcNow.AddDays(12);
        Guid paidRel = Guid.Empty, freeRel = Guid.Empty;
        await w.Api.WithDbAsync(async db =>
        {
            db.CoachPaymentAccounts.Add(new CoachPaymentAccount { CoachId = oldCoachId, StripeAccountId = "acct_old", CardPaymentsActive = true });
            var paid = new CoachClientRelationship { CoachId = oldCoachId, ClientId = w.ClientId, Status = CoachClientStatus.Active };
            var free = new CoachClientRelationship { CoachId = freeCoachId, ClientId = w.ClientId, Status = CoachClientStatus.Active };
            db.CoachClientRelationships.AddRange(paid, free);
            db.CoachClientPayments.Add(new CoachClientPayment
            {
                Relationship = paid, Mode = PaymentModes.Stripe, PackageName = "Monthly", AmountCents = 7000,
                Interval = PaymentIntervals.Month, StripeSubscriptionId = "sub_old", State = PaymentStates.Paid, PaidUntil = paidUntil,
            });
            await db.SaveChangesAsync();
            (paidRel, freeRel) = (paid.Id, free.Id);
        });
        var offerId = (await Json(await w.Coach.PostAsJsonAsync($"/coach/requests/{w.RelId}/offer", new { }))).GetProperty("offerId").GetGuid();
        var info = await Json(await w.Client.GetAsync($"/coach/offers/{offerId}"));
        Assert.NotEqual(JsonValueKind.Null, info.GetProperty("otherCoach").ValueKind);

        await Json(await w.Client.PostAsJsonAsync($"/coach/offers/{offerId}/take", new { }));
        var rels = await w.Api.WithDbAsync(db => db.CoachClientRelationships.Include(r => r.Payment).Where(r => r.Id == paidRel || r.Id == freeRel).ToListAsync());
        var p = rels.Single(r => r.Id == paidRel);
        Assert.Equal(CoachClientStatus.Active, p.Status); // kept until the end of what was paid
        Assert.True(p.Payment!.StopsAtPeriodEnd);
        Assert.Equal(paidUntil, p.EndsAt!.Value, TimeSpan.FromSeconds(1));
        Assert.Equal(CoachClientStatus.Revoked, rels.Single(r => r.Id == freeRel).Status);
        Assert.True(await w.Api.WithDbAsync(db => db.CoachMessages.AnyAsync(m => m.RelationshipId == paidRel && m.Kind == "leaving")));

        // The paid month runs out: coaching with the old coach ends.
        await w.Api.WithServicesAsync(async sp => await sp.GetRequiredService<CoachPaymentService>().SweepAsync(paidUntil.AddMinutes(1), default));
        Assert.Equal(CoachClientStatus.Revoked, await w.Api.WithDbAsync(db => db.CoachClientRelationships.Where(r => r.Id == paidRel).Select(r => r.Status).SingleAsync()));
    }
}
