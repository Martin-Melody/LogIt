using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Logit.Api.Data.Entities;

namespace Logit.Api.Tests;

/// Canvas HT4: a coach's own how-tos. YouTube or Vimeo only, three cues, kept per exercise.
public class CoachHowToTests
{
    [Fact]
    public async Task Saves_a_coachs_how_tos_and_refuses_other_video_links()
    {
        using var api = new ApiFactory();
        var (coach, _, _) = await api.SignUpAsync("cora", UserTier.Studio);

        var ok = await coach.PutAsJsonAsync("/coach/howtos", new
        {
            howTos = new[]
            {
                new { exerciseName = " Goblet squat ", cues = new[] { "Elbows under it", "Sit between your heels", "" }, video = new { provider = "youtube", id = "dQw4w9WgXcQ", startSec = 12 }, note = "Depth over load." },
            },
        });
        ok.EnsureSuccessStatusCode();
        var saved = (await (await coach.GetAsync("/coach/howtos")).Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json)).GetProperty("howTos").EnumerateArray().Single();
        Assert.Equal("Goblet squat", saved.GetProperty("exerciseName").GetString());
        Assert.Equal(2, saved.GetProperty("cues").GetArrayLength());

        var bad = await coach.PutAsJsonAsync("/coach/howtos", new { howTos = new[] { new { exerciseName = "Squat", video = new { provider = "tiktok", id = "123456789" } } } });
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
    }
}
