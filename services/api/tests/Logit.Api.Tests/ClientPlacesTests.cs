using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Logit.Api.Data.Entities;

namespace Logit.Api.Tests;

/// Canvas EQ1: a coach reads a client's gyms with their workouts, to see when a plan outgrows them.
public class ClientPlacesTests
{
    [Fact]
    public async Task A_coach_reads_a_clients_places_only_while_workouts_are_shared()
    {
        using var api = new ApiFactory();
        var (coach, coachId, _) = await api.SignUpAsync("cora", UserTier.Studio);
        var (client, clientId, _) = await api.SignUpAsync("niall", UserTier.Pro);
        var relId = await api.WithDbAsync(async db =>
        {
            var rel = new CoachClientRelationship { CoachId = coachId, ClientId = clientId, Status = CoachClientStatus.Active };
            db.CoachClientRelationships.Add(rel);
            await db.SaveChangesAsync();
            return rel.Id;
        });
        (await client.PostAsJsonAsync("/sync/places", new { places = new[] { new { id = "place_1", createdAtMs = 1, updatedAtMs = 1, dataJson = "{\"name\":\"Flyefit\"}" } } })).EnsureSuccessStatusCode();

        var seen = await coach.GetAsync($"/sync/places?since=0&clientId={clientId}");
        seen.EnsureSuccessStatusCode();
        Assert.Single((await seen.Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json)).GetProperty("places").EnumerateArray());

        (await client.PutAsJsonAsync($"/coach/relationships/{relId}/sharing", new { workouts = false, nutrition = true, bodyweight = true, habits = true, checkins = true })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Forbidden, (await coach.GetAsync($"/sync/places?since=0&clientId={clientId}")).StatusCode);
    }
}
