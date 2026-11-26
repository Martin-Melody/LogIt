using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Logit.Api.Tests;

/// Profiles and posts on the web, signed out (design canvas row 18): public means public
/// everywhere, private means nothing, and the 404 never says which.
public class PublicProfileTests : IDisposable
{
    private readonly ApiFactory _api = new();
    public void Dispose() => _api.Dispose();

    private static async Task<JsonElement> Json(HttpResponseMessage res)
    {
        res.EnsureSuccessStatusCode();
        return await res.Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);
    }

    [Fact]
    public async Task A_public_account_is_on_the_web_and_a_private_one_is_not()
    {
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var (ben, _, _) = await _api.SignUpAsync("ben");
        var (cara, _, _) = await _api.SignUpAsync("cara");
        var post = (await Json(await ava.PostAsJsonAsync("/posts", new { type = "Text", body = "Week 9 done" }))).GetProperty("id").GetString();
        (await ben.PostAsJsonAsync($"/posts/{post}/comments", new { body = "Nice one" })).EnsureSuccessStatusCode();
        await Json(await cara.PostAsJsonAsync("/posts", new { type = "Text", body = "Private thoughts" }));
        (await cara.PutAsJsonAsync("/users/me/social-settings", new { isPrivate = true })).EnsureSuccessStatusCode();
        (await ava.PostAsJsonAsync("/users/cara/follow", new { })).EnsureSuccessStatusCode();

        var anon = _api.CreateClient();
        var page = await Json(await anon.GetAsync("/public/users/ava"));
        Assert.Equal(1, page.GetProperty("profile").GetProperty("posts").GetInt32());
        Assert.Equal("Week 9 done", page.GetProperty("posts")[0].GetProperty("body").GetString());
        Assert.False(page.GetProperty("profile").TryGetProperty("publicProfileJson", out _)); // no gym or progress photo

        var one = await Json(await anon.GetAsync($"/public/users/ava/posts/{post}"));
        Assert.Equal("Nice one", one.GetProperty("comments")[0].GetProperty("body").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync($"/public/users/ben/posts/{post}")).StatusCode); // not ben's

        // Private, and nobody: the same 404. Only accounts that are public and have posted are listed.
        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync("/public/users/cara")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync("/public/users/nobody")).StatusCode);
        var index = (await Json(await anon.GetAsync("/public/users"))).EnumerateArray().Select(r => r.GetProperty("path").GetString()).ToList();
        Assert.Equal(["/@ava"], index);

        // Going private takes it all down.
        (await ava.PutAsJsonAsync("/users/me/social-settings", new { isPrivate = true })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync($"/public/users/ava/posts/{post}")).StatusCode);
        Assert.Empty((await Json(await anon.GetAsync("/public/users"))).EnumerateArray());
    }
}
