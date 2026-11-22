using System.Net.Http.Json;
using System.Text.Json;

namespace Logit.Api.Tests;

/// Follow status everywhere a person is shown: "Follows you" / "Follow back", the real status in
/// followers / following lists (they all said "none"), and "Requested" in search.
public class FollowStatusTests
{
    private static async Task<JsonElement> Get(HttpClient http, string path) =>
        await (await http.GetAsync(path)).Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);

    [Fact]
    public async Task A_profile_says_when_they_follow_you()
    {
        using var api = new ApiFactory();
        var (ava, _, _) = await api.SignUpAsync("ava");
        var (ben, _, _) = await api.SignUpAsync("ben");
        (await ben.PostAsync("/users/ava/follow", null)).EnsureSuccessStatusCode();

        var benSeenByAva = await Get(ava, "/users/ben");
        Assert.True(benSeenByAva.GetProperty("followsYou").GetBoolean());
        Assert.Equal("none", benSeenByAva.GetProperty("followStatus").GetString());
        Assert.False((await Get(ben, "/users/ava")).GetProperty("followsYou").GetBoolean());
    }

    [Fact]
    public async Task Followers_and_following_lists_carry_the_callers_own_status()
    {
        using var api = new ApiFactory();
        var (ava, _, _) = await api.SignUpAsync("ava");
        var (ben, _, _) = await api.SignUpAsync("ben");
        var (cara, _, _) = await api.SignUpAsync("cara");
        (await ben.PostAsync("/users/ava/follow", null)).EnsureSuccessStatusCode();
        (await cara.PostAsync("/users/ava/follow", null)).EnsureSuccessStatusCode();
        (await ava.PostAsync("/users/cara/follow", null)).EnsureSuccessStatusCode();

        var list = (await Get(ava, "/users/ava/followers")).EnumerateArray()
            .ToDictionary(p => p.GetProperty("username").GetString()!, p => p.GetProperty("followStatus").GetString());
        Assert.Equal("none", list["ben"]);
        Assert.Equal("following", list["cara"]);
    }

    [Fact]
    public async Task Search_shows_a_request_already_sent()
    {
        using var api = new ApiFactory();
        var (ben, _, _) = await api.SignUpAsync("ben");
        var (cara, _, _) = await api.SignUpAsync("cara");
        (await cara.PutAsJsonAsync("/users/me/social-settings", new { isPrivate = true })).EnsureSuccessStatusCode();
        (await ben.PostAsync("/users/cara/follow", null)).EnsureSuccessStatusCode();

        var hit = (await Get(ben, "/users/search?q=cara")).EnumerateArray().Single();
        Assert.True(hit.GetProperty("isRequested").GetBoolean());
        Assert.False(hit.GetProperty("isFollowing").GetBoolean());
    }

    [Fact]
    public async Task Suggestions_say_who_follows_you()
    {
        using var api = new ApiFactory();
        var (ava, _, _) = await api.SignUpAsync("ava");
        var (ben, _, _) = await api.SignUpAsync("ben");
        (await ben.PostAsync("/users/ava/follow", null)).EnsureSuccessStatusCode();

        var benCard = (await Get(ava, "/discover/people")).GetProperty("people").EnumerateArray()
            .Select(p => p.GetProperty("user")).Single(u => u.GetProperty("username").GetString() == "ben");
        Assert.True(benCard.GetProperty("followsYou").GetBoolean());
    }
}
