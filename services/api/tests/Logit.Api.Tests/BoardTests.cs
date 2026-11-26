using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Logit.Api.Features.Social;

namespace Logit.Api.Tests;

/// Boards (design canvas G4, B2, P1; journey F6): effort, never weight.
public class BoardTests : IDisposable
{
    private readonly ApiFactory _api = new();
    public void Dispose() => _api.Dispose();

    private static string Monday()
    {
        var d = DateTime.UtcNow.Date;
        return d.AddDays(-(((int)d.DayOfWeek + 6) % 7)).ToString("yyyy-MM-dd");
    }
    private static async Task Week(HttpClient who, int done, int planned, int weeks, int? volume = null, bool rest = false) =>
        (await who.PutAsJsonAsync("/boards/me", new { week = Monday(), done, planned, weeksKept = weeks, volumePct = volume, rest })).EnsureSuccessStatusCode();
    private static async Task<List<string>> Names(HttpClient who, string url) =>
        [.. (await who.GetFromJsonAsync<JsonElement>(url, ApiFactory.Json)).GetProperty("rows").EnumerateArray().Select(r => r.GetProperty("user").GetProperty("username").GetString()!)];

    [Fact]
    public async Task A_groups_board_orders_by_share_done_then_weeks_kept_and_honours_both_switches()
    {
        var (conor, _, _) = await _api.SignUpAsync("conor");
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var (ben, _, _) = await _api.SignUpAsync("ben");
        var (jamie, _, _) = await _api.SignUpAsync("jamie");
        var g = await (await conor.PostAsJsonAsync("/groups", new { name = "Iron Club" })).Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);
        var id = g.GetProperty("id").GetString();
        foreach (var who in new[] { ava, ben, jamie }) (await who.PostAsJsonAsync($"/groups/join/{g.GetProperty("inviteCode").GetString()}", new { })).EnsureSuccessStatusCode();

        await Week(conor, 3, 4, 3, -4);
        await Week(ava, 4, 4, 12, 6);       // all done, longest run
        await Week(ben, 4, 4, 6, 2);        // all done
        await Week(jamie, 0, 0, 5, rest: true); // a paused week: counts as kept, not last
        Assert.Equal(["ava", "ben", "jamie", "conor"], await Names(conor, $"/groups/{id}/board?week={Monday()}"));

        // Ben leaves this group's board; Ava leaves all boards. Both still see it.
        (await ben.PutAsJsonAsync($"/groups/{id}/me", new { onBoard = false })).EnsureSuccessStatusCode();
        (await ava.PutAsJsonAsync("/users/me/social-settings", new { showOnBoards = false })).EnsureSuccessStatusCode();
        Assert.Equal(["jamie", "conor"], await Names(ben, $"/groups/{id}/board?week={Monday()}"));
        Assert.True((await ben.GetFromJsonAsync<JsonElement>($"/groups/{id}/board?week={Monday()}", ApiFactory.Json)).GetProperty("meHidden").GetBoolean());

        var (dev, _, _) = await _api.SignUpAsync("dev");
        Assert.Equal(HttpStatusCode.NotFound, (await dev.GetAsync($"/groups/{id}/board?week={Monday()}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await dev.PutAsJsonAsync("/boards/me", new { week = "2026-11-25", done = 1, planned = 3, weeksKept = 0 })).StatusCode); // not a Monday
    }

    [Fact]
    public async Task The_friends_board_is_you_and_people_who_follow_each_other_with_you()
    {
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var (ben, _, _) = await _api.SignUpAsync("ben");
        var (cara, _, _) = await _api.SignUpAsync("cara");
        (await ava.PostAsync("/users/ben/follow", null)).EnsureSuccessStatusCode();
        (await ben.PostAsync("/users/ava/follow", null)).EnsureSuccessStatusCode();
        (await ava.PostAsync("/users/cara/follow", null)).EnsureSuccessStatusCode(); // one way only
        foreach (var (who, n) in new[] { (ava, 2), (ben, 3), (cara, 4) }) await Week(who, n, 4, 1);
        Assert.Equal(["ben", "ava"], await Names(ava, $"/boards/friends?week={Monday()}")); // not Cara: she doesn't follow back
    }

    [Fact]
    public void A_rest_week_counts_as_kept_and_nothing_planned_with_nothing_done_sits_last()
    {
        static BoardEndpoints.RowDto Row(string n, int done, int planned, int weeks, bool rest = false) =>
            new(new BoardEndpoints.PersonDto(n, n, null, Guid.NewGuid()), done, planned, weeks, null, rest, false);
        var ranked = BoardEndpoints.Rank([Row("idle", 0, 0, 0), Row("half", 2, 4, 9), Row("rest", 0, 0, 2, true), Row("all", 3, 3, 1)]);
        Assert.Equal(["rest", "all", "half", "idle"], ranked.Select(r => r.User.Username));
    }
}
