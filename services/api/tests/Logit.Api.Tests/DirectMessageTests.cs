using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Logit.Api.Features.Push;
using Microsoft.Extensions.DependencyInjection;

namespace Logit.Api.Tests;

/// Messages and message requests (design canvas M1–M3, P2; journey F3 in docs/testing-friends.md).
public class DirectMessageTests : IDisposable
{
    private readonly FakePushSender _push = new();
    private readonly ApiFactory _api;

    public DirectMessageTests() => _api = new ApiFactory
    {
        ConfigureTestServices = s =>
        {
            s.AddSingleton<IPushSender>(_push);
            s.Remove(s.Single(d => d.ImplementationType == typeof(PushDispatcher)));
        },
    };

    public void Dispose() => _api.Dispose();

    private static int _n;
    private static async Task<HttpResponseMessage> Send(HttpClient from, string to, string body, string? clientId = null) =>
        await from.PostAsJsonAsync("/dm/send", new { username = to, clientId = clientId ?? $"c{Interlocked.Increment(ref _n)}", body });

    private static async Task<JsonElement> Get(HttpClient http, string url) => await http.GetFromJsonAsync<JsonElement>(url, ApiFactory.Json);
    private static async Task<List<string?>> Box(HttpClient http, string box) =>
        (await Get(http, $"/dm/threads?box={box}")).EnumerateArray()
            .Select(t => t.GetProperty("other").ValueKind == JsonValueKind.Null ? null : t.GetProperty("other").GetProperty("username").GetString()).ToList();
    private static async Task Follow(HttpClient who, string whom) => (await who.PostAsync($"/users/{whom}/follow", null)).EnsureSuccessStatusCode();
    private async Task<int> Dispatch() { using var sc = _api.Services.CreateScope(); return await PushDispatcher.DispatchAsync(sc.ServiceProvider, default); }

    [Fact]
    public async Task People_you_follow_reach_your_chats_and_strangers_your_requests_with_no_push_and_no_seen()
    {
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var (ben, _, _) = await _api.SignUpAsync("ben");
        var (dev, _, _) = await _api.SignUpAsync("dev");
        (await ava.PutAsJsonAsync("/push/devices", new { token = "ava-phone", timeZone = "UTC" })).EnsureSuccessStatusCode();
        (await ava.PutAsJsonAsync("/push/settings", new { quietOn = false })).EnsureSuccessStatusCode();
        await Follow(ava, "ben");

        (await Send(ben, "ava", "Same time Thursday?")).EnsureSuccessStatusCode();
        (await Send(dev, "ava", "What program are you running?")).EnsureSuccessStatusCode();
        Assert.Equal(["ben"], await Box(ava, "chats"));
        Assert.Equal(["dev"], await Box(ava, "requests"));
        var unread = await Get(ava, "/dm/unread");
        Assert.Equal((1, 1), (unread.GetProperty("chats").GetInt32(), unread.GetProperty("requests").GetInt32()));

        Assert.Equal(1, await Dispatch()); // Ben's only: a request makes no push
        Assert.Equal(("ben", "sent you a message"), (_push.Sent[0].Message.Title, _push.Sent[0].Message.Body));

        // Ava reads Dev's request: Dev can't tell until she accepts.
        var request = await Get(ava, "/dm/chat?username=dev");
        Assert.False(request.GetProperty("accepted").GetBoolean());
        var threadId = request.GetProperty("threadId").GetString();
        (await ava.PostAsync($"/dm/threads/{threadId}/read", null)).EnsureSuccessStatusCode();
        Assert.Equal(JsonValueKind.Null, (await Get(dev, "/dm/chat?username=ava")).GetProperty("seenAtMs").ValueKind);
        (await ava.PostAsync($"/dm/threads/{threadId}/accept", null)).EnsureSuccessStatusCode();
        Assert.NotEqual(JsonValueKind.Null, (await Get(dev, "/dm/chat?username=ava")).GetProperty("seenAtMs").ValueKind);
        Assert.Equal(["dev", "ben"], await Box(ava, "chats"));
    }

