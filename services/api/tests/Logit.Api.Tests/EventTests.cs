using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Push;
using Logit.Api.Features.Social;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Logit.Api.Tests;

/// A group's events (design canvas G2, E1–E4, the Home meetup card; journey F5).
public class EventTests : IDisposable
{
    // Wednesday 26 Nov 2026, 12:00 UTC (Dublin is UTC in winter).
    private static readonly DateTime Noon = new(2026, 11, 26, 12, 0, 0, DateTimeKind.Utc);
    private readonly FakeClock _clock = new(Noon);
    private readonly FakePushSender _push = new();
    private readonly ApiFactory _api;

    public EventTests() => _api = new ApiFactory
    {
        ConfigureTestServices = s =>
        {
            s.AddSingleton<TimeProvider>(_clock);
            s.AddSingleton<IPushSender>(_push);
            s.Remove(s.Single(d => d.ImplementationType == typeof(PushDispatcher)));
            s.Remove(s.Single(d => d.ImplementationType == typeof(EventReminderSweeper)));
        },
    };

    public void Dispose() => _api.Dispose();

    private static async Task<JsonElement> Json(HttpResponseMessage res)
    {
        res.EnsureSuccessStatusCode();
        return await res.Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);
    }
    private static Task<JsonElement> Get(HttpClient http, string url) => http.GetFromJsonAsync<JsonElement>(url, ApiFactory.Json);
    private async Task<int> Count(NotificationType type) => await _api.WithDbAsync(db => db.Notifications.CountAsync(n => n.Type == type));

    private async Task<(HttpClient Conor, HttpClient Ava, HttpClient Ben, string GroupId)> GroupAsync()
    {
        var (conor, _, _) = await _api.SignUpAsync("conor");
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var (ben, _, _) = await _api.SignUpAsync("ben");
        var g = await Json(await conor.PostAsJsonAsync("/groups", new { name = "Iron Club", place = "Dublin 8" }));
        foreach (var who in new[] { ava, ben }) (await who.PostAsJsonAsync($"/groups/join/{g.GetProperty("inviteCode").GetString()}", new { })).EnsureSuccessStatusCode();
        return (conor, ava, ben, g.GetProperty("id").GetString()!);
    }

    [Fact]
    public async Task Organisers_add_events_members_answer_and_changes_reach_those_going()
    {
        var (conor, ava, ben, groupId) = await GroupAsync();
        var saturday = new DateTime(2026, 11, 28, 9, 0, 0, DateTimeKind.Utc);
        Assert.Equal(HttpStatusCode.Forbidden, (await ava.PostAsJsonAsync($"/groups/{groupId}/events", new { title = "Mine", startsAt = saturday })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await conor.PostAsJsonAsync($"/groups/{groupId}/events", new { title = "Past", startsAt = Noon.AddDays(-1) })).StatusCode);
        var ev = await Json(await conor.PostAsJsonAsync($"/groups/{groupId}/events", new { title = "Deadlift day", kind = "session", startsAt = saturday, endsAt = saturday.AddMinutes(90), place = "Iron Club" }));
        var id = ev.GetProperty("id").GetString();
        Assert.Equal(2, await Count(NotificationType.GroupEvent)); // Ava and Ben, on the default setting

        // Ava's going, Ben can't; both lists show; only members see it.
        Assert.Equal(1, (await Json(await ava.PutAsJsonAsync($"/events/{id}/rsvp", new { going = true }))).GetProperty("going").GetInt32());
        (await ben.PutAsJsonAsync($"/events/{id}/rsvp", new { going = false })).EnsureSuccessStatusCode();
        var people = await Get(conor, $"/events/{id}/people");
        Assert.Equal((1, 1), (people.GetProperty("going").GetArrayLength(), people.GetProperty("cantMakeIt").GetArrayLength()));
        var (dev, _, _) = await _api.SignUpAsync("dev");
        Assert.Equal(HttpStatusCode.NotFound, (await dev.GetAsync($"/events/{id}")).StatusCode);
        Assert.Equal("Deadlift day", (await Get(ava, $"/groups/{groupId}/events"))[0].GetProperty("title").GetString());

        // A new time reaches Ava (going), not Ben; a new description reaches nobody.
        (await conor.PatchAsJsonAsync($"/events/{id}", new { details = "Bring your belt" })).EnsureSuccessStatusCode();
        Assert.Equal(0, await Count(NotificationType.GroupEventChanged));
        (await conor.PatchAsJsonAsync($"/events/{id}", new { startsAt = saturday.AddHours(1) })).EnsureSuccessStatusCode();
        Assert.Equal(1, await Count(NotificationType.GroupEventChanged));

        // The push says which group and what changed.
        await _api.WithDbAsync(async db =>
        {
            var n = await db.Notifications.Include(x => x.Actor).Include(x => x.Group).Include(x => x.Event).FirstAsync(x => x.Type == NotificationType.GroupEventChanged);
            Assert.Equal(("Iron Club", "conor changed the time or place of Deadlift day"), (PushDispatcher.Compose([n]).Title, PushDispatcher.Compose([n]).Body));
        });

        // Cancelled: those going are told; it stays listed, marked; no more answers.
        (await conor.PostAsync($"/events/{id}/cancel", null)).EnsureSuccessStatusCode();
        Assert.Equal(1, await Count(NotificationType.GroupEventCancelled));
        Assert.True((await Get(ava, $"/events/{id}")).GetProperty("cancelled").GetBoolean());
        Assert.Equal(HttpStatusCode.BadRequest, (await ben.PutAsJsonAsync($"/events/{id}/rsvp", new { going = true })).StatusCode);
    }

    [Fact]
    public async Task Home_shows_the_pinned_or_next_event_and_the_reminder_comes_the_evening_before()
    {
        var (conor, ava, _, groupId) = await GroupAsync();
        (await ava.PutAsJsonAsync("/push/settings", new { timeZone = "Europe/Dublin" })).EnsureSuccessStatusCode();
        var friday = new DateTime(2026, 11, 27, 19, 0, 0, DateTimeKind.Utc);
        var saturday = new DateTime(2026, 11, 28, 9, 0, 0, DateTimeKind.Utc);
        var later = await Json(await conor.PostAsJsonAsync($"/groups/{groupId}/events", new { title = "Mock meet", startsAt = saturday.AddDays(16), notify = false }));
        var soon = await Json(await conor.PostAsJsonAsync($"/groups/{groupId}/events", new { title = "Deadlift day", startsAt = saturday, notify = false }));
        Assert.Equal(HttpStatusCode.NoContent, (await ava.GetAsync("/events/home")).StatusCode);

        (await ava.PutAsJsonAsync($"/events/{later.GetProperty("id").GetString()}/rsvp", new { going = true })).EnsureSuccessStatusCode();
        (await ava.PutAsJsonAsync($"/events/{soon.GetProperty("id").GetString()}/rsvp", new { going = true })).EnsureSuccessStatusCode();
        Assert.Equal("Deadlift day", (await Get(ava, "/events/home")).GetProperty("title").GetString()); // the next one
        (await ava.PutAsJsonAsync($"/events/{later.GetProperty("id").GetString()}/pin", new { pinned = true })).EnsureSuccessStatusCode();
        Assert.Equal("Mock meet", (await Get(ava, "/events/home")).GetProperty("title").GetString()); // pinned wins

        // Friday 7pm Dublin time, Ava (going) gets one reminder for Saturday.
        Assert.Equal(friday, EventReminderSweeper.DueAt(saturday, "Europe/Dublin"));
        await _api.WithDbAsync(async db =>
        {
            Assert.Equal(0, await EventReminderSweeper.SweepAsync(db, friday.AddMinutes(-10)));
            Assert.Equal(1, await EventReminderSweeper.SweepAsync(db, friday.AddMinutes(5)));
            Assert.Equal(0, await EventReminderSweeper.SweepAsync(db, friday.AddMinutes(10)));
        });

        // Leaving the group takes you off the going list (and the Home card).
        (await ava.DeleteAsync($"/groups/{groupId}/members/ava")).EnsureSuccessStatusCode();
        Assert.Equal(0, (await Get(conor, $"/events/{soon.GetProperty("id").GetString()}")).GetProperty("going").GetInt32());
        Assert.Equal(HttpStatusCode.NoContent, (await ava.GetAsync("/events/home")).StatusCode);
    }

    [Fact]
    public async Task A_repeating_event_is_one_event_per_date_and_changes_apply_to_one_or_all_after_it()
    {
        var (conor, ava, _, groupId) = await GroupAsync();
        var tue = new DateTime(2026, 12, 1, 19, 0, 0, DateTimeKind.Utc);
        // Tue and Thu for three weeks.
        var days = new[] { 0, 2, 7, 9, 14, 16 }.Select(d => new { startsAt = tue.AddDays(d), endsAt = tue.AddDays(d).AddMinutes(90) }).ToArray();
        var first = await Json(await conor.PostAsJsonAsync($"/groups/{groupId}/events", new { title = "Evening session", sport = "strength", dates = days, repeats = "Every Tue and Thu" }));
        Assert.Equal(("Strength", "Every Tue and Thu"), (first.GetProperty("sport").GetString(), first.GetProperty("repeats").GetString()));
        var list = (await Get(ava, $"/groups/{groupId}/events")).EnumerateArray().ToList();
        Assert.Equal(6, list.Count);
        Assert.Equal(1, await Count(NotificationType.GroupEvent) / 2); // one each for Ava and Ben, not six
        foreach (var e in list) (await ava.PutAsJsonAsync($"/events/{e.GetProperty("id").GetString()}/rsvp", new { going = true })).EnsureSuccessStatusCode();

        // Move the third date and every one after it half an hour earlier: the first two stay.
        var third = list[2].GetProperty("id").GetString();
        (await conor.PatchAsJsonAsync($"/events/{third}", new { startsAt = tue.AddDays(7).AddMinutes(-30), scope = "following" })).EnsureSuccessStatusCode();
        var after = (await Get(ava, $"/groups/{groupId}/events")).EnumerateArray().Select(e => DateTimeOffset.FromUnixTimeMilliseconds(e.GetProperty("startsAtMs").GetInt64()).UtcDateTime.TimeOfDay).ToList();
        Assert.Equal([TimeSpan.FromHours(19), TimeSpan.FromHours(19), .. Enumerable.Repeat(new TimeSpan(18, 30, 0), 4)], after);
        Assert.Equal(1, await Count(NotificationType.GroupEventChanged)); // Ava once, not four times

        // Cancel just the fourth; then the fifth and everything after.
        var rows = (await Get(ava, $"/groups/{groupId}/events")).EnumerateArray().ToList();
        (await conor.PostAsJsonAsync($"/events/{rows[3].GetProperty("id").GetString()}/cancel", new { })).EnsureSuccessStatusCode();
        (await conor.PostAsJsonAsync($"/events/{rows[4].GetProperty("id").GetString()}/cancel", new { scope = "following" })).EnsureSuccessStatusCode();
        Assert.Equal([false, false, false, true, true, true], (await Get(ava, $"/groups/{groupId}/events")).EnumerateArray().Select(e => e.GetProperty("cancelled").GetBoolean()).ToList());
        Assert.Equal(HttpStatusCode.BadRequest, (await conor.PostAsJsonAsync($"/groups/{groupId}/events", new { title = "Too many", dates = Enumerable.Range(1, 121).Select(i => new { startsAt = tue.AddDays(i) }) })).StatusCode);
    }

    [Fact]
    public async Task Events_in_findable_groups_show_in_search_and_going_from_there_joins_the_group()
    {
        var (conor, ava, _, hiddenGroup) = await GroupAsync();
        var (dev, _, _) = await _api.SignUpAsync("dev");
        var sunday = new DateTime(2026, 12, 6, 10, 0, 0, DateTimeKind.Utc);
        var open = await Json(await conor.PostAsJsonAsync("/groups", new { name = "Sligo Harriers", place = "Sligo", access = "Open" }));
        var ask = await Json(await conor.PostAsJsonAsync("/groups", new { name = "Iron Club", place = "Sligo town", access = "Request" }));
        var race = await Json(await conor.PostAsJsonAsync($"/groups/{open.GetProperty("id").GetString()}/events", new { title = "Christmas 5k", kind = "Race", sport = "Running", startsAt = sunday, place = "Doorly Park" }));
        var meet = await Json(await conor.PostAsJsonAsync($"/groups/{ask.GetProperty("id").GetString()}/events", new { title = "Mock meet", kind = "Meet", sport = "Powerlifting", startsAt = sunday.AddDays(7) }));
        await conor.PostAsJsonAsync($"/groups/{hiddenGroup}/events", new { title = "Sligo secret session", startsAt = sunday });

        List<string> Titles(JsonElement r) => [.. r.EnumerateArray().Select(e => e.GetProperty("title").GetString()!)];
        Assert.Equal(["Christmas 5k", "Mock meet"], Titles(await Get(dev, "/events/search?q=sligo")));
        Assert.Equal(["Christmas 5k"], Titles(await Get(dev, "/events/search?q=sligo&kind=Race")));
        Assert.Equal(["Mock meet"], Titles(await Get(dev, "/events/search?sport=Powerlifting")));
        Assert.Equal(["Christmas 5k"], Titles(await Get(dev, $"/events/search?q=sligo&to={sunday.AddDays(1):O}")));
        var found = await Get(dev, $"/events/{race.GetProperty("id").GetString()}");
        Assert.Equal((false, "Open"), (found.GetProperty("member").GetBoolean(), found.GetProperty("groupAccess").GetString()));

        // Open group: join and go in one step. Ask-to-join: going once let in.
        (await dev.PostAsJsonAsync($"/groups/{open.GetProperty("id").GetString()}/join", new { eventId = race.GetProperty("id").GetString() })).EnsureSuccessStatusCode();
        Assert.True((await Get(dev, $"/events/{race.GetProperty("id").GetString()}")).GetProperty("answer").GetBoolean());
        (await dev.PostAsJsonAsync($"/groups/{ask.GetProperty("id").GetString()}/join", new { eventId = meet.GetProperty("id").GetString() })).EnsureSuccessStatusCode();
        Assert.True((await Get(dev, $"/events/{meet.GetProperty("id").GetString()}")).GetProperty("requested").GetBoolean());
        (await conor.PostAsync($"/groups/{ask.GetProperty("id").GetString()}/requests/dev", null)).EnsureSuccessStatusCode();
        Assert.True((await Get(dev, $"/events/{meet.GetProperty("id").GetString()}")).GetProperty("answer").GetBoolean());
        _ = ava;
    }
}
