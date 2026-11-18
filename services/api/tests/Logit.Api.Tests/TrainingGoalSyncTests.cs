using System.Net.Http.Json;
using System.Text.Json;

namespace Logit.Api.Tests;

/// The onboarding goal rides in the synced profile so the dashboard can arrange Overview by it,
/// and a push from an app that doesn't know the field yet doesn't wipe it.
public class TrainingGoalSyncTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _api;
    public TrainingGoalSyncTests(ApiFactory api) => _api = api;

    private static object Profile(long at, string? goal) => new
    {
        displayName = "Sam", bio = "", avatarDataUrl = (string?)null, progressPhotoDataUrl = (string?)null,
        height = (double?)null, heightUnit = "cm", weight = (double?)null, weightUnit = "kg",
        blocksCollapsedByDefault = false, restDefaultsJson = "{}", navConfigJson = (string?)null,
        homeConfigJson = (string?)null, activeSplitId = (string?)null, updatedAtMs = at, trainingGoal = goal,
    };

    private static async Task<string?> StoredGoal(HttpClient http)
    {
        var body = await http.GetFromJsonAsync<JsonElement>("/sync/profile");
        return body.GetProperty("profile").TryGetProperty("trainingGoal", out var g) && g.ValueKind == JsonValueKind.String
            ? g.GetString() : null;
    }

    [Fact]
    public async Task Goal_is_kept_and_survives_a_push_without_it()
    {
        var (http, _, _) = await _api.SignUpAsync("goal_sync", Logit.Api.Data.Entities.UserTier.Pro);
        (await http.PostAsJsonAsync("/sync/profile", Profile(10, "leaner"))).EnsureSuccessStatusCode();
        Assert.Equal("leaner", await StoredGoal(http));

        (await http.PostAsJsonAsync("/sync/profile", Profile(20, null))).EnsureSuccessStatusCode();
        Assert.Equal("leaner", await StoredGoal(http));

        (await http.PostAsJsonAsync("/sync/profile", Profile(30, "strength"))).EnsureSuccessStatusCode();
        Assert.Equal("strength", await StoredGoal(http));
    }
}
