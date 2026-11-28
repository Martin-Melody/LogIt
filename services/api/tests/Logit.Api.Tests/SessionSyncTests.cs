using System.Net.Http.Json;
using System.Text.Json;

namespace Logit.Api.Tests;

/// Two devices on one account: a set corrected on phone B survives phone A's "Sync now"
/// re-sending its older copy (found in bug hunt round 7).
public class SessionSyncTests
{
    private static object Session(string reps, long? updatedAtMs) => new
    {
        id = "sess_1",
        startedAtMs = 1_000,
        updatedAtMs,
        dataJson = $"{{\"id\":\"sess_1\",\"reps\":{reps}}}",
    };

    private static async Task<JsonElement> Pulled(HttpClient http) =>
        (await (await http.GetAsync("/sync/sessions?since=0")).Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json))
            .GetProperty("sessions").EnumerateArray().Single();

    [Fact]
    public async Task A_malformed_query_is_a_400_not_a_server_error()
    {
        using var api = new ApiFactory();
        var (http, _, _) = await api.SignUpAsync("kai", Logit.Api.Data.Entities.UserTier.Pro);

        var res = await http.GetAsync("/sync/sessions?since=0&clientId=example");
        Assert.Equal(System.Net.HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task An_older_copy_does_not_overwrite_a_newer_edit()
    {
        using var api = new ApiFactory();
        var (http, _, _) = await api.SignUpAsync("kai", Logit.Api.Data.Entities.UserTier.Pro);

        (await http.PostAsJsonAsync("/sync/sessions", new { sessions = new[] { Session("4", 100) } })).EnsureSuccessStatusCode();
        (await http.PostAsJsonAsync("/sync/sessions", new { sessions = new[] { Session("6", 200) } })).EnsureSuccessStatusCode(); // phone B's edit
        (await http.PostAsJsonAsync("/sync/sessions", new { sessions = new[] { Session("4", 100) } })).EnsureSuccessStatusCode(); // phone A re-sends

        var s = await Pulled(http);
        Assert.Contains("\"reps\":6", s.GetProperty("dataJson").GetString());
        Assert.Equal(200, s.GetProperty("updatedAtMs").GetInt64());
    }

    [Fact]
    public async Task A_push_without_a_time_still_wins_for_older_apps()
    {
        using var api = new ApiFactory();
        var (http, _, _) = await api.SignUpAsync("kai", Logit.Api.Data.Entities.UserTier.Pro);
        (await http.PostAsJsonAsync("/sync/sessions", new { sessions = new[] { Session("4", 100) } })).EnsureSuccessStatusCode();
        (await http.PostAsJsonAsync("/sync/sessions", new { sessions = new[] { Session("5", null) } })).EnsureSuccessStatusCode();
        Assert.Contains("\"reps\":5", (await Pulled(http)).GetProperty("dataJson").GetString());
    }
}