    [Fact]
    public async Task Message_controls_and_read_receipts_both_ways()
    {
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var (ben, _, _) = await _api.SignUpAsync("ben");
        var (dev, _, _) = await _api.SignUpAsync("dev");
        await Follow(ben, "ava"); // Ben is Ava's follower
        (await ava.PutAsJsonAsync("/users/me/social-settings", new { dmFromFollowers = "Requests", dmFromOthers = "Off" })).EnsureSuccessStatusCode();

        Assert.False((await Get(dev, "/dm/chat?username=ava")).GetProperty("canSend").GetBoolean());
        Assert.Equal(HttpStatusCode.Forbidden, (await Send(dev, "ava", "hi")).StatusCode);
        (await Send(ben, "ava", "hi")).EnsureSuccessStatusCode();
        Assert.Equal(["ben"], await Box(ava, "requests"));

        // Ava replies: that accepts it, and Ben sees "Seen" once she reads, unless either turns receipts off.
        (await Send(ava, "ben", "hey")).EnsureSuccessStatusCode();
        Assert.Equal(["ben"], await Box(ava, "chats"));
        (await Send(ben, "ava", "you around Saturday?")).EnsureSuccessStatusCode();
        var id = (await Get(ava, "/dm/chat?username=ben")).GetProperty("threadId").GetString();
        (await ava.PostAsync($"/dm/threads/{id}/read", null)).EnsureSuccessStatusCode();
        Assert.NotEqual(JsonValueKind.Null, (await Get(ben, "/dm/chat?username=ava")).GetProperty("seenAtMs").ValueKind);
        (await ben.PutAsJsonAsync("/users/me/social-settings", new { showReadReceipts = false })).EnsureSuccessStatusCode();
        Assert.Equal(JsonValueKind.Null, (await Get(ben, "/dm/chat?username=ava")).GetProperty("seenAtMs").ValueKind);
        Assert.Equal(JsonValueKind.Null, (await Get(ava, "/dm/chat?username=ben")).GetProperty("seenAtMs").ValueKind);
    }

    [Fact]
    public async Task A_block_hides_the_thread_both_ways_and_stops_sending()
    {
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var (dev, _, _) = await _api.SignUpAsync("dev");
        (await Send(dev, "ava", "hello")).EnsureSuccessStatusCode();
        (await ava.PostAsync("/users/dev/block", null)).EnsureSuccessStatusCode();
        Assert.Empty(await Box(ava, "requests"));
        Assert.Empty(await Box(dev, "chats"));
        Assert.Equal(HttpStatusCode.NotFound, (await Send(dev, "ava", "hello?")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await dev.GetAsync("/dm/chat?username=ava")).StatusCode);
        Assert.Equal(0, (await Get(ava, "/dm/unread")).GetProperty("requests").GetInt32());
    }

    [Fact]
    public async Task Deleting_a_request_hides_it_until_a_new_message_and_a_resend_is_not_a_duplicate()
    {
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var (dev, _, _) = await _api.SignUpAsync("dev");
        (await Send(dev, "ava", "hello", "same-id")).EnsureSuccessStatusCode();
        (await Send(dev, "ava", "hello", "same-id")).EnsureSuccessStatusCode(); // a retry after a dropped connection
        var chat = await Get(ava, "/dm/chat?username=dev");
        Assert.Equal(1, chat.GetProperty("messages").GetArrayLength());

        (await ava.DeleteAsync($"/dm/threads/{chat.GetProperty("threadId").GetString()}")).EnsureSuccessStatusCode();
        Assert.Empty(await Box(ava, "requests"));
        await Task.Delay(20);
        (await Send(dev, "ava", "sorry, one more")).EnsureSuccessStatusCode();
        Assert.Equal(["dev"], await Box(ava, "requests"));
        Assert.Equal(1, (await Get(ava, "/dm/chat?username=dev")).GetProperty("messages").GetArrayLength());
    }

    [Fact]
    public async Task A_deleted_account_leaves_its_messages_as_a_deleted_account()
    {
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var (ben, _, _) = await _api.SignUpAsync("ben");
        await Follow(ava, "ben");
        (await Send(ben, "ava", "see you Monday")).EnsureSuccessStatusCode();
        var delete = new HttpRequestMessage(HttpMethod.Delete, "/auth/account") { Content = JsonContent.Create(new { password = "Passw0rd!long" }) };
        (await ben.SendAsync(delete)).EnsureSuccessStatusCode();

        var threads = await Get(ava, "/dm/threads?box=chats");
        Assert.Equal(JsonValueKind.Null, threads[0].GetProperty("other").ValueKind);
        var chat = await Get(ava, $"/dm/chat?threadId={threads[0].GetProperty("id").GetString()}");
        Assert.Equal("see you Monday", chat.GetProperty("messages")[0].GetProperty("body").GetString());
        Assert.False(chat.GetProperty("canSend").GetBoolean());
    }

