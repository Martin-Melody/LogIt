using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Push;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Logit.Api.Tests;

public class FakePushSender : IPushSender
{
    public List<(string Token, PushMessage Message)> Sent { get; } = [];
    public HashSet<string> Dead { get; } = [];
    public bool IsConfigured => true;

    public Task<PushResult> SendAsync(string token, PushMessage message, CancellationToken ct)
    {
        if (Dead.Contains(token)) return Task.FromResult(PushResult.BadToken);
        Sent.Add((token, message));
        return Task.FromResult(PushResult.Sent);
    }
}

public class PushTests : IAsyncLifetime
{
    // Monday 2026-11-23, 12:00 in Dublin (UTC in winter).
    private static readonly DateTime Noon = new(2026, 11, 23, 12, 0, 0, DateTimeKind.Utc);
    private readonly FakePushSender _push = new();
    private readonly FakeClock _clock = new(Noon);
    private ApiFactory _api = null!;

    public Task InitializeAsync()
    {
        _api = new ApiFactory
        {
            ConfigureTestServices = s =>
            {
                s.AddSingleton<IPushSender>(_push);
                s.AddSingleton<TimeProvider>(_clock);
                var worker = s.Single(d => d.ImplementationType == typeof(PushDispatcher));
                s.Remove(worker);
            },
        };
        return Task.CompletedTask;
    }

    public Task DisposeAsync()
    {
        _api.Dispose();
        return Task.CompletedTask;
    }

    private async Task<int> Dispatch()
    {
        using var scope = _api.Services.CreateScope();
        return await PushDispatcher.DispatchAsync(scope.ServiceProvider, default);
    }

    private Task Notify(Guid to, Guid from, NotificationType type, Guid? postId = null) =>
        _api.WithDbAsync(async db =>
        {
            db.Notifications.Add(new Notification { UserId = to, ActorId = from, Type = type, PostId = postId, CreatedAt = _clock.Now });
            await db.SaveChangesAsync();
        });

    private async Task<(HttpClient Http, Guid Id)> WithPhone(string name, string token)
    {
        var (http, id, _) = await _api.SignUpAsync(name);
        (await http.PutAsJsonAsync("/push/devices", new { token, platform = "android", timeZone = "Europe/Dublin" })).EnsureSuccessStatusCode();
        return (http, id);
    }

    [Fact]
    public async Task Likes_and_follows_are_gathered_into_one_push_every_four_hours()
    {
        var (_, ava) = await WithPhone("ava", "ava-phone");
        var (_, ben, _) = await _api.SignUpAsync("ben");
        var (_, cara, _) = await _api.SignUpAsync("cara");
        var post = Guid.NewGuid();

        await Notify(ava, ben, NotificationType.Like, post);
        Assert.Equal(1, await Dispatch());
        Assert.Equal(("ben", "liked your post"), (_push.Sent[0].Message.Title, _push.Sent[0].Message.Body));

        _clock.Now = Noon.AddHours(1);
        await Notify(ava, cara, NotificationType.Like, post);
        await Notify(ava, cara, NotificationType.Follow);
        Assert.Equal(0, await Dispatch());

        _clock.Now = Noon.AddHours(4);
        Assert.Equal(1, await Dispatch());
        var gathered = _push.Sent[1].Message;
        Assert.Equal(("cara", "1 like and 1 new follower", "social"), (gathered.Title, gathered.Body, gathered.Channel));
        Assert.Equal(0, await Dispatch());
    }

    [Fact]
    public async Task Coaching_goes_out_straight_away_but_waits_for_quiet_mode_and_pause_drops_everything()
    {
        var (http, ava) = await WithPhone("ava", "ava-phone");
        var (_, coach, _) = await _api.SignUpAsync("coach");

        await Notify(ava, coach, NotificationType.Like);
        await Dispatch();
        await Notify(ava, coach, NotificationType.CoachProgram);
        Assert.Equal(1, await Dispatch());
        Assert.Equal(("coach", "sent you a program", "coaching"),
            (_push.Sent[^1].Message.Title, _push.Sent[^1].Message.Body, _push.Sent[^1].Message.Channel));

        // 23:00 Monday in Dublin: quiet (22:00–07:00 by default).
        _clock.Now = new DateTime(2026, 11, 23, 23, 0, 0, DateTimeKind.Utc);
        await Notify(ava, coach, NotificationType.CoachInvite);
        await Notify(ava, coach, NotificationType.Comment);
        Assert.Equal(0, await Dispatch());
        _clock.Now = new DateTime(2026, 11, 24, 7, 0, 0, DateTimeKind.Utc);
        Assert.Equal(1, await Dispatch());
        Assert.Equal("1 comment and 1 coaching update", _push.Sent[^1].Message.Body);

        var pause = await http.PutAsJsonAsync("/push/settings", new { pausedUntil = _clock.Now.AddHours(1) });
        pause.EnsureSuccessStatusCode();
        await Notify(ava, coach, NotificationType.CoachProgram);
        Assert.Equal(0, await Dispatch());
        _clock.Now = _clock.Now.AddHours(2);
        Assert.Equal(0, await Dispatch()); // dropped, not held
        Assert.Equal(0, await _api.WithDbAsync(db => db.Notifications.CountAsync(n => n.PushedAt == null)));
    }

