using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Tests;

/// A Free account can try the coaching space with sample clients (web onboarding, W3). Whatever
/// reaches a real person stays Studio: invite links, accepting requests, inviting, payments.
public class SampleCoachTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _api;
    public SampleCoachTests(ApiFactory api) => _api = api;

    private static readonly object TwoSamples = new
    {
        clients = new object[]
        {
            new { key = "aoife", displayName = "Aoife", active = true },
            new { key = "ben", displayName = "Ben", active = true },
        },
    };

    private static async Task<JsonElement> Json(HttpResponseMessage res)
    {
        var text = await res.Content.ReadAsStringAsync();
        Assert.True(res.IsSuccessStatusCode, $"{(int)res.StatusCode}: {text}");
        return JsonDocument.Parse(text).RootElement;
    }

    [Fact]
    public async Task Free_account_coaches_sample_clients_but_reaches_no_real_person()
    {
        var (free, _, _) = await _api.SignUpAsync("sc_free");
        await Json(await free.PostAsJsonAsync("/coach/sandbox", TwoSamples));

        var roster = await Json(await free.GetAsync("/coach/roster"));
        Assert.Equal(2, roster.GetProperty("roster").GetArrayLength());
        Assert.Equal(HttpStatusCode.OK, (await free.GetAsync("/coach/programs")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await free.GetAsync("/coach/checkins/inbox")).StatusCode);

        Assert.Equal(HttpStatusCode.Forbidden, (await free.PostAsJsonAsync("/coach/links", new { name = "bio" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await free.GetAsync("/coach/requests")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await free.GetAsync("/coach/payments")).StatusCode);
        var (_, _, someone) = await _api.SignUpAsync("sc_someone");
        Assert.Equal(HttpStatusCode.Forbidden, (await free.PostAsync($"/coach/clients/{someone}/invite", null)).StatusCode);
    }

    [Fact]
    public async Task Coach_who_left_Studio_with_real_clients_is_kept_out()
    {
        var (coach, coachId, _) = await _api.SignUpAsync("sc_wasstudio", UserTier.Studio);
        var (_, clientId, _) = await _api.SignUpAsync("sc_realclient");
        await _api.WithDbAsync(async db =>
        {
            db.CoachClientRelationships.Add(new CoachClientRelationship
            {
                CoachId = coachId, ClientId = clientId, Status = CoachClientStatus.Active,
            });
            await db.SaveChangesAsync();
        });
        Assert.Equal(HttpStatusCode.OK, (await coach.GetAsync("/coach/roster")).StatusCode);

        await _api.SetTierAsync(coachId, UserTier.Free);
        Assert.Equal(HttpStatusCode.Forbidden, (await coach.GetAsync("/coach/roster")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await coach.PostAsJsonAsync("/coach/sandbox", TwoSamples)).StatusCode);

        // Once that client has left, samples are fine again.
        await _api.WithDbAsync(async db =>
        {
            var rel = await db.CoachClientRelationships.SingleAsync(r => r.CoachId == coachId);
            rel.Status = CoachClientStatus.Revoked;
            await db.SaveChangesAsync();
        });
        Assert.Equal(HttpStatusCode.OK, (await coach.GetAsync("/coach/roster")).StatusCode);
    }
}
