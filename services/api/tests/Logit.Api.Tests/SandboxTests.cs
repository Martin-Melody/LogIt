using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Tests;

/// The coach sandbox: sample clients made for the Studio walkthrough, driven by the coach's app
/// through the normal endpoints with a short-lived token, and kept away from everyone else.
public class SandboxTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _api;
    public SandboxTests(ApiFactory api) => _api = api;

    private static object ThreeSamples => new
    {
        clients = new object[]
        {
            new { key = "niamh", displayName = "Niamh", active = false },
            new { key = "conor", displayName = "Conor", active = true },
            new { key = "dara", displayName = "Dara", active = true,
                  sharing = new { workouts = true, nutrition = false, bodyweight = false, habits = false, checkins = false } },
        },
    };

    private static async Task<JsonElement> Json(HttpResponseMessage res)
    {
        var text = await res.Content.ReadAsStringAsync();
        Assert.True(res.IsSuccessStatusCode, $"{(int)res.StatusCode}: {text}");
        return JsonDocument.Parse(text).RootElement;
    }

    private static JsonElement Sample(JsonElement list, string key) =>
        list.GetProperty("clients").EnumerateArray().Single(c => c.GetProperty("key").GetString() == key);

    private async Task<HttpClient> SampleClient(HttpClient coach, Guid userId)
    {
        var token = (await Json(await coach.PostAsync($"/coach/sandbox/clients/{userId}/token", null)))
            .GetProperty("accessToken").GetString()!;
        return _api.ClientWithToken(token);
    }

    [Fact]
    public async Task Studio_coach_adds_sample_clients_and_drives_them_through_the_real_routes()
    {
        // Below Studio, sample clients are allowed too (SampleCoachTests covers who isn't).
        var (coach, coachId, _) = await _api.SignUpAsync("sbx_coach", UserTier.Studio);
        var list = await Json(await coach.PostAsJsonAsync("/coach/sandbox", ThreeSamples));
        Assert.Equal(3, list.GetProperty("clients").GetArrayLength());
        Assert.Equal("None", Sample(list, "niamh").GetProperty("status").GetString());
        Assert.Equal("Active", Sample(list, "conor").GetProperty("status").GetString());

        // Only one sandbox at a time; Reset in the app is Remove then Add.
        Assert.Equal(HttpStatusCode.Conflict, (await coach.PostAsJsonAsync("/coach/sandbox", ThreeSamples)).StatusCode);

        // The roster marks them, and Dara's sharing is what the coach asked for.
        var roster = await Json(await coach.GetAsync("/coach/roster"));
        var rows = roster.GetProperty("roster").EnumerateArray().ToList();
        Assert.Equal(2, rows.Count);
        Assert.All(rows, r => Assert.True(r.GetProperty("client").GetProperty("isSample").GetBoolean()));
        var daraRow = rows.Single(r => r.GetProperty("client").GetProperty("displayName").GetString() == "Dara");
        Assert.False(daraRow.GetProperty("sharing").GetProperty("nutrition").GetBoolean());

        // Niamh asks through the coach's link with her own token, like a real client would.
        var link = await Json(await coach.PostAsJsonAsync("/coach/links", new { name = "Instagram bio" }));
        var niamhId = Sample(list, "niamh").GetProperty("userId").GetGuid();
        var niamh = await SampleClient(coach, niamhId);
        var asked = await niamh.PostAsJsonAsync($"/coach/links/code/{link.GetProperty("code").GetString()}/request", new { });
        Assert.Equal("requested", (await Json(asked)).GetProperty("status").GetString());
        var requests = await Json(await coach.GetAsync("/coach/requests"));
        var request = requests.GetProperty("requests").EnumerateArray().Single();
        Assert.True(request.GetProperty("client").GetProperty("isSample").GetBoolean());
        Assert.Equal(HttpStatusCode.NoContent,
            (await coach.PostAsync($"/coach/requests/{request.GetProperty("relationshipId").GetGuid()}/accept", null)).StatusCode);

        // A sample pushes a workout through normal sync, and the coach reads it.
        var conorId = Sample(list, "conor").GetProperty("userId").GetGuid();
        var conor = await SampleClient(coach, conorId);
        var push = await conor.PostAsJsonAsync("/sync/sessions", new
        {
            sessions = new[] { new { id = "s1", startedAtMs = 1_700_000_000_000, dataJson = "{\"id\":\"s1\"}" } },
        });
        Assert.True(push.IsSuccessStatusCode, await push.Content.ReadAsStringAsync());
        var seen = await Json(await coach.GetAsync($"/sync/sessions?since=0&clientId={conorId}"));
        Assert.Contains("s1", seen.GetRawText());
    }

    [Fact]
    public async Task A_sample_token_only_reaches_client_side_coaching_and_sync()
    {
        var (coach, _, _) = await _api.SignUpAsync("sbx_guard", UserTier.Studio);
        var list = await Json(await coach.PostAsJsonAsync("/coach/sandbox", ThreeSamples));
        var conor = await SampleClient(coach, Sample(list, "conor").GetProperty("userId").GetGuid());

        Assert.Equal(HttpStatusCode.OK, (await conor.GetAsync("/users/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await conor.PostAsJsonAsync("/posts", new { type = "Text", body = "hi" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await conor.GetAsync("/users/search?q=a")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await conor.PatchAsJsonAsync("/users/me", new { displayName = "x" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await conor.GetAsync("/coach/sandbox")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await conor.DeleteAsync("/auth/account")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await conor.GetAsync("/billing/status")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await conor.GetAsync("/coach/coaches")).StatusCode);
    }

    [Fact]
    public async Task Nobody_else_can_find_sign_in_as_or_use_a_sample_client()
    {
        var (coach, _, _) = await _api.SignUpAsync("sbx_owner", UserTier.Studio);
        var list = await Json(await coach.PostAsJsonAsync("/coach/sandbox", ThreeSamples));
        var conorId = Sample(list, "conor").GetProperty("userId").GetGuid();
        var username = Sample(list, "conor").GetProperty("username").GetString()!;

        var anon = _api.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await anon.PostAsJsonAsync("/auth/login", new { usernameOrEmail = username, password = "anything at all" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync($"/users/{username}")).StatusCode);

        var (other, _, _) = await _api.SignUpAsync("sbx_other", UserTier.Studio);
        var search = await Json(await other.GetAsync("/users/search?q=sample"));
        Assert.Equal(0, search.GetArrayLength());
        Assert.Equal(HttpStatusCode.NotFound, (await other.PostAsync($"/coach/sandbox/clients/{conorId}/token", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.PostAsync($"/users/{username}/follow", null)).StatusCode);

        // A sample can't ask another coach to coach it.
        var otherLink = await Json(await other.PostAsJsonAsync("/coach/links", new { name = "Mine" }));
        var conor = await SampleClient(coach, conorId);
        Assert.Equal(HttpStatusCode.NotFound,
            (await conor.PostAsJsonAsync($"/coach/links/code/{otherLink.GetProperty("code").GetString()}/request", new { })).StatusCode);
    }

    [Fact]
    public async Task Removing_the_sandbox_or_the_coach_takes_the_samples_and_everything_they_made()
    {
        var (coach, coachId, _) = await _api.SignUpAsync("sbx_remove", UserTier.Studio);
        var list = await Json(await coach.PostAsJsonAsync("/coach/sandbox", ThreeSamples));
        var conorId = Sample(list, "conor").GetProperty("userId").GetGuid();
        var conor = await SampleClient(coach, conorId);
        await conor.PostAsJsonAsync("/sync/sessions", new
        {
            sessions = new[] { new { id = "s1", startedAtMs = 1_700_000_000_000, dataJson = "{}" } },
        });

        var removed = await Json(await coach.DeleteAsync("/coach/sandbox"));
        Assert.Equal(3, removed.GetProperty("removed").GetInt32());
        Assert.Equal(0, await _api.WithDbAsync(db => db.Users.CountAsync(u => u.SampleOwnerId == coachId)));
        Assert.Equal(0, await _api.WithDbAsync(db => db.SyncedWorkoutSessions.CountAsync(s => s.UserId == conorId)));
        Assert.Equal(0, await _api.WithDbAsync(db => db.CoachClientRelationships.CountAsync(r => r.CoachId == coachId)));

        // Added back, fresh. Then the coach deletes their account and the samples go with it.
        await Json(await coach.PostAsJsonAsync("/coach/sandbox", ThreeSamples));
        var del = new HttpRequestMessage(HttpMethod.Delete, "/auth/account")
        {
            Content = new StringContent("{\"password\":\"Passw0rd!long\"}", Encoding.UTF8, "application/json"),
        };
        Assert.Equal(HttpStatusCode.NoContent, (await coach.SendAsync(del)).StatusCode);
        Assert.Equal(0, await _api.WithDbAsync(db => db.Users.CountAsync(u => u.SampleOwnerId == coachId)));
    }

    [Fact]
    public async Task Walkthrough_progress_is_stored_per_account_as_a_json_object()
    {
        var (me, _, _) = await _api.SignUpAsync("guide_user");
        Assert.Equal("{}", await (await me.GetAsync("/users/me/guide")).Content.ReadAsStringAsync());

        var body = "{\"v\":1,\"done\":{\"pro.dashboard\":1700000000000}}";
        var put = await me.PutAsync("/users/me/guide", new StringContent(body, Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.NoContent, put.StatusCode);
        Assert.Equal(body, await (await me.GetAsync("/users/me/guide")).Content.ReadAsStringAsync());

        var bad = await me.PutAsync("/users/me/guide", new StringContent("[1]", Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
    }
}