    [Fact]
    public async Task Likes_from_people_you_follow_only_and_read_ones_are_skipped()
    {
        var (http, ava) = await WithPhone("ava", "ava-phone");
        var (_, ben, _) = await _api.SignUpAsync("ben");
        var (_, cara, _) = await _api.SignUpAsync("cara");
        (await http.PostAsync("/users/ben/follow", null)).EnsureSuccessStatusCode();
        (await http.PutAsJsonAsync("/push/settings", new { likes = "Following", follows = false })).EnsureSuccessStatusCode();
        await Dispatch(); // nothing for Ava yet

        await Notify(ava, cara, NotificationType.Like);
        await Notify(ava, cara, NotificationType.Follow);
        Assert.Equal(0, await Dispatch());
        await Notify(ava, ben, NotificationType.Like);
        Assert.Equal(1, await Dispatch());
        Assert.Equal("ben", _push.Sent.Single().Message.Title);
    }

    [Fact]
    public async Task A_dead_token_is_forgotten_and_a_token_moves_to_whoever_signed_in_last()
    {
        var (_, ava) = await WithPhone("ava", "shared-phone");
        var (_, ben) = await WithPhone("ben", "shared-phone");
        Assert.Equal(ben, await _api.WithDbAsync(db => db.PushDevices.Where(d => d.Token == "shared-phone").Select(d => d.UserId).SingleAsync()));

        _push.Dead.Add("shared-phone");
        await Notify(ben, ava, NotificationType.Follow);
        Assert.Equal(0, await Dispatch());
        Assert.Equal(0, await _api.WithDbAsync(db => db.PushDevices.CountAsync()));
    }

