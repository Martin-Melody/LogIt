using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Push;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Logit.Api.Tests;

/// Groups and their chat (design canvas G1–G10, P3; journey F5 in docs/testing-friends.md).
public class GroupTests : IDisposable
{
    private readonly FakePushSender _push = new();
    private readonly ApiFactory _api;

    public GroupTests() => _api = new ApiFactory
    {
        ConfigureTestServices = s =>
        {
            s.AddSingleton<IPushSender>(_push);
            s.Remove(s.Single(d => d.ImplementationType == typeof(PushDispatcher)));
        },
    };

    public void Dispose() => _api.Dispose();

    private static int _n;
    private static async Task<JsonElement> Json(HttpResponseMessage res)
    {
        res.EnsureSuccessStatusCode();
        return await res.Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);
    }
    private static Task<JsonElement> Get(HttpClient http, string url) => http.GetFromJsonAsync<JsonElement>(url, ApiFactory.Json);
    private static Task<HttpResponseMessage> Say(HttpClient from, string threadId, string body) =>
        from.PostAsJsonAsync("/dm/send", new { threadId, clientId = $"g{Interlocked.Increment(ref _n)}", body });
    private async Task<int> Dispatch() { using var sc = _api.Services.CreateScope(); return await PushDispatcher.DispatchAsync(sc.ServiceProvider, default); }
    private static async Task Phone(HttpClient http, string token)
    {
        (await http.PutAsJsonAsync("/push/devices", new { token, timeZone = "UTC" })).EnsureSuccessStatusCode();
        (await http.PutAsJsonAsync("/push/settings", new { quietOn = false })).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task An_organiser_makes_a_group_people_join_with_its_link_and_talk_in_its_chat()
    {
        var (conor, _, _) = await _api.SignUpAsync("conor");
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var (dev, _, _) = await _api.SignUpAsync("dev");

        var group = await Json(await conor.PostAsJsonAsync("/groups", new { name = "  Iron Club ", kind = "gym", place = "Dublin 8" }));
        var id = group.GetProperty("id").GetString();
        var code = group.GetProperty("inviteCode").GetString();
        var thread = group.GetProperty("threadId").GetString()!;
        Assert.Equal(("Iron Club", "Gym", "Organiser", 1), (group.GetProperty("name").GetString(), group.GetProperty("kind").GetString(),
            group.GetProperty("me").GetProperty("role").GetString(), group.GetProperty("members").GetInt32()));

        // Outsiders see nothing but the join preview, even signed out.
        Assert.Equal(HttpStatusCode.NotFound, (await dev.GetAsync($"/groups/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Say(dev, thread, "hi")).StatusCode);
        var preview = await Get(_api.CreateClient(), $"/groups/join/{code}");
        Assert.Equal(("Iron Club", 1, "conor"), (preview.GetProperty("name").GetString(), preview.GetProperty("members").GetInt32(), preview.GetProperty("organiser").GetString()));

        // Ava joins off the board; the chat starts with nothing unread for her.
        (await Say(conor, thread, "Saturday 9:00, who's in?")).EnsureSuccessStatusCode();
        (await ava.PostAsJsonAsync($"/groups/join/{code}", new { onBoard = false })).EnsureSuccessStatusCode();
        var mine = await Get(ava, $"/groups/{id}");
        Assert.Equal((2, false, "Important"), (mine.GetProperty("members").GetInt32(), mine.GetProperty("me").GetProperty("onBoard").GetBoolean(),
            mine.GetProperty("me").GetProperty("notify").GetString()));
        Assert.Equal(0, (await Get(ava, "/dm/unread")).GetProperty("chats").GetInt32());

        // Messages carry who sent them; the list shows the group and the last sender.
        (await Say(ava, thread, "In")).EnsureSuccessStatusCode();
        var chat = await Get(conor, $"/dm/chat?threadId={thread}");
        Assert.Equal("Iron Club", chat.GetProperty("group").GetProperty("name").GetString());
        var said = chat.GetProperty("messages");
        Assert.Equal(JsonValueKind.Null, said[0].GetProperty("from").ValueKind); // mine
        Assert.Equal("ava", said[1].GetProperty("from").GetProperty("username").GetString());
        var list = (await Get(conor, "/dm/threads?box=chats"))[0];
        Assert.Equal(("Iron Club", "ava", "In", true), (list.GetProperty("group").GetProperty("name").GetString(), list.GetProperty("lastBy").GetString(),
            list.GetProperty("lastBody").GetString(), list.GetProperty("unread").GetBoolean()));
        Assert.Equal(1, (await Get(conor, "/dm/unread")).GetProperty("chats").GetInt32());

        // Members can't do organiser things; resetting the link stops the old one.
        Assert.Equal(HttpStatusCode.Forbidden, (await ava.PutAsJsonAsync($"/groups/{id}/note", new { text = "hi" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await ava.DeleteAsync($"/groups/{id}/members/conor")).StatusCode);
        (await conor.PostAsync($"/groups/{id}/invite/reset", null)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await dev.PostAsJsonAsync($"/groups/join/{code}", new { })).StatusCode);

        // Ava leaves: out of the page and the chat.
        (await ava.DeleteAsync($"/groups/{id}/members/ava")).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await ava.GetAsync($"/groups/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Say(ava, thread, "back?")).StatusCode);
        Assert.Empty((await Get(ava, "/dm/threads?box=chats")).EnumerateArray());

        // The last one out deletes the group with its chat.
        (await conor.DeleteAsync($"/groups/{id}/members/conor")).EnsureSuccessStatusCode();
        await _api.WithDbAsync(async db =>
        {
            Assert.Equal(0, await db.Groups.CountAsync());
            Assert.Equal(0, await db.DirectMessages.CountAsync());
        });
    }

    [Fact]
    public async Task Organisers_manage_members_and_the_group_always_keeps_one()
    {
        var (conor, _, _) = await _api.SignUpAsync("conor");
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var (ben, _, _) = await _api.SignUpAsync("ben");
        var group = await Json(await conor.PostAsJsonAsync("/groups", new { name = "Iron Club" }));
        var (id, code) = (group.GetProperty("id").GetString(), group.GetProperty("inviteCode").GetString());
        (await ava.PostAsJsonAsync($"/groups/join/{code}", new { })).EnsureSuccessStatusCode();
        (await ben.PostAsJsonAsync($"/groups/join/{code}", new { })).EnsureSuccessStatusCode();

        (await conor.PutAsJsonAsync($"/groups/{id}/members/ava/role", new { role = "Organiser" })).EnsureSuccessStatusCode();
        (await ava.DeleteAsync($"/groups/{id}/members/ben")).EnsureSuccessStatusCode(); // Ava can remove now
        Assert.Equal(["conor", "ava"], (await Get(conor, $"/groups/{id}/members")).EnumerateArray()
            .Select(m => m.GetProperty("user").GetProperty("username").GetString()).OrderByDescending(n => n).ToList());

        // Both organisers leave in turn: Ava ends up organiser after Conor goes, then... she's alone.
        (await conor.PutAsJsonAsync($"/groups/{id}/members/ava/role", new { role = "Member" })).EnsureSuccessStatusCode();
        (await conor.DeleteAsync($"/groups/{id}/members/conor")).EnsureSuccessStatusCode();
        Assert.Equal("Organiser", (await Get(ava, $"/groups/{id}")).GetProperty("me").GetProperty("role").GetString());

        // Pinning a note tells members who want notes; Off gets nothing.
        (await ben.PostAsJsonAsync($"/groups/join/{code}", new { })).EnsureSuccessStatusCode();
        (await ava.PutAsJsonAsync($"/groups/{id}/note", new { text = "Open 7–14 on Monday" })).EnsureSuccessStatusCode();
        (await ben.PutAsJsonAsync($"/groups/{id}/me", new { notify = "Off" })).EnsureSuccessStatusCode();
        (await ava.PutAsJsonAsync($"/groups/{id}/note", new { text = "Racks 3 and 4 out Tuesday" })).EnsureSuccessStatusCode();
        var page = await Get(ben, $"/groups/{id}");
        Assert.Equal(("Racks 3 and 4 out Tuesday", "ava"), (page.GetProperty("note").GetProperty("text").GetString(), page.GetProperty("note").GetProperty("by").GetProperty("username").GetString()));
        await _api.WithDbAsync(async db => Assert.Equal(1, await db.Notifications.CountAsync(n => n.Type == NotificationType.GroupNote)));

        // Members can report the group; outsiders can't.
        var (dev, _, _) = await _api.SignUpAsync("dev");
        var report = new { targetType = "Group", targetId = id, reason = "Spam" };
        Assert.Equal(HttpStatusCode.NoContent, (await ben.PostAsJsonAsync("/reports", report)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await dev.PostAsJsonAsync("/reports", report)).StatusCode);
    }

    [Fact]
    public async Task A_blocked_members_messages_are_hidden_for_you_only_and_pushes_follow_each_members_choice()
    {
        var (conor, _, _) = await _api.SignUpAsync("conor");
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var (dev, _, _) = await _api.SignUpAsync("dev");
        var group = await Json(await conor.PostAsJsonAsync("/groups", new { name = "Iron Club" }));
        var (id, code, thread) = (group.GetProperty("id").GetString(), group.GetProperty("inviteCode").GetString(), group.GetProperty("threadId").GetString()!);
        (await ava.PostAsJsonAsync($"/groups/join/{code}", new { })).EnsureSuccessStatusCode();
        (await dev.PostAsJsonAsync($"/groups/join/{code}", new { })).EnsureSuccessStatusCode();
        await Phone(ava, "ava-phone");
        await Phone(dev, "dev-phone");
        (await dev.PutAsJsonAsync($"/groups/{id}/me", new { notify = "All" })).EnsureSuccessStatusCode();

        // Ava keeps the default (events, notes and mentions): only "@ava" reaches her.
        (await Say(conor, thread, "Saturday 9:00, who's in?")).EnsureSuccessStatusCode();
        (await Say(conor, thread, "@Ava you coming?")).EnsureSuccessStatusCode();
        await Dispatch();
        Assert.Equal(("Iron Club", "conor mentioned you"), _push.Sent.Where(p => p.Token == "ava-phone").Select(p => (p.Message.Title, p.Message.Body)).Single());
        Assert.Equal("2 new messages", _push.Sent.Single(p => p.Token == "dev-phone").Message.Body);

        // Ava blocks Dev: his messages vanish for her (not for Conor) and never count or push.
        (await ava.PostAsync("/users/dev/block", null)).EnsureSuccessStatusCode();
        (await ava.PostAsync($"/dm/threads/{thread}/read", null)).EnsureSuccessStatusCode();
        (await Say(dev, thread, "hello all")).EnsureSuccessStatusCode();
        Assert.DoesNotContain("hello all", (await Get(ava, $"/dm/chat?threadId={thread}")).GetProperty("messages").EnumerateArray().Select(m => m.GetProperty("body").GetString()));
        Assert.Contains("hello all", (await Get(conor, $"/dm/chat?threadId={thread}")).GetProperty("messages").EnumerateArray().Select(m => m.GetProperty("body").GetString()));
        Assert.Equal(0, (await Get(ava, "/dm/unread")).GetProperty("chats").GetInt32());
        (await ava.PutAsJsonAsync($"/groups/{id}/me", new { notify = "All" })).EnsureSuccessStatusCode();
        _push.Sent.Clear();
        await Dispatch();
        Assert.DoesNotContain(_push.Sent, p => p.Token == "ava-phone");
    }

    [Fact]
    public void Mentions_need_the_whole_username_after_an_at() =>
        Assert.Equal([true, true, false, false, false], new[] { "@ava hi", "hey @AVA!", "email@ava.ie", "@avalanche", "ava" }
            .Select(b => PushDispatcher.Mentions(b, "ava")));

    [Fact]
    public async Task Deleting_a_group_or_an_account_that_was_its_only_member_removes_it()
    {
        var (conor, _, _) = await _api.SignUpAsync("conor");
        var (ava, _, _) = await _api.SignUpAsync("ava");
        const string pw = "Passw0rd!long";
        var group = await Json(await conor.PostAsJsonAsync("/groups", new { name = "Iron Club" }));
        var code = group.GetProperty("inviteCode").GetString();
        (await ava.PostAsJsonAsync($"/groups/join/{code}", new { })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Forbidden, (await ava.DeleteAsync($"/groups/{group.GetProperty("id").GetString()}")).StatusCode);
        (await conor.DeleteAsync($"/groups/{group.GetProperty("id").GetString()}")).EnsureSuccessStatusCode();
        Assert.Empty((await Get(ava, "/groups")).EnumerateArray());

        await Json(await ava.PostAsJsonAsync("/groups", new { name = "Just me" }));
        var req = new HttpRequestMessage(HttpMethod.Delete, "/auth/account") { Content = JsonContent.Create(new { password = pw }) };
        Assert.Equal(HttpStatusCode.NoContent, (await ava.SendAsync(req)).StatusCode);
        await _api.WithDbAsync(async db => Assert.Equal(0, await db.Groups.CountAsync()));
    }
}
