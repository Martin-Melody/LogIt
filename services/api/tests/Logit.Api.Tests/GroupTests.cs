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

    [Fact]
    public async Task Findable_groups_show_in_search_and_ask_to_join_waits_for_an_organiser()
    {
        var (conor, _, _) = await _api.SignUpAsync("conor");
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var (ben, _, _) = await _api.SignUpAsync("ben");
        var hidden = await Json(await conor.PostAsJsonAsync("/groups", new { name = "Iron Secret", place = "Dublin 8" }));
        var ask = await Json(await conor.PostAsJsonAsync("/groups", new { name = "Iron Club", place = "Dublin 8", access = "Request" }));
        var open = await Json(await conor.PostAsJsonAsync("/groups", new { name = "Phoenix Runners", place = "Dublin 7", access = "Open" }));
        var (hiddenId, askId, openId) = (hidden.GetProperty("id").GetString(), ask.GetProperty("id").GetString(), open.GetProperty("id").GetString());

        // Invite-only groups never show; findable ones match on name or place.
        var found = (await Get(ava, "/groups/search?q=dublin")).EnumerateArray().Select(g => g.GetProperty("name").GetString()).ToList();
        Assert.Equal(["Iron Club", "Phoenix Runners"], found.OrderBy(n => n).ToList());
        Assert.Equal(HttpStatusCode.NotFound, (await ava.GetAsync($"/groups/{hiddenId}/about")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await ava.PostAsJsonAsync($"/groups/{hiddenId}/join", new { })).StatusCode);

        // Open: straight in. Ask: a request, which the organiser sees and approves.
        Assert.Equal("member", (await Json(await ava.PostAsJsonAsync($"/groups/{openId}/join", new { }))).GetProperty("status").GetString());
        Assert.Equal("requested", (await Json(await ava.PostAsJsonAsync($"/groups/{askId}/join", new { onBoard = false }))).GetProperty("status").GetString());
        Assert.True((await Get(ava, $"/groups/{askId}/about")).GetProperty("requested").GetBoolean());
        // Her Sent list (canvas R4) has it until an organiser answers.
        Assert.Equal(askId, (await Get(ava, "/groups/requests/mine")).GetProperty("requests")[0].GetProperty("groupId").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await ava.GetAsync($"/groups/{askId}")).StatusCode);
        Assert.Equal(1, (await Get(conor, $"/groups/{askId}")).GetProperty("requests").GetInt32());
        Assert.Equal(HttpStatusCode.NotFound, (await ben.GetAsync($"/groups/{askId}/requests")).StatusCode); // not a member
        Assert.Equal("ava", (await Get(conor, $"/groups/{askId}/requests"))[0].GetProperty("user").GetProperty("username").GetString());
        (await conor.PostAsync($"/groups/{askId}/requests/ava", null)).EnsureSuccessStatusCode();
        var page = await Get(ava, $"/groups/{askId}");
        Assert.False(page.GetProperty("me").GetProperty("onBoard").GetBoolean()); // her choice when asking
        await _api.WithDbAsync(async db =>
        {
            Assert.Equal(1, await db.Notifications.CountAsync(n => n.Type == NotificationType.GroupApproved));
            Assert.Equal(0, await db.Notifications.CountAsync(n => n.Type == NotificationType.GroupRequest)); // dealt with
        });

        // Ben asks and Conor declines: nobody's told, Ben can ask again.
        (await ben.PostAsJsonAsync($"/groups/{askId}/join", new { })).EnsureSuccessStatusCode();
        (await conor.DeleteAsync($"/groups/{askId}/requests/ben")).EnsureSuccessStatusCode();
        Assert.False((await Get(ben, $"/groups/{askId}/about")).GetProperty("requested").GetBoolean());
    }

    [Fact]
    public async Task A_member_invites_someone_from_a_chat_and_they_join_an_invite_only_group()
    {
        var (conor, _, _) = await _api.SignUpAsync("conor");
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var (ben, _, _) = await _api.SignUpAsync("ben");
        (await ben.PostAsync("/users/ava/follow", null)).EnsureSuccessStatusCode();
        var group = await Json(await conor.PostAsJsonAsync("/groups", new { name = "Iron Club" }));
        var (id, code) = (group.GetProperty("id").GetString(), group.GetProperty("inviteCode").GetString());
        (await ava.PostAsJsonAsync($"/groups/join/{code}", new { })).EnsureSuccessStatusCode();
        (await conor.PostAsync($"/groups/{id}/invite/reset", null)).EnsureSuccessStatusCode(); // the old link is dead

        // Ben (not a member) can't send an invite; Ava can, and the card carries the group.
        var (_, _, _) = await _api.SignUpAsync("dev");
        (await ben.PostAsync("/users/dev/follow", null)).EnsureSuccessStatusCode();
        var card = new { username = "ben", clientId = "inv1", body = "", cardType = "GroupInvite", cardJson = JsonSerializer.Serialize(new { groupId = id }) };
        Assert.Equal(HttpStatusCode.NotFound, (await ben.PostAsJsonAsync("/dm/send", card with { username = "dev", clientId = "inv0" })).StatusCode);
        var sent = await Json(await ava.PostAsJsonAsync("/dm/send", card));
        Assert.Equal("Iron Club", JsonDocument.Parse(sent.GetProperty("cardJson").GetString()!).RootElement.GetProperty("name").GetString());
        Assert.Equal("Sent a group invite", (await Get(ben, "/dm/threads?box=chats"))[0].GetProperty("lastBody").GetString());

        var about = await Get(ben, $"/groups/{id}/about");
        Assert.Equal("ava", about.GetProperty("invitedBy").GetString());
        Assert.Equal("member", (await Json(await ben.PostAsJsonAsync($"/groups/{id}/join", new { }))).GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, (await ava.PostAsJsonAsync("/dm/send", card with { clientId = "inv2" })).StatusCode); // already in
    }

    [Fact]
    public async Task Moderators_remove_messages_mute_people_and_work_the_groups_reports_but_cannot_run_the_group()
    {
        var (conor, _, _) = await _api.SignUpAsync("conor");
        var (riya, _, _) = await _api.SignUpAsync("riya");
        var (dev, _, _) = await _api.SignUpAsync("dev");
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var group = await Json(await conor.PostAsJsonAsync("/groups", new { name = "Iron Club" }));
        var (id, code, thread) = (group.GetProperty("id").GetString(), group.GetProperty("inviteCode").GetString(), group.GetProperty("threadId").GetString()!);
        foreach (var who in new[] { riya, dev, ava }) (await who.PostAsJsonAsync($"/groups/join/{code}", new { })).EnsureSuccessStatusCode();
        (await conor.PutAsJsonAsync($"/groups/{id}/members/riya/role", new { role = "Moderator" })).EnsureSuccessStatusCode();

        // Ava reports Dev's spam: it reaches LogIt and the group's list (organiser and moderator told, not who reported).
        var spam = await Json(await Say(dev, thread, "Selling cheap pre-workout, DM me"));
        (await ava.PostAsJsonAsync("/reports", new { targetType = "Message", targetId = spam.GetProperty("id").GetString(), reason = "Spam" })).EnsureSuccessStatusCode();
        Assert.Equal(1, (await Get(riya, $"/groups/{id}")).GetProperty("reports").GetInt32());
        var list = await Get(riya, $"/groups/{id}/reports");
        Assert.Equal(("Selling cheap pre-workout, DM me", "dev"), (list[0].GetProperty("body").GetString(), list[0].GetProperty("sender").GetProperty("username").GetString()));
        Assert.DoesNotContain("\"ava\"", list.GetRawText()); // never who reported it
        Assert.Equal(HttpStatusCode.Forbidden, (await dev.GetAsync($"/groups/{id}/reports")).StatusCode);
        await _api.WithDbAsync(async db => Assert.Equal(2, await db.Notifications.CountAsync(n => n.Type == NotificationType.GroupReport)));

        // Riya removes it ("Removed by a moderator") and mutes Dev for an hour: he can read, not send.
        (await riya.DeleteAsync($"/groups/{id}/messages/{spam.GetProperty("id").GetString()}")).EnsureSuccessStatusCode();
        var removed = (await Get(ava, $"/dm/chat?threadId={thread}")).GetProperty("messages")[0];
        Assert.Equal((true, true, ""), (removed.GetProperty("deleted").GetBoolean(), removed.GetProperty("removedByModerator").GetBoolean(), removed.GetProperty("body").GetString()));
        Assert.Equal(0, (await Get(riya, $"/groups/{id}")).GetProperty("reports").GetInt32());
        (await riya.PutAsJsonAsync($"/groups/{id}/members/dev/mute", new { minutes = 60 })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Forbidden, (await Say(dev, thread, "hello?")).StatusCode);
        var devChat = await Get(dev, $"/dm/chat?threadId={thread}");
        Assert.Equal((false, JsonValueKind.Number), (devChat.GetProperty("canSend").GetBoolean(), devChat.GetProperty("mutedUntilMs").ValueKind));
        (await riya.PutAsJsonAsync($"/groups/{id}/members/dev/mute", new { minutes = (int?)null })).EnsureSuccessStatusCode();
        (await Say(dev, thread, "sorry")).EnsureSuccessStatusCode();

        // Moderators can't run the group: no roles, edits, or removing an organiser; they can remove a member.
        Assert.Equal(HttpStatusCode.Forbidden, (await riya.PutAsJsonAsync($"/groups/{id}/members/ava/role", new { role = "Moderator" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await riya.PatchAsJsonAsync($"/groups/{id}", new { name = "Riya's Club" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await riya.DeleteAsync($"/groups/{id}/members/conor")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await riya.PutAsJsonAsync($"/groups/{id}/members/conor/mute", new { minutes = 60 })).StatusCode);
        (await riya.DeleteAsync($"/groups/{id}/members/dev")).EnsureSuccessStatusCode();
        var members = (await Get(conor, $"/groups/{id}/members")).EnumerateArray().Select(m => (m.GetProperty("user").GetProperty("username").GetString(), m.GetProperty("role").GetString())).ToList();
        Assert.Equal([("conor", "Organiser"), ("riya", "Moderator"), ("ava", "Member")], members);
    }
}