    [Fact]
    public async Task The_same_new_token_sent_twice_at_once_is_saved_once_without_an_error()
    {
        // The app registers at start and again on coming to the front; after a token refresh both
        // retries can land together (seen on Martin's phone, 2026-11-24).
        var (http, _, _) = await _api.SignUpAsync("ava");
        var body = new { token = "new-phone", platform = "android", timeZone = "Europe/Dublin" };
        var results = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => http.PutAsJsonAsync("/push/devices", body)));
        Assert.All(results, r => Assert.Equal(HttpStatusCode.NoContent, r.StatusCode));
        Assert.Equal(1, await _api.WithDbAsync(db => db.PushDevices.CountAsync()));
        Assert.Equal(1, await _api.WithDbAsync(db => db.PushSettings.CountAsync()));
    }

    [Fact]
    public async Task Settings_round_trip_and_reject_nonsense()
    {
        var (http, _) = await WithPhone("ava", "ava-phone");
        var get = await http.GetFromJsonAsync<JsonElement>("/push/settings", ApiFactory.Json);
        Assert.True(get.GetProperty("available").GetBoolean());
        Assert.Equal("Everyone", get.GetProperty("likes").GetString());
        Assert.Equal("Europe/Dublin", get.GetProperty("timeZone").GetString());
        Assert.Equal(22 * 60, get.GetProperty("quietFromMinute").GetInt32());

        var res = await http.PutAsJsonAsync("/push/settings", new { comments = "Off", quietOn = false });
        var body = await res.Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);
        Assert.Equal(("Off", false), (body.GetProperty("comments").GetString(), body.GetProperty("quietOn").GetBoolean()));

        Assert.Equal(HttpStatusCode.BadRequest, (await http.PutAsJsonAsync("/push/settings", new { pausedUntil = Noon.AddDays(3) })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await http.PutAsJsonAsync("/push/settings", new { quietToMinute = 1440 })).StatusCode);
    }

    [Fact]
    public async Task Coach_messages_go_out_straight_away_on_their_own_channel()
    {
        var (clientHttp, client) = await WithPhone("ava", "ava-phone");
        var (_, coach, _) = await _api.SignUpAsync("sam");
        var rel = Guid.NewGuid();
        await _api.WithDbAsync(async db =>
        {
            db.CoachClientRelationships.Add(new CoachClientRelationship { Id = rel, CoachId = coach, ClientId = client, Status = CoachClientStatus.Active });
            db.CoachMessages.AddRange(
                new CoachMessage { MessageId = "m1", RelationshipId = rel, SenderUserId = coach, Body = "secret plan", SyncedAt = _clock.Now },
                new CoachMessage { MessageId = "m2", RelationshipId = rel, SenderUserId = coach, Body = "more", SyncedAt = _clock.Now },
                // Ava's own message to Sam: Sam has no phone, so nothing.
                new CoachMessage { MessageId = "m3", RelationshipId = rel, SenderUserId = client, Body = "ok", SyncedAt = _clock.Now });
            await db.SaveChangesAsync();
        });

        Assert.Equal(1, await Dispatch());
        var m = _push.Sent.Single().Message;
        Assert.Equal(("sam", "sent you 2 messages", "messages", rel.ToString()), (m.Title, m.Body, m.Channel, m.Data["relationshipId"]));
        Assert.DoesNotContain("secret", m.Body);
        Assert.Equal(0, await Dispatch());

        (await clientHttp.PutAsJsonAsync("/push/settings", new { messages = false })).EnsureSuccessStatusCode();
        await _api.WithDbAsync(async db =>
        {
            db.CoachMessages.Add(new CoachMessage { MessageId = "m4", RelationshipId = rel, SenderUserId = coach, Body = "x", SyncedAt = _clock.Now });
            await db.SaveChangesAsync();
        });
        Assert.Equal(0, await Dispatch());
        Assert.Equal(0, await _api.WithDbAsync(db => db.CoachMessages.CountAsync(x => x.PushedAt == null)));
    }

    [Theory]
    [InlineData("2026-11-23T21:59:00Z", false)] // Monday, before
    [InlineData("2026-11-23T22:00:00Z", true)]
    [InlineData("2026-11-24T06:59:00Z", true)]  // Tuesday morning: Monday's window
    [InlineData("2026-11-24T07:00:00Z", false)]
    [InlineData("2026-11-24T23:00:00Z", false)] // Tuesday night: Tuesday isn't picked
    [InlineData("2026-11-25T06:00:00Z", false)]
    public void Quiet_time_crosses_midnight_and_belongs_to_the_day_it_starts(string utc, bool quiet)
    {
        var s = new PushSettings { TimeZone = "Europe/Dublin", QuietDays = 0b111_1101 }; // every day but Tuesday
        Assert.Equal(quiet, PushDispatcher.InQuiet(s, DateTime.Parse(utc).ToUniversalTime()));
    }

    [Fact]
    public async Task A_self_hosted_server_relays_only_after_an_admin_turns_it_on()
    {
        const string key = "test-admin-key-that-is-long-enough-1234";
        using var api = new ApiFactory { AdminKey = key, Settings = { ["Deployment:SelfHosted"] = "true" } };
        var (admin, _, _) = await api.SignUpAsync("alex");
        (await admin.PostAsJsonAsync("/admin/claim", new { key })).EnsureSuccessStatusCode();

        async Task<JsonElement> Push() => (await admin.GetFromJsonAsync<JsonElement>("/admin/api/server", ApiFactory.Json)).GetProperty("push");
        Assert.Equal(("relay", false), ((await Push()).GetProperty("mode").GetString(), (await Push()).GetProperty("relayOn").GetBoolean()));
        Assert.False((await admin.GetFromJsonAsync<JsonElement>("/push/settings", ApiFactory.Json)).GetProperty("available").GetBoolean());

        Assert.Equal(HttpStatusCode.NoContent, (await admin.PutAsJsonAsync("/admin/api/server/push-relay", new { on = true })).StatusCode);
        Assert.True((await Push()).GetProperty("relayOn").GetBoolean());
        Assert.True((await admin.GetFromJsonAsync<JsonElement>("/push/settings", ApiFactory.Json)).GetProperty("available").GetBoolean());
        Assert.Equal("on", await api.WithDbAsync(db => db.ServerSettings.Where(s => s.Key == PushRelay.SettingKey).Select(s => s.Value).SingleAsync()));

        // Without a Firebase key this server doesn't relay for others.
        Assert.Equal(HttpStatusCode.NotFound, (await api.CreateClient().PostAsJsonAsync("/push/relay",
            new { token = "t", title = "a", body = "b", channel = "social" })).StatusCode);
    }

    [Fact]
    public void Quiet_time_follows_the_phones_zone()
    {
        var s = new PushSettings { TimeZone = "America/New_York" };
        Assert.False(PushDispatcher.InQuiet(s, new DateTime(2026, 11, 23, 23, 0, 0, DateTimeKind.Utc))); // 18:00 there
        Assert.True(PushDispatcher.InQuiet(s, new DateTime(2026, 11, 24, 4, 0, 0, DateTimeKind.Utc)));  // 23:00 there
    }

    [Fact]
    public void Several_people_on_one_post_read_like_instagram()
    {
        var post = Guid.NewGuid();
        User U(string n) => new() { Id = Guid.NewGuid(), Username = n, DisplayName = n == "ava" ? "Ava" : "" };
        var batch = new[] { U("ava"), U("ben"), U("cara"), U("dev") }.Select((u, i) => new Notification
        {
            Actor = u, ActorId = u.Id, Type = NotificationType.Like, PostId = post, CreatedAt = Noon.AddMinutes(-i),
        }).ToList();
        var m = PushDispatcher.Compose(batch);
        Assert.Equal(("Ava and 3 others", "liked your post"), (m.Title, m.Body));
        Assert.Equal("Ava and ben", PushDispatcher.Compose([batch[0], batch[1]]).Title);
    }
}
