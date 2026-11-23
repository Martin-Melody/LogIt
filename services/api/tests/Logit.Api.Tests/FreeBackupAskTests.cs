using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Tests;

/// Decision D5 (bug hunt 12.1): a second phone signing in asks before taking a Free account's
/// backup; older apps (no flag) keep the old move.
public class FreeBackupAskTests
{
    private static async Task<JsonElement> Login(ApiFactory api, string device, bool ask)
    {
        var http = api.CreateClient();
        http.DefaultRequestHeaders.Add("X-Logit-Device", device);
        var res = await http.PostAsJsonAsync("/auth/login", new { usernameOrEmail = "fay", password = "Passw0rd!long", askBeforeMovingBackup = ask });
        res.EnsureSuccessStatusCode();
        return await res.Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);
    }

    private static async Task<string?> Holder(ApiFactory api)
    {
        string? device = null;
        await api.WithDbAsync(async db => device = (await db.Users.SingleAsync(u => u.Username == "fay")).BackupDeviceId);
        return device;
    }

    [Fact]
    public async Task A_second_phone_is_asked_first_and_moves_the_backup_only_when_told_to()
    {
        using var api = new ApiFactory();
        await api.SignUpAsync("fay");
        await Login(api, "phone-a", ask: true);
        Assert.Equal("phone-a", await Holder(api)); // nobody held it: the first phone takes it

        var b = await Login(api, "phone-b", ask: true);
        Assert.True(b.GetProperty("backupElsewhere").GetBoolean());
        Assert.Equal("phone-a", await Holder(api));

        var http = api.CreateClient();
        http.DefaultRequestHeaders.Add("X-Logit-Device", "phone-b");
        http.DefaultRequestHeaders.Authorization = new("Bearer", b.GetProperty("accessToken").GetString());
        Assert.Equal(HttpStatusCode.NoContent, (await http.PostAsync("/sync/backup/here", null)).StatusCode);
        Assert.Equal("phone-b", await Holder(api));
    }

    [Fact]
    public async Task An_older_app_still_moves_it_on_sign_in()
    {
        using var api = new ApiFactory();
        await api.SignUpAsync("fay");
        await Login(api, "phone-a", ask: false);
        var b = await Login(api, "phone-b", ask: false);
        Assert.False(b.GetProperty("backupElsewhere").GetBoolean());
        Assert.Equal("phone-b", await Holder(api));
    }
}
