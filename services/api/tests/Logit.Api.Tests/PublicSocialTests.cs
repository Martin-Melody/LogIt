using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Logit.Api.Tests;

/// Social on getlogit.app, signed out (design canvas row 20): Explore, the Forum, search, groups.
public class PublicSocialTests : IDisposable
{
    private readonly ApiFactory _api = new();
    public void Dispose() => _api.Dispose();

    private static async Task<JsonElement> Json(HttpResponseMessage res)
    {
        res.EnsureSuccessStatusCode();
        return await res.Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);
    }
    private static Task<JsonElement> Get(HttpClient http, string url) => http.GetFromJsonAsync<JsonElement>(url, ApiFactory.Json);
    private static List<string?> Names(JsonElement list, string prop) => [.. list.EnumerateArray().Select(x => x.GetProperty(prop).GetString())];

    [Fact]
    public async Task Signed_out_you_browse_Discovers_posts_the_Forum_search_and_groups_anyone_can_find()
    {
        var (ava, _, _) = await _api.SignUpAsync("ava");     // public, in Discover
        var (ben, _, _) = await _api.SignUpAsync("ben");     // private
        var (cara, _, _) = await _api.SignUpAsync("cara");   // public, out of Discover
        (await ben.PutAsJsonAsync("/users/me/social-settings", new { isPrivate = true })).EnsureSuccessStatusCode();
        (await cara.PutAsJsonAsync("/users/me/social-settings", new { showInDiscover = false })).EnsureSuccessStatusCode();
        foreach (var (who, text) in new[] { (ava, "Sunset run around Sligo #sligo"), (ben, "Private squats in Sligo"), (cara, "Quiet day in Sligo") })
            await Json(await who.PostAsJsonAsync("/posts", new { type = "Text", body = text }));

        var club = await Json(await ava.PostAsJsonAsync("/groups", new { name = "Iron Club", kind = "Gym", place = "Sligo", access = "Request" }));
        var secret = await Json(await ben.PostAsJsonAsync("/groups", new { name = "Sligo Secret Lifters", place = "Sligo", access = "InviteOnly" }));
        await Json(await ava.PostAsJsonAsync("/forum", new { title = "Best gyms in Sligo?", tags = new[] { "sligo" }, groupId = club.GetProperty("id").GetString() }));
        await Json(await ben.PostAsJsonAsync("/forum", new { title = "Secret plans", groupId = secret.GetProperty("id").GetString() }));
        await Json(await ava.PostAsJsonAsync($"/groups/{club.GetProperty("id").GetString()}/events", new { title = "Saturday session", startsAt = DateTime.UtcNow.AddDays(3), place = "The gym" }));

        var anon = _api.CreateClient();
        Assert.Equal(["Sunset run around Sligo #sligo"], Names((await Get(anon, "/public/explore")).GetProperty("posts"), "body"));
        Assert.Equal(["Best gyms in Sligo?"], Names(await Get(anon, "/public/forum-list"), "title"));
        var rail = await Get(anon, "/public/rail");
        Assert.Equal(["ava"], Names(rail.GetProperty("people"), "username"));
        Assert.Equal("sligo", rail.GetProperty("trending")[0].GetProperty("tag").GetString());

        var found = await Get(anon, "/public/search?q=sligo");
        Assert.Equal(["Iron Club"], Names(found.GetProperty("groups"), "name"));
        Assert.Equal(["Best gyms in Sligo?"], Names(found.GetProperty("forum"), "title"));
        Assert.Equal(["Sunset run around Sligo #sligo"], Names(found.GetProperty("posts"), "body"));
        Assert.Equal("sligo", found.GetProperty("tags")[0].GetProperty("tag").GetString());
        Assert.Equal(["cara"], Names((await Get(anon, "/public/search?q=car")).GetProperty("people"), "username"));
        Assert.Empty((await Get(anon, "/public/search?q=ben")).GetProperty("people").EnumerateArray());

        var groups = await Get(anon, "/public/groups");
        Assert.Equal(["Iron Club"], Names(groups, "name"));
        var path = groups[0].GetProperty("webPath").GetString()!;
        Assert.StartsWith("/groups/iron-club-", path);
        var page = await Get(anon, $"/public{path}");
        Assert.Equal(("Iron Club", "ava"), (page.GetProperty("group").GetProperty("name").GetString(), page.GetProperty("organiser").GetString()));
        Assert.Equal(["Saturday session"], Names(page.GetProperty("events"), "title"));
        Assert.Equal(["Best gyms in Sligo?"], Names(page.GetProperty("posts"), "title"));
        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync($"/public{path[..^1]}x")).StatusCode);
        var secretPath = $"/public/groups/sligo-secret-lifters-{secret.GetProperty("id").GetString()!.Replace("-", "")[..8]}";
        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync(secretPath)).StatusCode);
    }
}
