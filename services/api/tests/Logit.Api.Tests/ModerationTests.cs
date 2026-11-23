using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Tests;

/// Bug hunt 5.12 and 5.7: you can remove comments on your own post (only report them before),
/// and the server's admin isn't suggested as someone to follow.
public class ModerationTests
{
    private static async Task<JsonElement> Json(HttpResponseMessage res) =>
        await res.Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);

    [Fact]
    public async Task A_posts_author_can_remove_a_comment_on_it_and_nobody_else_can()
    {
        using var api = new ApiFactory();
        var (ava, _, _) = await api.SignUpAsync("ava");
        var (ben, _, _) = await api.SignUpAsync("ben");
        var (cal, _, _) = await api.SignUpAsync("cal");
        var post = (await Json(await ava.PostAsJsonAsync("/posts", new { type = "Text", body = "squats" }))).GetProperty("id").GetString();
        var comment = (await Json(await ben.PostAsJsonAsync($"/posts/{post}/comments", new { body = "rude" }))).GetProperty("id").GetString();

        Assert.Equal(HttpStatusCode.Forbidden, (await cal.DeleteAsync($"/posts/{post}/comments/{comment}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await ava.DeleteAsync($"/posts/{post}/comments/{comment}")).StatusCode);
        Assert.Equal(0, (await Json(await ava.GetAsync($"/posts/{post}"))).GetProperty("commentCount").GetInt32());
    }

    [Fact]
    public async Task The_admin_is_not_suggested()
    {
        using var api = new ApiFactory();
        var (ava, _, _) = await api.SignUpAsync("ava");
        await api.SignUpAsync("boss");
        await api.SignUpAsync("ben");
        await api.WithDbAsync(async db =>
        {
            var boss = await db.Users.SingleAsync(u => u.Username == "boss");
            boss.IsAdmin = true;
            await db.SaveChangesAsync();
        });

        var names = (await Json(await ava.GetAsync("/discover/people"))).GetProperty("people").EnumerateArray()
            .Select(p => p.GetProperty("user").GetProperty("username").GetString()).ToList();
        Assert.Contains("ben", names);
        Assert.DoesNotContain("boss", names);
    }
}
