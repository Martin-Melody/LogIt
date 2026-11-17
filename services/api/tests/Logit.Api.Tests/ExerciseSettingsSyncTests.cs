using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Logit.Api.Data.Entities;

namespace Logit.Api.Tests;

/// How each exercise progresses syncs like the other per-item rows: Pro only, newest wins,
/// deletes kept as tombstones so a reset on one phone reaches the others.
public class ExerciseSettingsSyncTests
{
    [Fact]
    public async Task Settings_round_trip_and_the_newest_edit_wins()
    {
        using var factory = new ApiFactory();
        var (http, _, _) = await factory.SignUpAsync("setter", UserTier.Pro);

        var first = new { settings = new[] { new { id = "bench press", createdAtMs = 1, updatedAtMs = 10, dataJson = "{\"repRange\":[5,8]}" } } };
        Assert.Equal(HttpStatusCode.NoContent, (await http.PostAsJsonAsync("/sync/exercise-settings", first)).StatusCode);
        var older = new { settings = new[] { new { id = "bench press", createdAtMs = 1, updatedAtMs = 5, dataJson = "{\"repRange\":[3,5]}" } } };
        await http.PostAsJsonAsync("/sync/exercise-settings", older);

        var pulled = await http.GetFromJsonAsync<JsonElement>("/sync/exercise-settings?since=0", ApiFactory.Json);
        var row = Assert.Single(pulled.GetProperty("settings").EnumerateArray());
        Assert.Equal("bench press", row.GetProperty("id").GetString());
        Assert.Contains("[5,8]", row.GetProperty("dataJson").GetString());
    }

    [Fact]
    public async Task Built_algorithms_round_trip()
    {
        using var factory = new ApiFactory();
        var (http, _, _) = await factory.SignUpAsync("builder", UserTier.Pro);
        var body = new { recipes = new[] { new { id = "rcpp_1", createdAtMs = 1, updatedAtMs = 2, dataJson = "{\"name\":\"My 5/3/1\"}" } } };
        Assert.Equal(HttpStatusCode.NoContent, (await http.PostAsJsonAsync("/sync/progression-recipes", body)).StatusCode);
        var pulled = await http.GetFromJsonAsync<JsonElement>("/sync/progression-recipes?since=0", ApiFactory.Json);
        Assert.Contains("My 5/3/1", Assert.Single(pulled.GetProperty("recipes").EnumerateArray()).GetProperty("dataJson").GetString());
    }

    [Fact]
    public async Task Free_accounts_cannot_sync_them()
    {
        using var factory = new ApiFactory();
        var (http, _, _) = await factory.SignUpAsync("freebie");
        var res = await http.GetAsync("/sync/exercise-settings?since=0");
        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
    }
}
