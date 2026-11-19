using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Logit.Api.Features.Auth;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Tests;

/// Setting a new server up with ADMIN_KEY at sign-up, and limits on wrong passwords.
public class ServerSetupAndLoginTests
{
    private const string Key = "test-admin-key-that-is-long-enough-1234";

    private static object Account(string name, string? adminKey = null) => new
    {
        username = name, email = $"{name}@example.com", password = "Passw0rd!long", displayName = name, adminKey,
    };

    [Fact]
    public async Task A_new_invite_only_server_is_set_up_by_signing_up_with_the_admin_key()
    {
        using var api = new ApiFactory { AdminKey = Key, Settings = { ["Registration:Mode"] = "invite" } };
        var http = api.CreateClient();

        var info = await (await http.GetAsync("/auth/registration")).Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);
        Assert.True(info.GetProperty("setup").GetBoolean());

        // Without an invite or the key, nobody gets in; a wrong key creates nothing.
        Assert.Equal(HttpStatusCode.Forbidden, (await http.PostAsJsonAsync("/auth/register", Account("niamh"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await http.PostAsJsonAsync("/auth/register", Account("niamh", "wrong-key"))).StatusCode);
        Assert.Equal(0, await api.WithDbAsync(db => db.Users.CountAsync()));

        Assert.Equal(HttpStatusCode.OK, (await http.PostAsJsonAsync("/auth/register", Account("alex", Key))).StatusCode);
        Assert.True(await api.WithDbAsync(db => db.Users.Where(u => u.Username == "alex").Select(u => u.IsAdmin).SingleAsync()));
        Assert.True(await api.WithDbAsync(db => db.AdminActions.AnyAsync(a => a.Action == "admin.claim")));

        info = await (await http.GetAsync("/auth/registration")).Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);
        Assert.False(info.GetProperty("setup").GetBoolean());
    }

    [Fact]
    public async Task Ten_wrong_passwords_lock_that_account_out_from_that_address()
    {
        using var api = new ApiFactory();
        await api.SignUpAsync("sarah");
        var http = api.CreateClient();
        HttpResponseMessage Try(string password) =>
            http.PostAsJsonAsync("/auth/login", new { usernameOrEmail = "sarah", password }).Result;

        for (var i = 0; i < LoginLockout.MaxWrongPasswords; i++)
            Assert.Equal(HttpStatusCode.Unauthorized, Try("wrong-password").StatusCode);

        // Locked out now, even with the right password, and it says why.
        var locked = Try("Passw0rd!long");
        Assert.Equal(HttpStatusCode.TooManyRequests, locked.StatusCode);
        Assert.Contains("Too many wrong passwords", await locked.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_right_password_clears_earlier_mistakes()
    {
        using var api = new ApiFactory();
        await api.SignUpAsync("sarah");
        var http = api.CreateClient();
        for (var round = 0; round < 2; round++)
        {
            for (var i = 0; i < LoginLockout.MaxWrongPasswords - 1; i++)
                await http.PostAsJsonAsync("/auth/login", new { usernameOrEmail = "sarah", password = "wrong-password" });
            var ok = await http.PostAsJsonAsync("/auth/login", new { usernameOrEmail = "sarah", password = "Passw0rd!long" });
            Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        }
    }
}
