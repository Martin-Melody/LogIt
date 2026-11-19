using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Tests;

/// The admin console's own endpoints: the overview, extending invites, password resets.
public class AdminConsoleTests
{
    private const string Key = "test-admin-key-that-is-long-enough-1234";

    private static async Task<(ApiFactory Api, HttpClient Admin)> ServerWithAdminAsync()
    {
        var api = new ApiFactory { AdminKey = Key };
        var (admin, _, _) = await api.SignUpAsync("alex");
        (await admin.PostAsJsonAsync("/admin/claim", new { key = Key })).EnsureSuccessStatusCode();
        return (api, admin);
    }

    [Fact]
    public async Task Overview_counts_the_last_14_days()
    {
        var (api, admin) = await ServerWithAdminAsync();
        using var _ = api;
        var (_, niamhId, _) = await api.SignUpAsync("niamh");
        var todayMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        await api.WithDbAsync(async db =>
        {
            db.SyncedWorkoutSessions.Add(new SyncedWorkoutSession { UserId = niamhId, ClientId = "a", StartedAtMs = todayMs, DataJson = "{}" });
            db.SyncedWorkoutSessions.Add(new SyncedWorkoutSession { UserId = niamhId, ClientId = "b", StartedAtMs = todayMs - 20L * 86_400_000, DataJson = "{}" });
            await db.SaveChangesAsync();
        });

        var o = await (await admin.GetAsync("/admin/api/overview")).Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);
        var days = o.GetProperty("days").EnumerateArray().ToList();
        Assert.Equal(14, days.Count);
        Assert.Equal(DateTime.UtcNow.ToString("yyyy-MM-dd"), days[^1].GetProperty("date").GetString());
        Assert.Equal(2, days[^1].GetProperty("signUps").GetInt32());
        Assert.Equal(1, days[^1].GetProperty("workouts").GetInt32());
        Assert.Equal(2, o.GetProperty("people").GetInt32());
        Assert.Equal(1, o.GetProperty("trainedThisWeek").GetInt32());
        Assert.Equal(2, o.GetProperty("workouts30Days").GetInt32());
        Assert.False(o.GetProperty("server").GetProperty("emailConfigured").GetBoolean());
        Assert.Equal("admin.claim", o.GetProperty("recentActions")[0].GetProperty("action").GetString());
    }

    [Fact]
    public async Task Extending_an_invite_counts_from_its_end_or_from_now()
    {
        var (api, admin) = await ServerWithAdminAsync();
        using var _ = api;
        var made = await (await admin.PostAsJsonAsync("/admin/api/invites", new { note = "Gym group", maxUses = 10, expiresInDays = 1 }))
            .Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);
        var id = made.GetProperty("id").GetGuid();
        var end = made.GetProperty("expiresAt").GetDateTime();

        var overview = await (await admin.GetAsync("/admin/api/overview")).Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);
        Assert.Equal(1, overview.GetProperty("invitesEndingSoon").GetArrayLength());

        var res = await admin.PostAsJsonAsync($"/admin/api/invites/{id}/extend", new { days = 7 });
        var newEnd = (await res.Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json)).GetProperty("expiresAt").GetDateTime();
        Assert.Equal(end.AddDays(7), newEnd, TimeSpan.FromSeconds(1));

        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync($"/admin/api/invites/{id}/extend", new { days = 0 })).StatusCode);
        await admin.DeleteAsync($"/admin/api/invites/{id}");
        Assert.Equal(HttpStatusCode.NotFound, (await admin.PostAsJsonAsync($"/admin/api/invites/{id}/extend", new { days = 7 })).StatusCode);
    }

    [Fact]
    public async Task A_password_reset_by_an_admin_signs_the_person_out_everywhere()
    {
        var (api, admin) = await ServerWithAdminAsync();
        using var _ = api;
        var (_, sarahId, _) = await api.SignUpAsync("sarah");

        Assert.Equal(HttpStatusCode.BadRequest,
            (await admin.PostAsJsonAsync($"/admin/api/users/{sarahId}/reset-password", new { newPassword = "short" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,
            (await admin.PostAsJsonAsync($"/admin/api/users/{sarahId}/reset-password", new { newPassword = "plate-ridge-4471" })).StatusCode);
        Assert.Equal(0, await api.WithDbAsync(db => db.RefreshTokens.CountAsync(t => t.UserId == sarahId && t.RevokedAt == null)));

        var login = await api.CreateClient().PostAsJsonAsync("/auth/login", new { usernameOrEmail = "sarah", password = "plate-ridge-4471" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
    }
}
