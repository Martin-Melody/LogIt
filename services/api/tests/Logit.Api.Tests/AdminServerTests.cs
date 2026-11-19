using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Logit.Api.Features.Diagnostics;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Tests;

/// The admin console's Server page: sign-up mode from the console, error counts, test email, backups.
public class AdminServerTests
{
    private const string Key = "test-admin-key-that-is-long-enough-1234";

    private static async Task<(ApiFactory Api, HttpClient Admin)> ServerWithAdminAsync()
    {
        var api = new ApiFactory { AdminKey = Key };
        var (admin, _, _) = await api.SignUpAsync("alex");
        (await admin.PostAsJsonAsync("/admin/claim", new { key = Key })).EnsureSuccessStatusCode();
        return (api, admin);
    }

    private static async Task<JsonElement> Json(HttpResponseMessage res) =>
        await res.Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);

    [Fact]
    public async Task Sign_up_mode_set_in_the_console_wins_over_the_env()
    {
        var (api, admin) = await ServerWithAdminAsync();
        using var _ = api;
        Assert.Equal("env", (await Json(await admin.GetAsync("/admin/api/server"))).GetProperty("registrationModeSource").GetString());

        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync("/admin/api/server/registration", new { mode = "closed" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.PutAsJsonAsync("/admin/api/server/registration", new { mode = "invite" })).StatusCode);

        var server = await Json(await admin.GetAsync("/admin/api/server"));
        Assert.Equal("invite", server.GetProperty("registrationMode").GetString());
        Assert.Equal("console", server.GetProperty("registrationModeSource").GetString());
        Assert.Equal("invite", (await Json(await api.CreateClient().GetAsync("/auth/registration"))).GetProperty("mode").GetString());

        var signUp = await api.CreateClient().PostAsJsonAsync("/auth/register", new
        {
            username = "niamh", email = "niamh@example.com", password = "Passw0rd!long", displayName = "Niamh",
        });
        Assert.Equal(HttpStatusCode.Forbidden, signUp.StatusCode);
    }

    [Fact]
    public async Task Server_errors_are_counted_per_day_and_route()
    {
        var (api, admin) = await ServerWithAdminAsync();
        using var _ = api;
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        await api.WithDbAsync(async db =>
        {
            await ServerErrors.RecordAsync(db, today.AddDays(-ServerErrors.KeepDays - 5), "GET /old");
            await ServerErrors.RecordAsync(db, today, "POST /sync/sessions"); // a new row prunes old ones
            await ServerErrors.RecordAsync(db, today, "POST /sync/sessions");
            await ServerErrors.RecordAsync(db, today, "GET /posts/feed");
            await ServerErrors.RecordAsync(db, today, "GET /posts/feed");
        });
        Assert.False(await api.WithDbAsync(db => db.ServerErrorCounts.AnyAsync(c => c.Route == "GET /old")));

        var errors = (await Json(await admin.GetAsync("/admin/api/server"))).GetProperty("errors").EnumerateArray().ToList();
        Assert.Equal(14, errors.Count);
        Assert.Equal(4, errors[^1].GetProperty("count").GetInt32());
        Assert.Equal(0, errors[0].GetProperty("count").GetInt32());

        var days = (await Json(await admin.GetAsync("/admin/api/overview"))).GetProperty("days");
        Assert.Equal(4, days[days.GetArrayLength() - 1].GetProperty("errors").GetInt32());
    }

    [Fact]
    public async Task Test_email_needs_email_set_up()
    {
        var (api, admin) = await ServerWithAdminAsync();
        using var _ = api;
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsync("/admin/api/server/test-email", null)).StatusCode);
    }

    [Fact]
    public async Task A_sqlite_server_downloads_a_copy_of_its_database()
    {
        var (api, admin) = await ServerWithAdminAsync();
        using var _ = api;
        var res = await admin.GetAsync("/admin/api/server/backup");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.StartsWith("logit-backup-", res.Content.Headers.ContentDisposition?.FileName?.Trim('"'));
        var bytes = await res.Content.ReadAsByteArrayAsync();
        Assert.Equal("SQLite format 3", Encoding.ASCII.GetString(bytes, 0, 15));
        Assert.True(await api.WithDbAsync(db => db.AdminActions.AnyAsync(a => a.Action == "server.backup")));
    }
}
