using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Push;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Logit.Api.Tests;

/// Training now (Instagram's activity status) and cheers (story reactions), design canvas T1–T2.
public class TrainingNowTests : IDisposable
{
    private static readonly DateTime Noon = new(2026, 11, 24, 12, 0, 0, DateTimeKind.Utc);
    private readonly FakeClock _clock = new(Noon);
    private readonly ApiFactory _api;

    public TrainingNowTests() => _api = new ApiFactory
    {
        ConfigureTestServices = s =>
        {
            s.AddSingleton<TimeProvider>(_clock);
            s.Remove(s.Single(d => d.ImplementationType == typeof(PushDispatcher)));
        },
    };

    public void Dispose() => _api.Dispose();

    private static async Task<List<string>> Training(HttpClient http) =>
        (await http.GetFromJsonAsync<JsonElement>("/training/now", ApiFactory.Json)).EnumerateArray()
            .Select(t => t.GetProperty("username").GetString()!).ToList();

    private static async Task Follow(HttpClient who, string whom) => (await who.PostAsync($"/users/{whom}/follow", null)).EnsureSuccessStatusCode();

    [Fact]
    public async Task Only_the_accounts_a_trainee_follows_see_them_training_until_it_goes_stale()
    {
        var (ben, _, _) = await _api.SignUpAsync("ben");
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var (cara, _, _) = await _api.SignUpAsync("cara");
        await Follow(ben, "ava");      // Ben follows Ava, so Ava may see Ben
        await Follow(cara, "ben");     // Cara follows Ben, which doesn't let her see him

        (await ben.PutAsJsonAsync("/training/now", new { what = "Push A" })).EnsureSuccessStatusCode();
        var seen = (await ava.GetFromJsonAsync<JsonElement>("/training/now", ApiFactory.Json))[0];
        Assert.Equal(("ben", "Push A"), (seen.GetProperty("username").GetString(), seen.GetProperty("what").GetString()));
        Assert.Empty(await Training(cara));

        _clock.Now = Noon.AddMinutes(21); // the phone stopped refreshing
        Assert.Empty(await Training(ava));

        (await ben.PutAsJsonAsync("/training/now", new { what = "Push A" })).EnsureSuccessStatusCode();
        (await ben.DeleteAsync("/training/now")).EnsureSuccessStatusCode();
        Assert.Empty(await Training(ava));
    }

    [Fact]
    public async Task Turning_it_off_hides_you_and_hides_others_from_you_and_a_block_hides_both_ways()
    {
        var (ben, _, _) = await _api.SignUpAsync("ben");
        var (ava, _, _) = await _api.SignUpAsync("ava");
        await Follow(ben, "ava");
        (await ben.PutAsJsonAsync("/training/now", new { what = "Legs" })).EnsureSuccessStatusCode();

        (await ava.PutAsJsonAsync("/users/me/social-settings", new { showTraining = false })).EnsureSuccessStatusCode();
        Assert.Empty(await Training(ava));
        (await ava.PutAsJsonAsync("/users/me/social-settings", new { showTraining = true })).EnsureSuccessStatusCode();
        Assert.Equal(["ben"], await Training(ava));

        (await ben.PutAsJsonAsync("/users/me/social-settings", new { showTraining = false })).EnsureSuccessStatusCode();
        Assert.Empty(await Training(ava)); // gone at once, not after the next refresh
        (await ben.PutAsJsonAsync("/users/me/social-settings", new { showTraining = true })).EnsureSuccessStatusCode();
        (await ben.PutAsJsonAsync("/training/now", new { what = "Legs" })).EnsureSuccessStatusCode();

        (await ava.PostAsync("/users/ben/block", null)).EnsureSuccessStatusCode();
        Assert.Empty(await Training(ava));
    }

    [Fact]
    public async Task A_cheer_reaches_the_trainee_once_per_workout_and_respects_their_setting()
    {
        var (ben, benId, _) = await _api.SignUpAsync("ben");
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var (cara, _, _) = await _api.SignUpAsync("cara");
        await Follow(ben, "ava");
        (await ben.PutAsJsonAsync("/training/now", new { what = "Push A" })).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.NoContent, (await ava.PostAsync("/training/ben/cheer", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await ava.PostAsync("/training/ben/cheer", null)).StatusCode);
        Assert.Equal(1, await _api.WithDbAsync(db => db.Notifications.CountAsync(n => n.UserId == benId && n.Type == NotificationType.Cheer)));
        Assert.Equal(HttpStatusCode.NotFound, (await cara.PostAsync("/training/ben/cheer", null)).StatusCode);

        (await ben.PutAsJsonAsync("/users/me/social-settings", new { cheersFrom = "Off" })).EnsureSuccessStatusCode();
        (await ben.DeleteAsync("/training/now")).EnsureSuccessStatusCode();
        (await ben.PutAsJsonAsync("/training/now", new { what = "Pull A" })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Forbidden, (await ava.PostAsync("/training/ben/cheer", null)).StatusCode);

        var settings = await ben.GetFromJsonAsync<JsonElement>("/users/me/social-settings", ApiFactory.Json);
        Assert.Equal(("Off", true), (settings.GetProperty("cheersFrom").GetString(), settings.GetProperty("showTraining").GetBoolean()));
    }

    [Fact]
    public void A_cheer_reads_who_and_what_and_goes_straight_away()
    {
        Assert.Equal(PushDispatcher.Kind.Cheers, PushDispatcher.Of(NotificationType.Cheer));
        var alex = new User { Username = "alex", DisplayName = "Alex" };
        var m = PushDispatcher.Compose([new Notification { Actor = alex, ActorId = alex.Id, Type = NotificationType.Cheer, CreatedAt = Noon }]);
        Assert.Equal(("Alex", "is cheering you on"), (m.Title, m.Body));
    }
}
