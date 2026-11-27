using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Email;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Logit.Api.Tests;

/// Asking to be coached, and the coach's answers (canvas P2, R3, C1–C6, A1–A5).
public class CoachRequestTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _api;
    public CoachRequestTests(ApiFactory api) => _api = api;

    private static readonly Dictionary<string, string> GoodAnswers = new()
    {
        ["goal"] = "Squat 100 kg", ["experience"] = "1–3 years", ["days"] = "4", ["food"] = "Yes",
    };

    private static async Task<JsonElement> Json(HttpResponseMessage res)
    {
        Assert.True(res.IsSuccessStatusCode, $"{(int)res.StatusCode} {await res.Content.ReadAsStringAsync()}");
        var text = await res.Content.ReadAsStringAsync();
        return text.Length == 0 ? default : JsonDocument.Parse(text).RootElement.Clone();
    }

    private async Task<(HttpClient Coach, Guid CoachId, string CoachName, HttpClient Client, Guid ClientId, Guid RelId)> AskedAsync(string tag)
    {
        var (coach, coachId, coachName) = await _api.SignUpAsync($"coach_{tag}", UserTier.Studio);
        var (client, clientId, _) = await _api.SignUpAsync($"client_{tag}");
        var asked = await Json(await client.PostAsJsonAsync($"/coach/ask/{coachName}", new { answers = GoodAnswers }));
        Assert.Equal("asked", asked.GetProperty("stage").GetString());
        return (coach, coachId, coachName, client, clientId, asked.GetProperty("relationshipId").GetGuid());
    }

    private static async Task<JsonElement> MineAsync(HttpClient client, bool closed = false) =>
        (await Json(await client.GetAsync($"/coach/requests/mine{(closed ? "?includeClosed=true" : "")}"))).GetProperty("requests");

    private static async Task<List<JsonElement>> ThreadAsync(HttpClient who, Guid relId) =>
        [.. (await Json(await who.GetAsync($"/coach/messages?relationshipId={relId}&since=0"))).GetProperty("messages").EnumerateArray()];

    [Fact]
    public async Task Asking_keeps_the_answers_with_the_question_as_asked_and_needs_the_required_ones()
    {
        var (coach, _, coachName, _, _, relId) = await AskedAsync("ans");
        var requests = (await Json(await coach.GetAsync("/coach/requests"))).GetProperty("requests");
        var r = requests.EnumerateArray().Single(x => x.GetProperty("relationshipId").GetGuid() == relId);
        var answers = r.GetProperty("answers");
        Assert.Equal(4, answers.GetArrayLength()); // the optional health question was left out
        Assert.Equal("What do you want from coaching?", answers[0].GetProperty("question").GetString());

        var (other, _, _) = await _api.SignUpAsync("client_missing");
        var res = await other.PostAsJsonAsync($"/coach/ask/{coachName}", new { answers = new Dictionary<string, string> { ["goal"] = "x" } });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Contains("How long have you been training?", await res.Content.ReadAsStringAsync());
        res = await other.PostAsJsonAsync($"/coach/ask/{coachName}", new { answers = new Dictionary<string, string>(GoodAnswers) { ["days"] = "9" } });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task An_offer_with_no_payment_is_taken_and_coaching_starts()
    {
        var (coach, _, _, client, _, relId) = await AskedAsync("take");
        var offerId = (await Json(await coach.PostAsJsonAsync($"/coach/requests/{relId}/offer", new { holdDays = 7, message = "Spot from Monday!" })))
            .GetProperty("offerId").GetGuid();

        var mine = (await MineAsync(client)).EnumerateArray().Single();
        Assert.Equal("offered", mine.GetProperty("stage").GetString());
        Assert.Equal("open", mine.GetProperty("offer").GetProperty("state").GetString());

        // The conversation records it: the coach's words, then the offer card in words too.
        var thread = await ThreadAsync(client, relId);
        Assert.Equal("Spot from Monday!", thread[^2].GetProperty("body").GetString());
        Assert.Equal("offer", thread[^1].GetProperty("kind").GetString());
        Assert.Contains("offered you a spot", thread[^1].GetProperty("body").GetString());

        await Json(await client.PostAsJsonAsync($"/coach/offers/{offerId}/take", new { }));
        Assert.Equal("Active", await _api.WithDbAsync(db => db.CoachClientRelationships.Where(r => r.Id == relId).Select(r => r.Status.ToString()).SingleAsync()));
        Assert.Equal("joined", (await ThreadAsync(coach, relId))[^1].GetProperty("kind").GetString());
        // It's coaching now, not a request.
        Assert.Equal(0, (await MineAsync(client)).GetArrayLength());
    }

    [Fact]
    public async Task Changing_and_withdrawing_an_offer_tell_the_client()
    {
        var (coach, _, _, client, _, relId) = await AskedAsync("change");
        var first = (await Json(await coach.PostAsJsonAsync($"/coach/requests/{relId}/offer", new { }))).GetProperty("offerId").GetGuid();
        await Json(await coach.PostAsJsonAsync($"/coach/requests/{relId}/offer", new { holdDays = 3 }));
        Assert.Equal("replaced", await _api.WithDbAsync(db => db.CoachOffers.Where(o => o.Id == first).Select(o => o.State).SingleAsync()));
        Assert.Equal("offer-changed", (await ThreadAsync(client, relId))[^1].GetProperty("kind").GetString());
        // The replaced one can't be taken.
        Assert.Equal(HttpStatusCode.Gone, (await client.PostAsJsonAsync($"/coach/offers/{first}/take", new { })).StatusCode);

        await Json(await coach.PostAsync($"/coach/requests/{relId}/withdraw-offer", null));
        var mine = (await MineAsync(client)).EnumerateArray().Single();
        Assert.Equal("asked", mine.GetProperty("stage").GetString());
        Assert.Equal("withdrawn", mine.GetProperty("offer").GetProperty("state").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await coach.PostAsync($"/coach/requests/{relId}/withdraw-offer", null)).StatusCode);
    }

    [Fact]
    public async Task An_offer_that_ran_out_says_so_and_a_paid_one_needs_checkout()
    {
        var (coach, coachId, _, client, _, relId) = await AskedAsync("expire");
        var offerId = (await Json(await coach.PostAsJsonAsync($"/coach/requests/{relId}/offer", new { holdDays = 1 }))).GetProperty("offerId").GetGuid();
        await _api.WithDbAsync(async db =>
        {
            var o = await db.CoachOffers.SingleAsync(x => x.Id == offerId);
            o.HoldUntil = DateTime.UtcNow.AddMinutes(-1);
            await db.SaveChangesAsync();
        });
        var res = await client.PostAsJsonAsync($"/coach/offers/{offerId}/take", new { });
        Assert.Equal(HttpStatusCode.Gone, res.StatusCode);
        Assert.Contains("expired", await res.Content.ReadAsStringAsync());
        var r = (await Json(await coach.GetAsync("/coach/requests"))).GetProperty("requests").EnumerateArray()
            .Single(x => x.GetProperty("relationshipId").GetGuid() == relId);
        Assert.Equal("expired", r.GetProperty("offer").GetProperty("state").GetString());

        Guid packageId = Guid.Empty;
        await _api.WithDbAsync(async db =>
        {
            var k = new CoachPackage { CoachId = coachId, Name = "Monthly", AmountCents = 8000, Interval = "month" };
            packageId = k.Id;
            db.CoachPackages.Add(k);
            await db.SaveChangesAsync();
        });
        // Not before payments can take her money.
        var notReady = await coach.PostAsJsonAsync($"/coach/requests/{relId}/offer", new { packageId });
        Assert.Equal(HttpStatusCode.BadRequest, notReady.StatusCode);
        Assert.Contains("payments_not_ready", await notReady.Content.ReadAsStringAsync());
        await _api.WithDbAsync(async db =>
        {
            db.CoachPaymentAccounts.Add(new CoachPaymentAccount { CoachId = coachId, StripeAccountId = "acct_expire", CardPaymentsActive = true, Country = "IE" });
            await db.SaveChangesAsync();
        });
        var paid = (await Json(await coach.PostAsJsonAsync($"/coach/requests/{relId}/offer", new { packageId }))).GetProperty("offerId").GetGuid();
        Assert.Equal(HttpStatusCode.PaymentRequired, (await client.PostAsJsonAsync($"/coach/offers/{paid}/take", new { })).StatusCode);
    }

    [Fact]
    public async Task A_full_coach_gets_a_waiting_list_or_stops_requests_and_open_offers_hold_spots()
    {
        var (coach, coachId, coachName, _, _, relId) = await AskedAsync("full");
        // One spot, and an offer out holds it.
        await Json(await coach.PutAsJsonAsync("/coach/intake", new { spots = 1, whenFull = "waitlist", expectSpots = "January" }));
        await Json(await coach.PostAsJsonAsync($"/coach/requests/{relId}/offer", new { }));
        var intake = await Json(await coach.GetAsync("/coach/intake"));
        Assert.True(intake.GetProperty("full").GetBoolean());

        var (late, _, _) = await _api.SignUpAsync("client_late");
        var asked = await Json(await late.PostAsJsonAsync($"/coach/ask/{coachName}", new { answers = GoodAnswers }));
        Assert.Equal("waiting", asked.GetProperty("stage").GetString());
        var mine = (await MineAsync(late)).EnumerateArray().Single();
        Assert.Equal("January", mine.GetProperty("expectSpots").GetString());

        await Json(await coach.PutAsJsonAsync("/coach/intake", new { spots = 1, whenFull = "stop" }));
        var (later, _, _) = await _api.SignUpAsync("client_later");
        var res = await later.PostAsJsonAsync($"/coach/ask/{coachName}", new { answers = GoodAnswers });
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        Assert.Contains("not_taking", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Waiting_list_leaving_closed_list_and_reopening()
    {
        var (coach, _, _, client, _, relId) = await AskedAsync("wait");
        await Json(await coach.PostAsJsonAsync($"/coach/requests/{relId}/waitlist", new { message = "Full till January", expectSpots = "January" }));
        Assert.Equal("waitlist", (await ThreadAsync(client, relId))[^1].GetProperty("kind").GetString());

        await Json(await client.PostAsync($"/coach/requests/mine/{relId}/withdraw", null));
        Assert.Contains("left your waiting list", (await ThreadAsync(coach, relId))[^1].GetProperty("body").GetString());
        var closed = (await Json(await coach.GetAsync("/coach/requests/closed"))).GetProperty("requests");
        Assert.Equal("withdrawn", closed.EnumerateArray().Single(x => x.GetProperty("relationshipId").GetGuid() == relId).GetProperty("stage").GetString());

        await Json(await coach.PostAsync($"/coach/requests/{relId}/reopen", null));
        Assert.Equal("asked", (await MineAsync(client)).EnumerateArray().Single().GetProperty("stage").GetString());
    }

    [Fact]
    public async Task Not_a_fit_closes_it_readable_but_not_writable_and_can_block()
    {
        var (coach, coachId, coachName, client, clientId, relId) = await AskedAsync("nofit");
        await Json(await coach.PostAsJsonAsync($"/coach/requests/{relId}/not-a-fit", new { message = "Try a running coach", block = true }));

        var thread = await ThreadAsync(client, relId);
        Assert.Equal("closed", thread[^1].GetProperty("kind").GetString());
        var send = await client.PostAsJsonAsync("/coach/messages", new { messageId = "m1", relationshipId = relId, body = "but…" });
        Assert.Equal(HttpStatusCode.NotFound, send.StatusCode);
        Assert.True(await _api.WithDbAsync(db => db.Blocks.AnyAsync(b => b.BlockerId == coachId && b.BlockedId == clientId)));
        // Blocked: they can't ask again.
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync($"/coach/ask/{coachName}", new { answers = GoodAnswers })).StatusCode);

        // "Delete this request": the answers go and the coach stops listing it.
        Assert.Equal(1, (await MineAsync(client, closed: true)).GetArrayLength());
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/coach/requests/mine/{relId}")).StatusCode);
        Assert.Null(await _api.WithDbAsync(db => db.CoachClientRelationships.Where(r => r.Id == relId).Select(r => r.AnswersJson).SingleAsync()));
        var closed = (await Json(await coach.GetAsync("/coach/requests/closed"))).GetProperty("requests");
        Assert.DoesNotContain(closed.EnumerateArray(), x => x.GetProperty("relationshipId").GetGuid() == relId);
    }

    [Fact]
    public async Task Asking_through_a_link_takes_the_same_answers()
    {
        var (coach, coachId, _) = await _api.SignUpAsync("coach_link", UserTier.Studio);
        var link = await Json(await coach.PostAsJsonAsync("/coach/links", new { name = "Bio" }));
        var code = link.GetProperty("code").GetString()!;
        var (client, _, _) = await _api.SignUpAsync("client_link");
        var asked = await Json(await client.PostAsJsonAsync($"/coach/links/code/{code}/request", new { answers = GoodAnswers }));
        Assert.Equal("asked", asked.GetProperty("stage").GetString());
        var r = (await Json(await coach.GetAsync("/coach/requests"))).GetProperty("requests").EnumerateArray().Single();
        Assert.Equal("Bio", r.GetProperty("linkName").GetString());
        Assert.Equal(4, r.GetProperty("answers").GetArrayLength());

        // An older app that sends no answers still asks.
        var (old, _, _) = await _api.SignUpAsync("client_oldapp");
        Assert.Equal("asked", (await Json(await old.PostAsJsonAsync($"/coach/links/code/{code}/request", new { }))).GetProperty("stage").GetString());
    }

    [Fact]
    public async Task A_coach_writes_their_own_questions_and_limit()
    {
        var (coach, _, coachName) = await _api.SignUpAsync("coach_q", UserTier.Studio);
        var bad = await coach.PutAsJsonAsync("/coach/intake", new { questions = new[] { new { id = "a", label = "Pick", kind = "choice", options = new[] { "only one" } } } });
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await coach.PutAsJsonAsync("/coach/intake", new { spots = 0 })).StatusCode);

        var saved = await Json(await coach.PutAsJsonAsync("/coach/intake", new
        {
            spots = 12,
            questions = new[] { new { id = "why", label = "Why now?", kind = "text", optional = false } },
        }));
        Assert.True(saved.GetProperty("customQuestions").GetBoolean());
        var (client, _, _) = await _api.SignUpAsync("client_q");
        var info = await Json(await client.GetAsync($"/coach/ask/{coachName}"));
        Assert.Equal("Why now?", info.GetProperty("questions")[0].GetProperty("label").GetString());
        await Json(await client.PostAsJsonAsync($"/coach/ask/{coachName}", new { answers = new Dictionary<string, string> { ["why"] = "Wedding" } }));

        var reset = await Json(await coach.PutAsJsonAsync("/coach/intake", new { spots = 12, resetQuestions = true }));
        Assert.False(reset.GetProperty("customQuestions").GetBoolean());
        Assert.Equal(5, reset.GetProperty("questions").GetArrayLength());
    }
}

