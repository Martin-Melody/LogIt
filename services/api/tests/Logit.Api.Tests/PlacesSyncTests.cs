using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Logit.Api.Data.Entities;

namespace Logit.Api.Tests;

/// Places you train (My gym) sync like habits: pushed rows come back on pull, newest wins,
/// deletes are tombstones, and nobody else can read them.
public class PlacesSyncTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _api;
    public PlacesSyncTests(ApiFactory api) => _api = api;

    private static object Row(string id, long at, string name, long? deletedAt = null) => new
    {
        id, createdAtMs = 1, updatedAtMs = at, deletedAtMs = deletedAt,
        dataJson = JsonSerializer.Serialize(new { id, name, kind = "home", kit = Array.Empty<string>(), machines = Array.Empty<object>() }),
    };

    private static async Task<List<JsonElement>> Pull(HttpClient http) =>
        (await http.GetFromJsonAsync<JsonElement>("/sync/places?since=0")).GetProperty("places").EnumerateArray().ToList();

    [Fact]
    public async Task Places_round_trip_newest_wins_and_stay_private()
    {
        var (me, _, _) = await _api.SignUpAsync("places_me", UserTier.Pro);
        (await me.PostAsJsonAsync("/sync/places", new { places = new[] { Row("place_home", 10, "Home") } })).EnsureSuccessStatusCode();
        (await me.PostAsJsonAsync("/sync/places", new { places = new[] { Row("place_home", 5, "Stale") } })).EnsureSuccessStatusCode();
        var rows = await Pull(me);
        Assert.Single(rows);
        Assert.Contains("\"Home\"", rows[0].GetProperty("dataJson").GetString());

        (await me.PostAsJsonAsync("/sync/places", new { places = new[] { Row("place_home", 20, "Home", deletedAt: 20) } })).EnsureSuccessStatusCode();
        Assert.Equal(20, (await Pull(me))[0].GetProperty("deletedAtMs").GetInt64());

        var (other, _, _) = await _api.SignUpAsync("places_other", UserTier.Pro);
        Assert.Empty(await Pull(other));

        var (free, _, _) = await _api.SignUpAsync("places_free");
        Assert.Equal(HttpStatusCode.Forbidden, (await free.GetAsync("/sync/places?since=0")).StatusCode);
    }
}
