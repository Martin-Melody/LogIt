using System.Net.Http.Json;
using System.Text.Json;
using Logit.Api.Data.Entities;

namespace Logit.Api.Tests;

/// Round 10 (T4): a coach inviting someone by username used to tell them nothing; the invite
/// only showed on their Coaching page.
public class CoachInviteNotificationTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _api;
    public CoachInviteNotificationTests(ApiFactory api) => _api = api;

    [Fact]
    public async Task The_person_invited_gets_a_notification_from_the_coach()
    {
        var (coach, _, coachName) = await _api.SignUpAsync("cin_coach", UserTier.Studio);
        var (lifter, _, lifterName) = await _api.SignUpAsync("cin_lifter");

        var res = await coach.PostAsync($"/coach/clients/{lifterName}/invite", null);
        Assert.True(res.IsSuccessStatusCode, await res.Content.ReadAsStringAsync());

        var body = JsonDocument.Parse(await lifter.GetStringAsync("/notifications")).RootElement;
        var n = Assert.Single(body.GetProperty("notifications").EnumerateArray());
        Assert.Equal("CoachInvite", n.GetProperty("type").GetString());
        Assert.Equal(coachName, n.GetProperty("actor").GetProperty("username").GetString());
    }

    [Fact]
    public async Task A_program_assigned_to_a_client_tells_them_once()
    {
        var (coach, _, _) = await _api.SignUpAsync("cip_coach", UserTier.Studio);
        var (client, _, clientName) = await _api.SignUpAsync("cip_client");
        var invite = JsonDocument.Parse(await (await coach.PostAsync($"/coach/clients/{clientName}/invite", null)).Content.ReadAsStringAsync()).RootElement;
        await client.PostAsync($"/coach/invites/{invite.GetProperty("relationshipId").GetString()}/accept", JsonContent.Create(new { }));

        object Program(long at) => new { programId = "cprog_t", dataJson = "{}", updatedAtMs = at, recipientUsername = clientName };
        Assert.True((await coach.PostAsJsonAsync("/coach/programs", Program(1))).IsSuccessStatusCode);
        Assert.True((await coach.PostAsJsonAsync("/coach/programs", Program(2))).IsSuccessStatusCode); // an edit: no second one

        var body = JsonDocument.Parse(await client.GetStringAsync("/notifications")).RootElement;
        Assert.Single(body.GetProperty("notifications").EnumerateArray(), n => n.GetProperty("type").GetString() == "CoachProgram");
    }
}
