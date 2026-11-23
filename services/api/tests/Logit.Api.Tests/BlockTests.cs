using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Logit.Api.Tests;

/// Blocking keeps its promise ("You won't see each other's posts, comments, or profiles"): a
/// blocked person could still comment, and their comments, likes and notifications stayed.
public class BlockTests
{
    private static async Task<JsonElement> Json(HttpResponseMessage res) =>
        await res.Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);

    [Fact]
    public async Task Blocking_removes_their_likes_comments_and_notifications_and_stops_new_ones()
    {
        using var api = new ApiFactory();
        var (ava, _, _) = await api.SignUpAsync("ava");
        var (dev, _, _) = await api.SignUpAsync("dev");
        var (ben, _, _) = await api.SignUpAsync("ben");
        var post = (await Json(await ava.PostAsJsonAsync("/posts", new { type = "Text", body = "squats" }))).GetProperty("id").GetString();

        (await dev.PostAsync("/users/ava/follow", null)).EnsureSuccessStatusCode();
        (await dev.PostAsync($"/posts/{post}/like", null)).EnsureSuccessStatusCode();
        (await dev.PostAsJsonAsync($"/posts/{post}/comments", new { body = "lol light" })).EnsureSuccessStatusCode();
        (await ben.PostAsJsonAsync($"/posts/{post}/comments", new { body = "nice" })).EnsureSuccessStatusCode();

        (await ava.PostAsync("/users/dev/block", null)).EnsureSuccessStatusCode();

        var seen = await Json(await ava.GetAsync($"/posts/{post}"));
        Assert.Equal(0, seen.GetProperty("likeCount").GetInt32());
        Assert.Equal(1, seen.GetProperty("commentCount").GetInt32()); // Ben's stays
        var notes = await Json(await ava.GetAsync("/notifications"));
        Assert.DoesNotContain("dev", notes.GetRawText());

        Assert.Equal(HttpStatusCode.NotFound, (await dev.PostAsJsonAsync($"/posts/{post}/comments", new { body = "still here" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await dev.PostAsync($"/posts/{post}/like", null)).StatusCode);
    }
}
