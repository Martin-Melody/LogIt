using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Tests;

/// "Invite a friend" (design canvas T3; journey F2 in docs/testing-friends.md).
public class FriendInviteTests : IDisposable
{
    private readonly ApiFactory _api = new();
    public void Dispose() => _api.Dispose();

    private static async Task<string> Code(HttpClient http) =>
        (await http.GetFromJsonAsync<JsonElement>("/friends/invite", ApiFactory.Json)).GetProperty("code").GetString()!;

    private Task<bool> Follows(Guid a, Guid b) => _api.WithDbAsync(db => db.Follows.AnyAsync(f => f.FollowerId == a && f.FollowedId == b));

    [Fact]
    public async Task Accepting_makes_you_follow_each_other_and_tells_only_the_inviter()
    {
        var (ava, avaId, _) = await _api.SignUpAsync("ava");
        var (ben, benId, _) = await _api.SignUpAsync("ben");
        var code = await Code(ava);
        Assert.Equal(code, await Code(ava)); // one link per person

        var preview = await _api.CreateClient().GetFromJsonAsync<JsonElement>($"/friends/invites/{code}", ApiFactory.Json); // before signing in
        Assert.Equal("ava", preview.GetProperty("username").GetString());
        Assert.False(preview.TryGetProperty("email", out _));

        (await ben.PostAsync($"/friends/invites/{code}/accept", null)).EnsureSuccessStatusCode();
        Assert.True(await Follows(benId, avaId));
        Assert.True(await Follows(avaId, benId));
        Assert.Equal(1, await _api.WithDbAsync(db => db.Notifications.CountAsync(n => n.UserId == avaId && n.ActorId == benId && n.Type == NotificationType.Follow)));
        Assert.Equal(0, await _api.WithDbAsync(db => db.Notifications.CountAsync(n => n.UserId == benId)));

        // Accepting again changes nothing.
        (await ben.PostAsync($"/friends/invites/{code}/accept", null)).EnsureSuccessStatusCode();
        Assert.Equal(2, await _api.WithDbAsync(db => db.Follows.CountAsync()));
    }

    [Fact]
    public async Task Accepting_counts_as_approval_for_a_private_account_on_either_side()
    {
        var (cara, caraId, _) = await _api.SignUpAsync("cara");
        var (ben, benId, _) = await _api.SignUpAsync("ben");
        (await cara.PutAsJsonAsync("/users/me/social-settings", new { isPrivate = true })).EnsureSuccessStatusCode();
        (await ben.PutAsJsonAsync("/users/me/social-settings", new { isPrivate = true })).EnsureSuccessStatusCode();
        (await cara.PostAsync("/users/ben/follow", null)).EnsureSuccessStatusCode(); // a request waiting

        (await ben.PostAsync($"/friends/invites/{await Code(cara)}/accept", null)).EnsureSuccessStatusCode();
        Assert.True(await Follows(benId, caraId));
        Assert.True(await Follows(caraId, benId));
        Assert.Equal(0, await _api.WithDbAsync(db => db.FollowRequests.CountAsync()));
        Assert.Equal(0, await _api.WithDbAsync(db => db.Notifications.CountAsync(n => n.Type == NotificationType.FollowRequest)));
    }

    [Fact]
    public async Task Not_your_own_link_not_across_a_block_and_a_new_link_retires_the_old()
    {
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var (dev, _, _) = await _api.SignUpAsync("dev");
        var code = await Code(ava);
        Assert.Equal(HttpStatusCode.BadRequest, (await ava.PostAsync($"/friends/invites/{code}/accept", null)).StatusCode);

        (await ava.PostAsync("/users/dev/block", null)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await dev.PostAsync($"/friends/invites/{code}/accept", null)).StatusCode);

        var fresh = (await (await ava.PostAsync("/friends/invite/new", null)).Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json)).GetProperty("code").GetString();
        Assert.NotEqual(code, fresh);
        Assert.Equal(HttpStatusCode.NotFound, (await _api.CreateClient().GetAsync($"/friends/invites/{code}")).StatusCode);
    }
}
