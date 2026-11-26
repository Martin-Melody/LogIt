using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Social;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Tests;

/// The Forum (design canvas row 19; Martin, 25 Nov): posts with or without a group, #tags, title
/// cards in the feed, moderation, the web.
public class ForumTests : IDisposable
{
    private readonly ApiFactory _api = new();
    public void Dispose() => _api.Dispose();

    private static async Task<JsonElement> Json(HttpResponseMessage res)
    {
        res.EnsureSuccessStatusCode();
        return await res.Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);
    }
    private static Task<JsonElement> Get(HttpClient http, string url) => http.GetFromJsonAsync<JsonElement>(url, ApiFactory.Json);
    private static List<string?> Titles(JsonElement list) => [.. list.EnumerateArray().Select(p => p.GetProperty("title").GetString())];

    private async Task<(HttpClient Conor, HttpClient Ava, HttpClient Kate, string Group)> SetUp(string access = "Request")
    {
        var (conor, _, _) = await _api.SignUpAsync("conor");
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var (kate, _, _) = await _api.SignUpAsync("kate"); // not in the group
        var g = await Json(await conor.PostAsJsonAsync("/groups", new { name = "Iron Club", place = "Sligo", access }));
        (await ava.PostAsJsonAsync($"/groups/join/{g.GetProperty("inviteCode").GetString()}", new { })).EnsureSuccessStatusCode();
        return (conor, ava, kate, g.GetProperty("id").GetString()!);
    }

    [Fact]
    public async Task Anyone_posts_without_a_group_with_tags_replies_nest_and_followers_see_a_title_card()
    {
        var (conor, ava, kate, _) = await SetUp();
        var post = await Json(await kate.PostAsJsonAsync("/forum", new { title = "Best gyms in Sligo for powerlifting?", body = "Moving in January.", tags = new[] { "#Sligo", "gyms", "not a tag", "gyms" } }));
        var id = post.GetProperty("id").GetString();
        Assert.Equal(JsonValueKind.Null, post.GetProperty("group").ValueKind);
        Assert.Equal(["sligo", "gyms"], post.GetProperty("tags").EnumerateArray().Select(t => t.GetString()).ToList());
        Assert.StartsWith("/forum/best-gyms-in-sligo-for-powerlifting-", post.GetProperty("webPath").GetString());

        // Replies nest, and notify whoever they answer.
        var c1 = await Json(await ava.PostAsJsonAsync($"/forum/{id}/comments", new { body = "Wine St is great." }));
        var c2 = await Json(await conor.PostAsJsonAsync($"/forum/{id}/comments", new { body = "€10 a day.", parentId = c1.GetProperty("id").GetString() }));
        await Json(await kate.PostAsJsonAsync($"/forum/{id}/comments", new { body = "Thanks both", parentId = c2.GetProperty("id").GetString() }));
        var thread = await Get(conor, $"/forum/{id}");
        Assert.Equal(c2.GetProperty("id").GetString(), thread.GetProperty("comments").EnumerateArray().Single(c => c.GetProperty("body").GetString() == "Thanks both").GetProperty("parentId").GetString());
        await _api.WithDbAsync(async db => Assert.Equal(3, await db.Notifications.CountAsync(n => n.Type == NotificationType.GroupPostReply)));

        // Upvotes only, once each.
        Assert.Equal(1, (await Json(await ava.PutAsJsonAsync($"/forum/{id}/vote", new { up = true }))).GetProperty("upvotes").GetInt32());
        Assert.Equal(1, (await Json(await ava.PutAsJsonAsync($"/forum/{id}/vote", new { up = true }))).GetProperty("upvotes").GetInt32());

        // In the Forum, on Kate's profile, and as a title card only for people who follow her.
        Assert.Equal(["Best gyms in Sligo for powerlifting?"], Titles(await Get(conor, "/forum?sort=new")));
        Assert.Single((await Get(conor, "/forum?user=kate")).EnumerateArray());
        (await ava.PostAsync("/users/kate/follow", null)).EnsureSuccessStatusCode();
        Assert.Equal(["Best gyms in Sligo for powerlifting?"], Titles((await Get(ava, "/posts/feed")).GetProperty("forum")));
        Assert.Empty((await Get(conor, "/posts/feed")).GetProperty("forum").EnumerateArray());

        // A regular post's #words are tags too; tag pages, suggestions and search share them.
        await Json(await ava.PostAsJsonAsync("/posts", new { type = "Text", body = "Leg day in #sligo #Legs" }));
        Assert.Equal(("sligo", 2), ((await Get(conor, "/tags?q=SL"))[0].GetProperty("tag").GetString(), (await Get(conor, "/tags?q=sl"))[0].GetProperty("count").GetInt32()));
        var about = await Get(conor, "/tags/Sligo");
        Assert.Equal((1, 1), (about.GetProperty("forumPosts").GetInt32(), about.GetProperty("posts").GetInt32()));
        Assert.Single((await Get(conor, "/tags/sligo/posts")).GetProperty("posts").EnumerateArray());
        Assert.Single((await Get(conor, "/forum?tag=sligo")).EnumerateArray());
        Assert.Single((await Get(conor, "/forum/search?q=%23sligo")).EnumerateArray());
        Assert.Single((await Get(conor, "/forum/search?q=gyms powerlifting")).EnumerateArray());
        Assert.Contains("legs", (await Get(conor, "/tags/trending")).EnumerateArray().Select(t => t.GetProperty("tag").GetString()));

        // Editing the tags moves the post.
        (await kate.PatchAsJsonAsync($"/forum/{id}", new { tags = new[] { "galway" } })).EnsureSuccessStatusCode();
        Assert.Empty((await Get(conor, "/forum?tag=sligo")).EnumerateArray());
        Assert.Single((await Get(conor, "/forum?tag=galway")).EnumerateArray());
    }

    [Fact]
    public async Task A_group_is_an_optional_label_and_an_invite_only_groups_posts_stay_inside()
    {
        var (conor, ava, kate, g) = await SetUp();
        // Kate isn't a member but labels her post with a findable group; it shows on its page and in the Forum.
        var outsider = await Json(await kate.PostAsJsonAsync("/forum", new { title = "Visiting Sligo, any open gyms?", groupId = g }));
        Assert.Equal(("Iron Club", false), (outsider.GetProperty("group").GetProperty("name").GetString(), outsider.GetProperty("authorIsMember").GetBoolean()));
        Assert.Single((await Get(ava, $"/forum?group={g}")).EnumerateArray());
        Assert.Single((await Get(ava, "/forum")).EnumerateArray());
        // Members see their group's posts in the feed as title cards.
        Assert.Single((await Get(ava, "/posts/feed")).GetProperty("forum").EnumerateArray());

        // Invite-only: members only, never in the Forum, its tags or the web.
        (await conor.PatchAsJsonAsync($"/groups/{g}", new { access = "InviteOnly" })).EnsureSuccessStatusCode();
        var inside = await Json(await ava.PostAsJsonAsync("/forum", new { title = "Saturday session moved", groupId = g, tags = new[] { "ironclub" } }));
        Assert.False(inside.GetProperty("onWeb").GetBoolean());
        Assert.Equal(HttpStatusCode.NotFound, (await kate.GetAsync($"/forum/{inside.GetProperty("id").GetString()}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await kate.PostAsJsonAsync("/forum", new { title = "Can I?", groupId = g })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await kate.GetAsync($"/forum?group={g}")).StatusCode);
        Assert.Equal(2, (await Get(conor, $"/forum?group={g}")).GetArrayLength());
        Assert.Empty((await Get(conor, "/forum")).EnumerateArray());
        Assert.Empty((await Get(conor, "/forum?tag=ironclub")).EnumerateArray());
        Assert.Single((await Get(conor, "/forum?user=ava")).EnumerateArray());
        Assert.Empty((await Get(kate, "/forum?user=ava")).EnumerateArray());
        Assert.Empty((await Get(_api.CreateClient(), "/public/forum")).EnumerateArray());
    }

    [Fact]
    public async Task Moderators_pin_lock_remove_and_take_tags_off_and_LogIt_moderates_posts_without_a_group()
    {
        var (conor, ava, kate, g) = await SetUp();
        var p1 = (await Json(await ava.PostAsJsonAsync("/forum", new { title = "Old one", groupId = g, tags = new[] { "ironclub", "crypto" } }))).GetProperty("id").GetString();
        var rules = (await Json(await conor.PostAsJsonAsync("/forum", new { title = "House rules", groupId = g }))).GetProperty("id").GetString();
        var spam = (await Json(await ava.PostAsJsonAsync("/forum", new { title = "Cheap pre-workout", groupId = g }))).GetProperty("id").GetString();
        (await conor.PutAsJsonAsync($"/forum/{rules}/moderation", new { pinned = true })).EnsureSuccessStatusCode();
        Assert.Equal("House rules", (await Get(kate, $"/forum?group={g}&sort=new"))[0].GetProperty("title").GetString());
        Assert.Equal(HttpStatusCode.Forbidden, (await ava.PutAsJsonAsync($"/forum/{rules}/moderation", new { pinned = false })).StatusCode);

        (await conor.PutAsJsonAsync($"/forum/{p1}/moderation", new { locked = true, removeTag = "#crypto" })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Forbidden, (await kate.PostAsJsonAsync($"/forum/{p1}/comments", new { body = "late" })).StatusCode);
        Assert.Equal(["ironclub"], (await Get(kate, $"/forum/{p1}")).GetProperty("post").GetProperty("tags").EnumerateArray().Select(t => t.GetString()).ToList());
        Assert.Empty((await Get(kate, "/forum?tag=crypto")).EnumerateArray());

        (await kate.PostAsJsonAsync("/reports", new { targetType = "GroupPost", targetId = spam, reason = "Spam" })).EnsureSuccessStatusCode();
        var reports = await Get(conor, $"/groups/{g}/reports");
        Assert.Equal(("post", "Cheap pre-workout"), (reports[0].GetProperty("kind").GetString(), reports[0].GetProperty("title").GetString()));
        (await conor.PutAsJsonAsync($"/forum/{spam}/moderation", new { remove = true })).EnsureSuccessStatusCode();
        var removed = (await Get(kate, $"/forum/{spam}")).GetProperty("post");
        Assert.Equal((true, true, ""), (removed.GetProperty("deleted").GetBoolean(), removed.GetProperty("removedByModerator").GetBoolean(), removed.GetProperty("title").GetString()));
        Assert.Empty((await Get(conor, $"/groups/{g}/reports")).EnumerateArray());

        // No group: the group's organiser can't touch it, LogIt's admins can.
        var loose = (await Json(await kate.PostAsJsonAsync("/forum", new { title = "Buy followers here" }))).GetProperty("id").GetString();
        Assert.Equal(HttpStatusCode.Forbidden, (await conor.PutAsJsonAsync($"/forum/{loose}/moderation", new { remove = true })).StatusCode);
        var (boss, _, _) = await _api.SignUpAsync("boss");
        await _api.WithDbAsync(async db => { (await db.Users.SingleAsync(u => u.Username == "boss")).IsAdmin = true; await db.SaveChangesAsync(); });
        (await boss.PutAsJsonAsync($"/forum/{loose}/moderation", new { remove = true })).EnsureSuccessStatusCode();
        Assert.True((await Get(kate, $"/forum/{loose}")).GetProperty("post").GetProperty("deleted").GetBoolean());
    }

    [Fact]
    public async Task Forum_posts_and_tags_are_public_on_the_web()
    {
        var (_, ava, kate, _) = await SetUp();
        var post = await Json(await ava.PostAsJsonAsync("/forum", new { title = "Best gyms in Sligo?", body = "Platforms please", tags = new[] { "sligo" } }));
        await Json(await kate.PostAsJsonAsync("/posts", new { type = "Text", body = "Sunset run #sligo" }));
        var anon = _api.CreateClient();
        var path = post.GetProperty("webPath").GetString()!;
        var page = await Get(anon, $"/public/forum/{path[7..]}");
        Assert.Equal("Best gyms in Sligo?", page.GetProperty("post").GetProperty("title").GetString());
        Assert.Equal(path, (await Get(anon, "/public/forum"))[0].GetProperty("path").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync($"/public/forum/{path[7..^1]}x")).StatusCode);

        var tag = await Get(anon, "/public/tags/Sligo");
        Assert.Equal((1, 1), (tag.GetProperty("forum").GetArrayLength(), tag.GetProperty("posts").GetArrayLength()));
        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync("/public/tags/nothing")).StatusCode);
        Assert.Single((await Get(anon, "/public/users/ava")).GetProperty("forum").EnumerateArray());

        Assert.Equal("best-gyms-in-sligo", GroupPostEndpoints.Slugify("Best gyms in Sligo?"));
        Assert.Equal("cafe-creme-squats", GroupPostEndpoints.Slugify("Café crème: squats!"));
        Assert.Equal(["sligo", "éire"], Hashtags.FromText("#Sligo and #éire, #sligo"));
        Assert.Null(Hashtags.Normalize("two words"));
    }
}
