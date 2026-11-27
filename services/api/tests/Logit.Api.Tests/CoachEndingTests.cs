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
    public async Task A_swap_for_the_rest_of_the_program_is_a_card_the_coach_sees_on_Today()
    {
        await using var w = await CoachedAsync("swap", paying: false);
        var card = "{\"from\":\"Hack squat\",\"to\":\"Leg press\"}";
        // Each side sends only its own kinds.
        Assert.Equal(HttpStatusCode.BadRequest, (await w.Client.PostAsJsonAsync("/coach/messages", new { messageId = "s0", relationshipId = w.RelId, body = "x", createdAtMs = 1L, kind = "program-swap", cardJson = card })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await w.Client.PostAsJsonAsync("/coach/messages", new { messageId = "s0b", relationshipId = w.RelId, body = "x", createdAtMs = 1L, kind = "goal-suggestion", cardJson = card })).StatusCode);
        (await w.Coach.PostAsJsonAsync("/coach/messages", new { messageId = "g1", relationshipId = w.RelId, body = "A slower pace?", createdAtMs = 2L, kind = "goal-suggestion", cardJson = "{\"id\":\"g1\",\"goalType\":\"lose\",\"rateKgPerWeek\":0.3}" })).EnsureSuccessStatusCode();
        // Canvas K4: a coach's reply to a check-in says which one; a client can't send that kind.
        var replyCard = "{\"scheduleName\":\"Weekly check-in\",\"periodStartMs\":1,\"submissionId\":\"s1\"}";
        (await w.Coach.PostAsJsonAsync("/coach/messages", new { messageId = "cr1", relationshipId = w.RelId, body = "Great week", createdAtMs = 3L, kind = "checkin-reply", cardJson = replyCard })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.BadRequest, (await w.Client.PostAsJsonAsync("/coach/messages", new { messageId = "cr2", relationshipId = w.RelId, body = "x", createdAtMs = 4L, kind = "checkin-reply", cardJson = replyCard })).StatusCode);
        // Canvas W7: a month sent to the client; only coaches send it.
        var month = "{\"v\":1,\"month\":\"2026-11\",\"label\":\"November\",\"note\":\"Great month\",\"sections\":[]}";
        (await w.Coach.PostAsJsonAsync("/coach/messages", new { messageId = "mr1", relationshipId = w.RelId, body = "Your November: Great month", createdAtMs = 5L, kind = "month-report", cardJson = month })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.BadRequest, (await w.Client.PostAsJsonAsync("/coach/messages", new { messageId = "mr2", relationshipId = w.RelId, body = "x", createdAtMs = 6L, kind = "month-report", cardJson = month })).StatusCode);
        (await w.Client.PostAsJsonAsync("/coach/messages", new { messageId = "g2", relationshipId = w.RelId, body = "I'll keep mine.", createdAtMs = 3L, kind = "goal-answer", cardJson = "{\"id\":\"g1\",\"used\":false}" })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.BadRequest, (await w.Client.PostAsJsonAsync("/coach/messages", new { messageId = "s1", relationshipId = w.RelId, body = "x", createdAtMs = 1L, kind = "lasting-swap", cardJson = "not json" })).StatusCode);
        (await w.Client.PostAsJsonAsync("/coach/messages", new { messageId = "s2", relationshipId = w.RelId, body = "I've swapped Hack squat for Leg press for the rest of the program.", createdAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), kind = "lasting-swap", cardJson = card })).EnsureSuccessStatusCode();
        Assert.True((await Json(await w.Coach.GetAsync("/coach/roster"))).GetProperty("roster")[0].GetProperty("lastingSwap").GetBoolean());

        (await w.Coach.PostAsJsonAsync("/coach/messages", new { messageId = "s3", relationshipId = w.RelId, body = "I've put Hack squat back.", createdAtMs = DateTimeOffset.UtcNow.AddSeconds(1).ToUnixTimeMilliseconds(), kind = "program-swap", cardJson = card })).EnsureSuccessStatusCode();
        // Answered: off Today, even unread.
        Assert.False((await Json(await w.Coach.GetAsync("/coach/roster"))).GetProperty("roster")[0].GetProperty("lastingSwap").GetBoolean());
        // A newer swap is back on; reading it takes it off.
        (await w.Client.PostAsJsonAsync("/coach/messages", new { messageId = "s4", relationshipId = w.RelId, body = "Swapped again.", createdAtMs = DateTimeOffset.UtcNow.AddSeconds(2).ToUnixTimeMilliseconds(), kind = "lasting-swap", cardJson = card })).EnsureSuccessStatusCode();
        Assert.True((await Json(await w.Coach.GetAsync("/coach/roster"))).GetProperty("roster")[0].GetProperty("lastingSwap").GetBoolean());
        (await w.Coach.PostAsJsonAsync("/coach/messages/read", new { relationshipId = w.RelId, upToMs = DateTimeOffset.UtcNow.AddMinutes(1).ToUnixTimeMilliseconds() })).EnsureSuccessStatusCode();
        Assert.False((await Json(await w.Coach.GetAsync("/coach/roster"))).GetProperty("roster")[0].GetProperty("lastingSwap").GetBoolean());
    }

    [Fact]
    public async Task The_client_says_whether_they_allow_a_plugin_and_the_coach_sees_it()
    {
        await using var w = await CoachedAsync("consent", paying: false);
        var url = $"/coach/coaches/{w.RelId}/plugins";
        Assert.Equal(HttpStatusCode.BadRequest, (await w.Client.PutAsJsonAsync(url, new { pluginId = "emom", name = "EMOM timer", state = "maybe" })).StatusCode);
        // Only the client answers, for their own coaching.
        Assert.Equal(HttpStatusCode.NotFound, (await w.Coach.PutAsJsonAsync(url, new { pluginId = "emom", name = "EMOM timer", state = "allowed" })).StatusCode);
        (await w.Client.PutAsJsonAsync(url, new { pluginId = "emom", name = "EMOM timer", state = "declined" })).EnsureSuccessStatusCode();
        var row = (await Json(await w.Coach.GetAsync("/coach/roster"))).GetProperty("roster")[0];
        Assert.Equal("declined", row.GetProperty("pluginConsent").GetProperty("emom").GetProperty("state").GetString());
        (await w.Client.PutAsJsonAsync(url, new { pluginId = "emom", name = "EMOM timer", state = "allowed" })).EnsureSuccessStatusCode();
        var mine = (await Json(await w.Client.GetAsync("/coach/coaches")))[0];
        Assert.Equal("allowed", mine.GetProperty("pluginConsent").GetProperty("emom").GetProperty("state").GetString());
        Assert.Equal("EMOM timer", mine.GetProperty("pluginConsent").GetProperty("emom").GetProperty("name").GetString());
    }

    [Fact]
    public async Task Nutrition_rules_are_the_coachs_and_clients_get_the_food_swap_rule()
    {
        await using var w = await CoachedAsync("nrules", paying: false);
        var s = await Json(await w.Coach.GetAsync("/coach/settings"));
        Assert.Equal("mine", s.GetProperty("foodSwapRule").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, (await w.Coach.PutAsJsonAsync("/coach/settings/nutrition", new { foodSwapRule = "anything" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await w.Coach.PutAsJsonAsync("/coach/settings/nutrition", new { windowDays = 3 })).StatusCode);
        var saved = await Json(await w.Coach.PutAsJsonAsync("/coach/settings/nutrition", new { foodSwapRule = "close", windowDays = 14 }));
        Assert.Equal("close", saved.GetProperty("foodSwapRule").GetString());
        Assert.Equal(14, saved.GetProperty("nutrition").GetProperty("windowDays").GetInt32());
        // The exercise swap rule is left alone.
        Assert.Equal("any", saved.GetProperty("swapRule").GetString());
        var mine = (await Json(await w.Client.GetAsync("/coach/coaches")))[0];
        Assert.Equal("close", mine.GetProperty("foodSwapRule").GetString());
    }

    [Fact]
    public async Task Giving_a_meal_plan_tells_the_client_once()
    {
        await using var w = await CoachedAsync("mealplan", paying: false);
        var username = w.ClientName;
        var plan = new { planId = "cnplan_1", dataJson = "{\"id\":\"cnplan_1\",\"name\":\"Fat loss\",\"kcalTarget\":2100,\"archived\":false,\"createdAtMs\":1,\"updatedAtMs\":1}", updatedAtMs = 1L, recipientUsername = username };
        (await w.Coach.PostAsJsonAsync("/coach/nutrition-plans", plan)).EnsureSuccessStatusCode();
        // Saving changes to it later doesn't tell them again.
        (await w.Coach.PostAsJsonAsync("/coach/nutrition-plans", plan with { updatedAtMs = 2L })).EnsureSuccessStatusCode();
        var notes = (await Json(await w.Client.GetAsync("/notifications"))).GetProperty("notifications").EnumerateArray()
            .Where(n => n.GetProperty("type").GetString() == "CoachMealPlan").ToList();
        Assert.Single(notes);
    }

    [Fact]
    public async Task The_roster_counts_days_with_food_logged_this_week()
    {
        await using var w = await CoachedAsync("food", paying: false);
        object Day(int ago, bool food)
        {
            var date = DateTime.UtcNow.Date.AddDays(-ago).ToString("yyyy-MM-dd");
            var items = food ? new object[] { new { id = $"i{ago}", name = "Oats", grams = 80 } } : Array.Empty<object>();
            return new { id = $"nday_{date}", createdAtMs = 1, updatedAtMs = 1, dataJson = JsonSerializer.Serialize(new { id = $"nday_{date}", dateIso = date, items }) };
        }
        // Two days with food this week, one empty day, one with food from too long ago.
        var days = new[] { Day(0, true), Day(3, true), Day(4, false), Day(9, true) };
        (await w.Client.PostAsJsonAsync("/sync/nutrition/days", new { days })).EnsureSuccessStatusCode();
        var row = (await Json(await w.Coach.GetAsync("/coach/roster"))).GetProperty("roster")[0];
        Assert.Equal(2, row.GetProperty("foodDays7d").GetInt32());
    }

    [Fact]
    public async Task Your_month_adds_up_receipts_refunds_clients_and_requests()
    {
        await using var w = await CoachedAsync("month", paying: false);
        DateTime On(int month, int day) => new(2026, month, day, 12, 0, 0, DateTimeKind.Utc);
        await w.Api.WithDbAsync(async db =>
        {
            db.CoachPaymentReceipts.AddRange(
                new CoachPaymentReceipt { CoachId = w.CoachId, ExternalId = "a", AmountCents = 20000, PaidAt = On(1, 10) },
                new CoachPaymentReceipt { CoachId = w.CoachId, ExternalId = "b", AmountCents = 3000, PaidAt = On(2, 10) },
                new CoachPaymentReceipt { CoachId = w.CoachId, ExternalId = "c", AmountCents = 8000, PaidAt = On(3, 2) },
                new CoachPaymentReceipt { CoachId = w.CoachId, ExternalId = "d", AmountCents = 5000, PaidAt = On(3, 20) },
                new CoachPaymentReceipt { CoachId = w.CoachId, ExternalId = "refund:c", AmountCents = -1000, PaidAt = On(3, 25) },
                new CoachPaymentReceipt { CoachId = w.CoachId, ExternalId = "e", AmountCents = 999, Currency = "usd", PaidAt = On(3, 25) });
            await db.SaveChangesAsync();
        });
        var m = await Json(await w.Coach.GetAsync("/coach/month?month=2026-03"));
        Assert.Equal("eur", m.GetProperty("currency").GetString());
        var income = m.GetProperty("income").EnumerateArray().ToList();
        Assert.Equal(6, income.Count);
        Assert.Equal("2026-03", income[^1].GetProperty("month").GetString());
        Assert.Equal(12000, income[^1].GetProperty("cents").GetInt64());
        Assert.Equal(3000, income[^2].GetProperty("cents").GetInt64());
        Assert.Equal(20000, m.GetProperty("bestBeforeCents").GetInt64());
        Assert.Equal(1, m.GetProperty("clients").GetProperty("count").GetInt32());
        // Anyone else sees only their own (here: nothing).
        Assert.Equal(0, (await Json(await w.Client.GetAsync("/coach/month"))).GetProperty("clients").GetProperty("count").GetInt32());
    }

    [Fact]
    public async Task Overview_cards_save_for_everyone_a_package_or_a_client()
    {
        await using var w = await CoachedAsync("cards", paying: false);
        var empty = await Json(await w.Coach.GetAsync("/coach/cards"));
        Assert.Equal(JsonValueKind.Null, empty.GetProperty("all").ValueKind);
        var client = Guid.NewGuid().ToString();
        var layout = new { all = new[] { "checkin", "training" }, clients = new Dictionary<string, string[]> { [client] = new[] { "food", "plugin:app.example.hangboard" } } };
        var saved = await Json(await w.Coach.PutAsJsonAsync("/coach/cards", layout));
        Assert.Equal("food", saved.GetProperty("clients").GetProperty(client)[0].GetString());
        // Today and Your month (canvas W13) save alongside.
        var pages = await Json(await w.Coach.PutAsJsonAsync("/coach/cards", new { today = new[] { "needs", "paid" }, month = new[] { "wins" } }));
        Assert.Equal("paid", pages.GetProperty("today")[1].GetString());
        var twice = new { all = new[] { "food", "food" } };
        Assert.Equal(HttpStatusCode.BadRequest, (await w.Coach.PutAsJsonAsync("/coach/cards", twice)).StatusCode);
        var badKey = new { clients = new Dictionary<string, string[]> { ["dara"] = new[] { "food" } } };
        Assert.Equal(HttpStatusCode.BadRequest, (await w.Coach.PutAsJsonAsync("/coach/cards", badKey)).StatusCode);
    }

    [Fact]
    public async Task Saved_replies_are_the_coachs_own_and_checked()
    {
        await using var w = await CoachedAsync("replies", paying: false);
        Assert.Empty((await Json(await w.Coach.GetAsync("/coach/saved-replies"))).GetProperty("replies").EnumerateArray());
        var ok = new { replies = new[] { new { id = "r1", shortcut = " swap ", title = "Swap is fine", body = "Yep, {exercise} for now." } } };
        var saved = await Json(await w.Coach.PutAsJsonAsync("/coach/saved-replies", ok));
        Assert.Equal("swap", saved.GetProperty("replies")[0].GetProperty("shortcut").GetString());
        var twice = new { replies = new[] { new { id = "a", shortcut = "x", title = "", body = "1" }, new { id = "b", shortcut = "X", title = "", body = "2" } } };
        Assert.Equal(HttpStatusCode.BadRequest, (await w.Coach.PutAsJsonAsync("/coach/saved-replies", twice)).StatusCode);
        var spaced = new { replies = new[] { new { id = "a", shortcut = "two words", title = "", body = "1" } } };
        Assert.Equal(HttpStatusCode.BadRequest, (await w.Coach.PutAsJsonAsync("/coach/saved-replies", spaced)).StatusCode);
        // Someone else's are their own.
        Assert.Empty((await Json(await w.Client.GetAsync("/coach/saved-replies"))).GetProperty("replies").EnumerateArray());
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
