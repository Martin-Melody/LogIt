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

/// The ways out (canvas E1, E2, M1, Z2, Z3, Z5): the coach pauses or ends, the client stops,
/// stops with a refund when the coach goes quiet, retries a payment, and blocking ends coaching.
public class CoachEndingTests
{
    private sealed record World(ApiFactory Api, FakeCoachStripe Stripe, HttpClient Coach, Guid CoachId, string CoachName,
        HttpClient Client, Guid ClientId, string ClientName, Guid RelId) : IAsyncDisposable
    {
        public ValueTask DisposeAsync() => Api.DisposeAsync();
    }

    private static async Task<World> CoachedAsync(string tag, bool paying = true)
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
        var (client, clientId, clientName) = await api.SignUpAsync($"client_{tag}");
        var relId = Guid.Empty;
        var now = DateTime.UtcNow;
        await api.WithDbAsync(async db =>
        {
            db.CoachPaymentAccounts.Add(new CoachPaymentAccount { CoachId = coachId, StripeAccountId = "acct_" + tag, CardPaymentsActive = true });
            var rel = new CoachClientRelationship { CoachId = coachId, ClientId = clientId, Status = CoachClientStatus.Active };
            db.CoachClientRelationships.Add(rel);
            if (paying)
            {
                db.CoachClientPayments.Add(new CoachClientPayment
                {
                    Relationship = rel, Mode = PaymentModes.Stripe, PackageName = "Monthly", AmountCents = 8000,
                    Interval = PaymentIntervals.Month, StripeSubscriptionId = "sub_" + tag, State = PaymentStates.Paid, PaidUntil = now.AddDays(20),
                });
                db.CoachPaymentReceipts.Add(new CoachPaymentReceipt { CoachId = coachId, RelationshipId = rel.Id, ExternalId = "in_" + tag, AmountCents = 8000, PaidAt = now.AddDays(-10) });
            }
            await db.SaveChangesAsync();
            relId = rel.Id;
        });
        return new World(api, stripe, coach, coachId, coachName, client, clientId, clientName, relId);
    }

    private static async Task<JsonElement> Json(HttpResponseMessage res)
    {
        var text = await res.Content.ReadAsStringAsync();
        Assert.True(res.IsSuccessStatusCode, $"{(int)res.StatusCode} {text}");
        return text.Length == 0 ? default : JsonDocument.Parse(text).RootElement.Clone();
    }

    private static Task<List<string?>> Kinds(World w) =>
        w.Api.WithDbAsync(db => db.CoachMessages.Where(m => m.RelationshipId == w.RelId && m.Kind != null).OrderBy(m => m.CreatedAtMs).Select(m => m.Kind).ToListAsync());

    [Fact]
    public async Task The_coach_ends_with_a_refund_a_suggestion_and_a_message()
    {
        await using var w = await CoachedAsync("end");
        var (_, _, joe) = await w.Api.SignUpAsync("joe_suggested", UserTier.Studio);
        var preview = await Json(await w.Coach.GetAsync($"/coach/clients/{w.RelId}/ending"));
        Assert.Equal(8000, preview.GetProperty("lastPayment").GetProperty("amountCents").GetInt64());
        Assert.True(preview.GetProperty("unusedCents").GetInt64() > 0);

        var ended = await Json(await w.Coach.PostAsJsonAsync($"/coach/clients/{w.RelId}/end",
            new { refund = "full", message = "So sorry, I have to stop for health reasons.", suggest = joe }));
        Assert.Equal(8000, ended.GetProperty("refundedCents").GetInt64());
        Assert.Contains("sub_end", w.Stripe.Cancelled);
        Assert.Equal(CoachClientStatus.Revoked, await w.Api.WithDbAsync(db => db.CoachClientRelationships.Where(r => r.Id == w.RelId).Select(r => r.Status).SingleAsync()));
        var card = await w.Api.WithDbAsync(db => db.CoachMessages.Where(m => m.RelationshipId == w.RelId && m.Kind == "ended").Select(m => m.CardJson).SingleAsync());
        Assert.Contains(joe, card);
    }

    [Fact]
    public async Task The_coach_pauses_payments_and_it_resumes_on_the_date()
    {
        await using var w = await CoachedAsync("pause");
        var until = DateTime.UtcNow.Date.AddDays(10);
        Assert.Equal(HttpStatusCode.NoContent, (await w.Coach.PostAsJsonAsync($"/coach/clients/{w.RelId}/pause", new { until, message = "Injured, back soon" })).StatusCode);
        Assert.Equal(until, w.Stripe.Paused["sub_pause"]);
        Assert.Contains("paused", await Kinds(w));
        // Coaching itself carries on: they're still a client.
        Assert.Single((await Json(await w.Coach.GetAsync("/coach/roster"))).GetProperty("roster").EnumerateArray());

        await w.Api.WithServicesAsync(sp => sp.GetRequiredService<CoachPaymentService>().SweepAsync(until.AddHours(1), default));
        Assert.Null(await w.Api.WithDbAsync(db => db.CoachClientRelationships.Where(r => r.Id == w.RelId).Select(r => r.PausedUntil).SingleAsync()));
        Assert.Contains("resumed", await Kinds(w));
    }

    [Fact]
    public async Task The_client_stops_and_keeps_coaching_to_the_end_of_what_was_paid()
    {
        await using var w = await CoachedAsync("stop");
        var manage = await Json(await w.Client.GetAsync($"/coach/coaches/{w.RelId}/manage"));
        Assert.Equal("Monthly", manage.GetProperty("plan").GetProperty("name").GetString());
        Assert.Equal(JsonValueKind.Null, manage.GetProperty("quiet").ValueKind);

        var stopped = await Json(await w.Client.PostAsJsonAsync($"/coach/coaches/{w.RelId}/stop", new { }));
        Assert.Equal("ending", stopped.GetProperty("status").GetString());
        var rel = await w.Api.WithDbAsync(db => db.CoachClientRelationships.Include(r => r.Payment).SingleAsync(r => r.Id == w.RelId));
        Assert.Equal(CoachClientStatus.Active, rel.Status);
        Assert.True(rel.Payment!.StopsAtPeriodEnd);
        Assert.NotNull(rel.EndsAt);

        // Paying another way: it ends now.
        await using var other = await CoachedAsync("stop2", paying: false);
        Assert.Equal("ended", (await Json(await other.Client.PostAsJsonAsync($"/coach/coaches/{other.RelId}/stop", new { }))).GetProperty("status").GetString());
    }

    [Fact]
    public async Task Away_pins_a_note_for_clients_and_holds_the_no_reply_clock_until_the_coach_is_back()
    {
        await using var w = await CoachedAsync("away");
        var asked = DateTimeOffset.UtcNow.AddDays(-8).ToUnixTimeMilliseconds();
        await Json(await w.Client.PostAsJsonAsync("/coach/messages", new { messageId = "a1", relationshipId = w.RelId, body = "Can I move Thursday?", createdAtMs = asked }));
        Assert.Equal(JsonValueKind.Object, (await Json(await w.Client.GetAsync($"/coach/coaches/{w.RelId}/manage"))).GetProperty("quiet").ValueKind);

        // Away since yesterday, back in three days.
        var from = DateTime.UtcNow.Date.AddDays(-1);
        var until = DateTime.UtcNow.Date.AddDays(3);
        Assert.Equal(HttpStatusCode.BadRequest, (await w.Coach.PutAsJsonAsync("/coach/away", new { from, until = from })).StatusCode);
        await Json(await w.Coach.PutAsJsonAsync("/coach/away", new { from, until, note = "Back on the 2nd. Keep training." }));

        var mine = (await Json(await w.Client.GetAsync("/coach/coaches")))[0].GetProperty("away");
        Assert.Equal("Back on the 2nd. Keep training.", mine.GetProperty("note").GetString());
        Assert.True(mine.GetProperty("now").GetBoolean());
        Assert.Equal(JsonValueKind.Null, (await Json(await w.Client.GetAsync($"/coach/coaches/{w.RelId}/manage"))).GetProperty("quiet").ValueKind);
        Assert.Equal(HttpStatusCode.Conflict, (await w.Client.PostAsJsonAsync($"/coach/coaches/{w.RelId}/stop", new { quiet = true })).StatusCode);
        // People who ask see when they're back.
        Assert.NotEqual(JsonValueKind.Null, (await Json(await w.Client.GetAsync($"/coach/ask/{w.CoachName}"))).GetProperty("awayUntil").ValueKind);

        // Back early: the clock counts from now, so it isn't quiet yet.
        (await w.Coach.DeleteAsync("/coach/away")).EnsureSuccessStatusCode();
        Assert.Equal(JsonValueKind.Null, (await Json(await w.Client.GetAsync("/coach/coaches")))[0].GetProperty("away").ValueKind);
        Assert.Equal(JsonValueKind.Null, (await Json(await w.Client.GetAsync($"/coach/coaches/{w.RelId}/manage"))).GetProperty("quiet").ValueKind);
    }

    [Fact]
    public async Task After_a_week_with_no_reply_the_client_can_stop_with_a_refund()
    {
        await using var w = await CoachedAsync("quiet");
        var asked = DateTimeOffset.UtcNow.AddDays(-8).ToUnixTimeMilliseconds();
        await Json(await w.Client.PostAsJsonAsync("/coach/messages", new { messageId = "q1", relationshipId = w.RelId, body = "Is the new program coming?", createdAtMs = asked }));
        // Not before it's quiet.
        await using (var fresh = await CoachedAsync("notquiet"))
            Assert.Equal(HttpStatusCode.Conflict, (await fresh.Client.PostAsJsonAsync($"/coach/coaches/{fresh.RelId}/stop", new { quiet = true })).StatusCode);

        var manage = await Json(await w.Client.GetAsync($"/coach/coaches/{w.RelId}/manage"));
        var quiet = manage.GetProperty("quiet");
        Assert.Equal(8, quiet.GetProperty("days").GetInt32());
        Assert.True(quiet.GetProperty("refundCents").GetInt64() > 0);
        // The coach sees how long they've waited.
        var row = (await Json(await w.Coach.GetAsync("/coach/roster"))).GetProperty("roster")[0];
        Assert.Equal(asked, row.GetProperty("waitingSinceMs").GetInt64());

        var done = await Json(await w.Client.PostAsJsonAsync($"/coach/coaches/{w.RelId}/stop", new { quiet = true }));
        Assert.Equal("ended", done.GetProperty("status").GetString());
        Assert.True(done.GetProperty("refundedCents").GetInt64() > 0);
        Assert.Single(w.Stripe.Refunds);
        Assert.Contains("stopped", await Kinds(w));
    }

    [Fact]
    public async Task A_new_card_retries_the_unpaid_payment_at_once()
    {
        await using var w = await CoachedAsync("card");
        await w.Api.WithDbAsync(db => db.CoachClientPayments.Where(p => p.RelationshipId == w.RelId)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.State, PaymentStates.Failed)));
        var res = await Json(await w.Client.PostAsync($"/coach/coaches/{w.RelId}/retry-payment", null));
        Assert.True(res.GetProperty("paid").GetBoolean());
        Assert.Equal(1, w.Stripe.Retries);
    }

    [Fact]
    public async Task Blocking_your_coach_ends_coaching_with_the_unused_days_refunded()
    {
        await using var w = await CoachedAsync("block");
        Assert.True((await w.Client.PostAsync($"/users/{w.CoachName}/block", null)).IsSuccessStatusCode);
        var rel = await w.Api.WithDbAsync(db => db.CoachClientRelationships.SingleAsync(r => r.Id == w.RelId));
        Assert.Equal(CoachClientStatus.Revoked, rel.Status);
        Assert.Single(w.Stripe.Refunds);
        Assert.Contains("sub_block", w.Stripe.Cancelled);
    }
}
