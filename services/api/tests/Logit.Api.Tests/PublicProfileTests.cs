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
        Assert.Equal(JsonValueKind.Null, page.GetProperty("profile").GetProperty("publicProfileJson").ValueKind); // no cards yet
        // The training cards they show in the app are on the web too (design canvas PR5).
        (await ava.PatchAsJsonAsync("/users/me", new { publicProfileJson = "{\"widgets\":[]}" })).EnsureSuccessStatusCode();
        Assert.Equal("{\"widgets\":[]}", (await Json(await anon.GetAsync("/public/users/ava"))).GetProperty("profile").GetProperty("publicProfileJson").GetString());

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

    [Fact]
    public async Task A_profile_has_its_post_count_and_who_you_follow_that_follows_it()
    {
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var (ben, _, _) = await _api.SignUpAsync("ben");
        var (cara, _, _) = await _api.SignUpAsync("cara");
        await Json(await ava.PostAsJsonAsync("/posts", new { type = "Text", body = "One" }));
        await Json(await ava.PostAsJsonAsync("/posts", new { type = "Text", body = "Two" }));
        (await cara.PostAsJsonAsync("/users/ava/follow", new { })).EnsureSuccessStatusCode();
        (await ben.PostAsJsonAsync("/users/cara/follow", new { })).EnsureSuccessStatusCode();

        var seen = await Json(await ben.GetAsync("/users/ava"));
        Assert.Equal(2, seen.GetProperty("postCount").GetInt32());
        Assert.Equal(["cara"], seen.GetProperty("followedBy").EnumerateArray().Select(x => x.GetString()).ToList());
        Assert.Equal(1, seen.GetProperty("followedByCount").GetInt32());
        Assert.Equal(0, (await Json(await ava.GetAsync("/users/ava"))).GetProperty("followedByCount").GetInt32());
    }

    [Fact]
    public async Task A_name_cant_be_empty_or_too_long()
    {
        var (ava, _, _) = await _api.SignUpAsync("ava");
        Assert.Equal(HttpStatusCode.BadRequest, (await ava.PatchAsJsonAsync("/users/me", new { displayName = "  " })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await ava.PatchAsJsonAsync("/users/me", new { displayName = new string('a', 61) })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await ava.PatchAsJsonAsync("/users/me", new { bio = new string('a', 501) })).StatusCode);
        (await ava.PatchAsJsonAsync("/users/me", new { displayName = " Ava Kelly ", bio = "Strength" })).EnsureSuccessStatusCode();
        Assert.Equal("Ava Kelly", (await Json(await ava.GetAsync("/users/me"))).GetProperty("displayName").GetString());
    }
}