    [Fact]
    public async Task A_workout_or_record_can_be_shared_as_a_card_and_the_list_says_so()
    {
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var (ben, _, _) = await _api.SignUpAsync("ben");
        await Follow(ava, "ben");
        var record = """{"exerciseName":"Squat","weight":107.5,"unit":"kg","reps":3}""";
        (await ben.PostAsJsonAsync("/dm/send", new { username = "ava", clientId = "card1", cardType = "PersonalRecord", cardJson = record })).EnsureSuccessStatusCode();

        var thread = (await Get(ava, "/dm/threads?box=chats"))[0];
        Assert.Equal("Shared a record", thread.GetProperty("lastBody").GetString());
        var m = (await Get(ava, "/dm/chat?username=ben")).GetProperty("messages")[0];
        Assert.Equal(("PersonalRecord", record, ""), (m.GetProperty("cardType").GetString(), m.GetProperty("cardJson").GetString(), m.GetProperty("body").GetString()));

        Assert.Equal(HttpStatusCode.BadRequest, (await ben.PostAsJsonAsync("/dm/send", new { username = "ava", clientId = "card2", cardType = "Algorithm", cardJson = "{}" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await ben.PostAsJsonAsync("/dm/send", new { username = "ava", clientId = "card3", cardType = "WorkoutSession", cardJson = "not json" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await ben.PostAsJsonAsync("/dm/send", new { username = "ava", clientId = "card4", body = "  " })).StatusCode);
    }

    [Fact]
    public async Task Reactions_one_per_person_change_or_take_back_and_go_with_an_unsend()
    {
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var (ben, _, _) = await _api.SignUpAsync("ben");
        var (dev, _, _) = await _api.SignUpAsync("dev");
        await Follow(ava, "ben");
        var sent = await (await Send(ben, "ava", "180 for a triple")).Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);
        var id = sent.GetProperty("id").GetString();
        async Task<JsonElement> React(HttpClient who, string? emoji) =>
            await (await who.PutAsJsonAsync($"/dm/messages/{id}/reaction", new { emoji })).Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);
        JsonElement Reactions(JsonElement chat) => chat.GetProperty("messages")[0].GetProperty("reactions");

        var r = await React(ava, "💪");
        Assert.Equal(("💪", 1, true), (r[0].GetProperty("emoji").GetString(), r[0].GetProperty("count").GetInt32(), r[0].GetProperty("mine").GetBoolean()));
        await React(ben, "💪");
        var seenByBen = Reactions(await Get(ben, "/dm/chat?username=ava"));
        Assert.Equal((2, true), (seenByBen[0].GetProperty("count").GetInt32(), seenByBen[0].GetProperty("mine").GetBoolean()));

        // Picking another changes it; null takes it back.
        r = await React(ava, "🔥");
        Assert.Equal(2, r.GetArrayLength());
        r = await React(ava, null);
        Assert.Equal(1, r.GetArrayLength());

        // Only the six offered, only by people in the chat.
        Assert.Equal(HttpStatusCode.BadRequest, (await ava.PutAsJsonAsync($"/dm/messages/{id}/reaction", new { emoji = "🍕" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await dev.PutAsJsonAsync($"/dm/messages/{id}/reaction", new { emoji = "💪" })).StatusCode);

        // Unsent: the reactions go with it.
        (await ben.DeleteAsync($"/dm/messages/{id}")).EnsureSuccessStatusCode();
        Assert.Equal(JsonValueKind.Null, Reactions(await Get(ava, "/dm/chat?username=ben")).ValueKind);
        Assert.Equal(HttpStatusCode.NotFound, (await ava.PutAsJsonAsync($"/dm/messages/{id}/reaction", new { emoji = "💪" })).StatusCode);
    }

    [Fact]
    public async Task Reacting_waits_for_an_accepted_request()
    {
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var (dev, _, _) = await _api.SignUpAsync("dev");
        var sent = await (await Send(dev, "ava", "hi")).Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);
        var id = sent.GetProperty("id").GetString();
        Assert.Equal(HttpStatusCode.BadRequest, (await ava.PutAsJsonAsync($"/dm/messages/{id}/reaction", new { emoji = "👏" })).StatusCode);
    }
}
