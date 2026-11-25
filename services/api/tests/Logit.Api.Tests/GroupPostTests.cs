using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Social;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Tests;

/// Posts in groups (design canvas Q1–Q7; Martin's notes 25 Nov).
public class GroupPostTests : IDisposable
{
    private readonly ApiFactory _api = new();
    public void Dispose() => _api.Dispose();

    private static async Task<JsonElement> Json(HttpResponseMessage res)
    {
        res.EnsureSuccessStatusCode();
        return await res.Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);
    }
    private static Task<JsonElement> Get(HttpClient http, string url) => http.GetFromJsonAsync<JsonElement>(url, ApiFactory.Json);

    private async Task<(HttpClient Conor, HttpClient Ava, HttpClient Kate, string Group)> SetUp(string access = "Request")
    {
        var (conor, _, _) = await _api.SignUpAsync("conor");
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var (kate, _, _) = await _api.SignUpAsync("kate"); // not a member
        var g = await Json(await conor.PostAsJsonAsync("/groups", new { name = "Iron Club", place = "Sligo", access }));
        (await ava.PostAsJsonAsync($"/groups/join/{g.GetProperty("inviteCode").GetString()}", new { })).EnsureSuccessStatusCode();
        return (conor, ava, kate, g.GetProperty("id").GetString()!);
    }

    [Fact]
    public async Task Anyone_signed_in_reads_posts_and_comments_in_a_findable_group_and_replies_nest()
    {
        var (conor, ava, kate, g) = await SetUp();
        var post = await Json(await ava.PostAsJsonAsync($"/groups/{g}/posts", new { title = "Best gyms in Sligo for powerlifting?", body = "Moving in January.", kind = "Question" }));
        var id = post.GetProperty("id").GetString();
        Assert.Equal("best-gyms-in-sligo-for-powerlifting", post.GetProperty("slug").GetString());

        // Kate (outside the group) reads and comments, shown as not a member; Ava's own kind is offered next time.
        var c1 = await Json(await kate.PostAsJsonAsync($"/group-posts/{id}/comments", new { body = "Wine St is great." }));
        Assert.False(c1.GetProperty("authorIsMember").GetBoolean());
        var c2 = await Json(await conor.PostAsJsonAsync($"/group-posts/{id}/comments", new { body = "€10 a day.", parentId = c1.GetProperty("id").GetString() }));
        await Json(await ava.PostAsJsonAsync($"/group-posts/{id}/comments", new { body = "Thanks both", parentId = c2.GetProperty("id").GetString() }));
        var thread = await Get(kate, $"/group-posts/{id}");
        var comments = thread.GetProperty("comments").EnumerateArray().ToList();
        Assert.Equal(3, comments.Count);
        Assert.Equal(c2.GetProperty("id").GetString(), comments.Single(c => c.GetProperty("body").GetString() == "Thanks both").GetProperty("parentId").GetString());
        Assert.Equal(3, thread.GetProperty("post").GetProperty("commentCount").GetInt32());
        // Replies notify whoever they answer: Ava (her post), Kate (her comment), Conor (his comment).
        await _api.WithDbAsync(async db => Assert.Equal(3, await db.Notifications.CountAsync(n => n.Type == NotificationType.GroupPostReply)));

        // Upvotes only, once each.
        Assert.Equal(1, (await Json(await kate.PutAsJsonAsync($"/group-posts/{id}/vote", new { up = true }))).GetProperty("upvotes").GetInt32());
        Assert.Equal(1, (await Json(await kate.PutAsJsonAsync($"/group-posts/{id}/vote", new { up = true }))).GetProperty("upvotes").GetInt32());
        Assert.Equal(0, (await Json(await kate.PutAsJsonAsync($"/group-posts/{id}/vote", new { up = false }))).GetProperty("upvotes").GetInt32());

        // Members-only comments (the post's choice), then the group's setting.
        var quiet = await Json(await ava.PostAsJsonAsync($"/groups/{g}/posts", new { title = "Members only chat", membersOnlyComments = true }));
        Assert.Equal(HttpStatusCode.Forbidden, (await kate.PostAsJsonAsync($"/group-posts/{quiet.GetProperty("id").GetString()}/comments", new { body = "hi" })).StatusCode);
        (await conor.PatchAsJsonAsync($"/groups/{g}", new { whoCanComment = "Members" })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Forbidden, (await kate.PostAsJsonAsync($"/group-posts/{id}/comments", new { body = "again" })).StatusCode);
        // Anyone signed in posts in a findable group (Kate isn't a member), unless the group keeps it to members.
        var outsider = await Json(await kate.PostAsJsonAsync($"/groups/{g}/posts", new { title = "Visiting Sligo, any open gyms?" }));
        Assert.False(outsider.GetProperty("authorIsMember").GetBoolean());
        (await conor.PatchAsJsonAsync($"/groups/{g}", new { whoCanPost = "Members" })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Forbidden, (await kate.PostAsJsonAsync($"/groups/{g}/posts", new { title = "Again?" })).StatusCode);
        (await conor.PatchAsJsonAsync($"/groups/{g}", new { whoCanPost = "Staff" })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Forbidden, (await ava.PostAsJsonAsync($"/groups/{g}/posts", new { title = "Can I?" })).StatusCode);

        // An invite-only group's posts are members only.
        (await conor.PatchAsJsonAsync($"/groups/{g}", new { access = "InviteOnly" })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await kate.GetAsync($"/group-posts/{id}")).StatusCode);
        Assert.Contains("Question", (await Get(ava, $"/groups/{g}/post-kinds")).EnumerateArray().Select(k => k.GetString()));
    }

    [Fact]
    public async Task Moderators_pin_lock_and_remove_and_reports_on_posts_reach_them()
    {
        var (conor, ava, kate, g) = await SetUp();
        var p1 = (await Json(await ava.PostAsJsonAsync($"/groups/{g}/posts", new { title = "Old one" }))).GetProperty("id").GetString();
        var rules = (await Json(await conor.PostAsJsonAsync($"/groups/{g}/posts", new { title = "House rules", kind = "Info" }))).GetProperty("id").GetString();
        var spam = (await Json(await ava.PostAsJsonAsync($"/groups/{g}/posts", new { title = "Cheap pre-workout" }))).GetProperty("id").GetString();
        (await conor.PutAsJsonAsync($"/group-posts/{rules}/moderation", new { pinned = true })).EnsureSuccessStatusCode();
        Assert.Equal("House rules", (await Get(kate, $"/groups/{g}/posts?sort=new"))[0].GetProperty("title").GetString());
        Assert.Equal(HttpStatusCode.Forbidden, (await ava.PutAsJsonAsync($"/group-posts/{rules}/moderation", new { pinned = false })).StatusCode);

        (await conor.PutAsJsonAsync($"/group-posts/{p1}/moderation", new { locked = true })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Forbidden, (await kate.PostAsJsonAsync($"/group-posts/{p1}/comments", new { body = "late" })).StatusCode);

        (await kate.PostAsJsonAsync("/reports", new { targetType = "GroupPost", targetId = spam, reason = "Spam" })).EnsureSuccessStatusCode();
        var reports = await Get(conor, $"/groups/{g}/reports");
        Assert.Equal(("post", "Cheap pre-workout"), (reports[0].GetProperty("kind").GetString(), reports[0].GetProperty("title").GetString()));
        (await conor.PutAsJsonAsync($"/group-posts/{spam}/moderation", new { remove = true })).EnsureSuccessStatusCode();
        var removed = (await Get(kate, $"/group-posts/{spam}")).GetProperty("post");
        Assert.Equal((true, true, ""), (removed.GetProperty("deleted").GetBoolean(), removed.GetProperty("removedByModerator").GetBoolean(), removed.GetProperty("title").GetString()));
        Assert.Empty((await Get(conor, $"/groups/{g}/reports")).EnumerateArray());
    }

    [Fact]
    public async Task Posts_in_a_findable_group_are_public_on_the_web_and_search_finds_posts()
    {
        var (conor, ava, kate, g) = await SetUp();
        var settings = await Get(conor, $"/groups/{g}");
        Assert.True(settings.GetProperty("posts").GetProperty("onWeb").GetBoolean());
        var slug = settings.GetProperty("posts").GetProperty("slug").GetString();
        var post = await Json(await ava.PostAsJsonAsync($"/groups/{g}/posts", new { title = "Best gyms in Sligo?", body = "Platforms please" }));
        Assert.True(post.GetProperty("onWeb").GetBoolean());

        var anon = _api.CreateClient();
        string PostSlug(JsonElement p) => $"{p.GetProperty("slug").GetString()}-{p.GetProperty("id").GetString()!.Replace("-", "")[..8]}";
        var page = await Get(anon, $"/public/groups/{slug}/posts/{PostSlug(post)}");
        Assert.Equal("Best gyms in Sligo?", page.GetProperty("post").GetProperty("title").GetString());
        Assert.Single((await Get(anon, "/public/group-posts")).EnumerateArray());

        // Invite-only: nothing on the web.
        (await conor.PatchAsJsonAsync($"/groups/{g}", new { access = "InviteOnly" })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync($"/public/groups/{slug}/posts/{PostSlug(post)}")).StatusCode);
        Assert.Empty((await Get(anon, "/public/group-posts")).EnumerateArray());
        (await conor.PatchAsJsonAsync($"/groups/{g}", new { access = "Request" })).EnsureSuccessStatusCode();

        Assert.Equal(["Best gyms in Sligo?"], (await Get(kate, "/group-posts/search?q=gyms sligo")).EnumerateArray().Select(p => p.GetProperty("title").GetString()).ToList());
        Assert.Equal("best-gyms-in-sligo", GroupPostEndpoints.Slugify("Best gyms in Sligo?"));
        Assert.Equal("cafe-creme-squats", GroupPostEndpoints.Slugify("Café crème: squats!"));
    }
}