/// The email when a coach answers someone who has no app yet (canvas R7), and the bits of
/// 1.3 the ask sheet reads: questions before signing in, the "full" state on the profile.
public class RequestEmailTests
{
    private static readonly Dictionary<string, string> Answers = new()
    {
        ["goal"] = "Strength", ["experience"] = "3+ years", ["days"] = "3", ["food"] = "No",
    };

    [Fact]
    public async Task One_email_per_unread_run_none_with_the_app_and_the_stop_link_works()
    {
        var email = new FakeEmailSender();
        await using var api = new ApiFactory
        {
            ConfigureTestServices = s =>
            {
                s.RemoveAll<IEmailSender>();
                s.AddSingleton<IEmailSender>(email);
            },
        };
        var (coach, _, coachName) = await api.SignUpAsync("mail_coach", UserTier.Studio);
        var (client, clientId, _) = await api.SignUpAsync("mail_client");
        var relId = JsonDocument.Parse(await (await client.PostAsJsonAsync($"/coach/ask/{coachName}", new { answers = Answers })).Content.ReadAsStringAsync())
            .RootElement.GetProperty("relationshipId").GetGuid();

        var send = await coach.PostAsJsonAsync("/coach/messages", new { messageId = "c1", relationshipId = relId, body = "Hi! Is the knee ok?", createdAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() });
        Assert.True(send.IsSuccessStatusCode);
        var mail = Assert.Single(email.Sent);
        Assert.Contains("replied to your coaching request", mail.Subject);
        Assert.DoesNotContain("knee", mail.Body); // who and what, never the words

        // Still unread: an offer on top doesn't email again.
        await coach.PostAsJsonAsync($"/coach/requests/{relId}/offer", new { });
        Assert.Single(email.Sent);

        // Once it's read, the next step emails again; with the app, nothing.
        await api.WithDbAsync(db => db.CoachMessages.Where(m => m.RelationshipId == relId).ExecuteUpdateAsync(s => s.SetProperty(m => m.ReadAtMs, 1L)));
        await coach.PostAsJsonAsync($"/coach/requests/{relId}/waitlist", new { message = "" });
        Assert.Equal(2, email.Sent.Count);
        Assert.Contains("waiting list", email.Sent[^1].Subject);

        var stop = System.Text.RegularExpressions.Regex.Match(email.Sent[^1].Body, @"stop-emails\?u=([0-9a-f-]+)&t=([0-9a-f]+)");
        Assert.True(stop.Success);
        var anon = api.CreateClient();
        Assert.Equal(HttpStatusCode.BadRequest, (await anon.PostAsJsonAsync("/email/stop-request-emails", new { userId = clientId, token = "nope" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await anon.PostAsJsonAsync("/email/stop-request-emails", new { userId = Guid.Parse(stop.Groups[1].Value), token = stop.Groups[2].Value })).StatusCode);
        await api.WithDbAsync(db => db.CoachMessages.Where(m => m.RelationshipId == relId).ExecuteUpdateAsync(s => s.SetProperty(m => m.ReadAtMs, 1L)));
        await coach.PostAsJsonAsync("/coach/messages", new { messageId = "c2", relationshipId = relId, body = "x", createdAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() });
        Assert.Equal(2, email.Sent.Count);
    }

    [Fact]
    public async Task No_email_when_they_have_the_app()
    {
        var email = new FakeEmailSender();
        await using var api = new ApiFactory
        {
            ConfigureTestServices = s =>
            {
                s.RemoveAll<IEmailSender>();
                s.AddSingleton<IEmailSender>(email);
            },
        };
        var (coach, _, coachName) = await api.SignUpAsync("app_coach", UserTier.Studio);
        var (client, clientId, _) = await api.SignUpAsync("app_client");
        await api.WithDbAsync(async db => { db.PushDevices.Add(new PushDevice { UserId = clientId, Token = "t" }); await db.SaveChangesAsync(); });
        var relId = JsonDocument.Parse(await (await client.PostAsJsonAsync($"/coach/ask/{coachName}", new { answers = Answers })).Content.ReadAsStringAsync())
            .RootElement.GetProperty("relationshipId").GetGuid();
        await coach.PostAsJsonAsync($"/coach/requests/{relId}/offer", new { });
        Assert.Empty(email.Sent);
    }

    [Fact]
    public async Task Ask_info_shows_before_signing_in_and_the_profile_says_when_full()
    {
        await using var api = new ApiFactory();
        var (coach, coachId, coachName) = await api.SignUpAsync("full_coach", UserTier.Studio);
        await coach.PutAsJsonAsync("/coach/profile", new { profile = new { headline = "Strength coaching", mode = "online", about = "", goodFor = Array.Empty<string>() } });
        await coach.PutAsJsonAsync("/coach/intake", new { spots = 1, whenFull = "waitlist", expectSpots = "January" });

        var anon = api.CreateClient();
        var info = JsonDocument.Parse(await (await anon.GetAsync($"/coach/ask/{coachName}")).Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(5, info.GetProperty("questions").GetArrayLength());
        Assert.Equal("none", info.GetProperty("relationship").GetString());

        var (client, clientId, _) = await api.SignUpAsync("full_client");
        await api.WithDbAsync(async db =>
        {
            db.CoachClientRelationships.Add(new CoachClientRelationship { CoachId = coachId, ClientId = clientId, Status = CoachClientStatus.Active });
            await db.SaveChangesAsync();
        });
        var profile = JsonDocument.Parse(await (await anon.GetAsync($"/public/users/{coachName}")).Content.ReadAsStringAsync()).RootElement;
        var section = profile.GetProperty("profile").GetProperty("coaching");
        Assert.True(section.GetProperty("full").GetBoolean());
        Assert.Equal("January", section.GetProperty("expectSpots").GetString());

        // Their client sees since when; someone else's client sees who coaches them.
        var mine = JsonDocument.Parse(await (await client.GetAsync($"/coach/ask/{coachName}")).Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("active", mine.GetProperty("relationship").GetString());
        Assert.NotEqual(JsonValueKind.Null, mine.GetProperty("coachedSince").ValueKind);
        var (_, _, otherCoachName) = await api.SignUpAsync("other_coach", UserTier.Studio);
        var other = JsonDocument.Parse(await (await client.GetAsync($"/coach/ask/{otherCoachName}")).Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("full_coach", other.GetProperty("otherCoach").GetString());
    }
}
