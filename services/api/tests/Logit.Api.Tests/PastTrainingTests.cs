using System.Net.Http.Json;
using System.Text.Json;
using Logit.Api.Data.Entities;

namespace Logit.Api.Tests;

/// Canvas SP3: "Your training from before". On by default; off hides workouts from before then.
public class PastTrainingTests
{
    [Fact]
    public async Task Off_hides_workouts_from_before_and_on_shows_them_again()
    {
        using var api = new ApiFactory();
        var (coach, coachId, _) = await api.SignUpAsync("cora", UserTier.Studio);
        var (client, clientId, _) = await api.SignUpAsync("niall", UserTier.Pro);
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var relId = await api.WithDbAsync(async db =>
        {
            var rel = new CoachClientRelationship { CoachId = coachId, ClientId = clientId, Status = CoachClientStatus.Active };
            db.CoachClientRelationships.Add(rel);
            db.SyncedWorkoutSessions.Add(new SyncedWorkoutSession { UserId = clientId, ClientId = "old", StartedAtMs = now - 30L * 86_400_000, DataJson = "{}" });
            db.SyncedWorkoutSessions.Add(new SyncedWorkoutSession { UserId = clientId, ClientId = "new", StartedAtMs = now + 60_000, DataJson = "{}" });
            await db.SaveChangesAsync();
            return rel.Id;
        });
        async Task<string[]> Seen() =>
            (await (await coach.GetAsync($"/sync/sessions?since=0&clientId={clientId}")).Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json))
                .GetProperty("sessions").EnumerateArray().Select(s => s.GetProperty("id").GetString()!).OrderBy(x => x).ToArray();

        Assert.Equal(["new", "old"], await Seen());

        var off = await client.PutAsJsonAsync($"/coach/relationships/{relId}/sharing", new { workouts = true, nutrition = true, bodyweight = true, habits = true, checkins = true, pastTraining = false });
        off.EnsureSuccessStatusCode();
        Assert.False((await off.Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json)).GetProperty("sharing").GetProperty("pastTraining").GetBoolean());
        Assert.Equal(["new"], await Seen());

        (await client.PutAsJsonAsync($"/coach/relationships/{relId}/sharing", new { workouts = true, nutrition = true, bodyweight = true, habits = true, checkins = true, pastTraining = true })).EnsureSuccessStatusCode();
        Assert.Equal(["new", "old"], await Seen());
    }
}
