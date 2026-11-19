using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Tests;

/// Admin accounts: claiming admin with ADMIN_KEY, who may use /admin/api, never losing the last
/// admin, and the action log.
public class AdminAccountTests
{
    private const string Key = "test-admin-key-that-is-long-enough-1234";

    private static async Task<JsonElement> Json(HttpResponseMessage res) =>
        await res.Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);

    private static async Task<HttpResponseMessage> Claim(HttpClient http, string key) =>
        await http.PostAsJsonAsync("/admin/claim", new { key });

    [Fact]
    public async Task First_account_claims_admin_with_the_key()
    {
        using var api = new ApiFactory { AdminKey = Key };
        var (alex, alexId, _) = await api.SignUpAsync("alex");
        var (niamh, _, _) = await api.SignUpAsync("niamh");

        var me = await Json(await alex.GetAsync("/admin/me"));
        Assert.False(me.GetProperty("isAdmin").GetBoolean());
        Assert.True(me.GetProperty("claimOffered").GetBoolean());

        // 403, not 401: a 401 would make the app refresh its session and send the key again.
        Assert.Equal(HttpStatusCode.Forbidden, (await Claim(alex, "wrong-key")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Claim(alex, Key)).StatusCode);

        me = await Json(await alex.GetAsync("/admin/me"));
        Assert.True(me.GetProperty("isAdmin").GetBoolean());
        // Once someone is admin, nobody else is offered the claim (the key still works for recovery).
        me = await Json(await niamh.GetAsync("/admin/me"));
        Assert.False(me.GetProperty("claimOffered").GetBoolean());

        var log = await api.WithDbAsync(db => db.AdminActions.SingleAsync());
        Assert.Equal("admin.claim", log.Action);
        Assert.Equal(alexId, log.ActorUserId);
    }

    [Fact]
    public async Task Only_admins_and_the_key_can_use_the_admin_api()
    {
        using var api = new ApiFactory { AdminKey = Key };
        var (alex, _, _) = await api.SignUpAsync("alex");
        var (niamh, _, _) = await api.SignUpAsync("niamh");
        await Claim(alex, Key);

        Assert.Equal(HttpStatusCode.OK, (await alex.GetAsync("/admin/api/stats")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await niamh.GetAsync("/admin/api/stats")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.CreateClient().GetAsync("/admin/api/stats")).StatusCode);

        var withKey = api.CreateClient();
        withKey.DefaultRequestHeaders.Add("X-Admin-Key", Key);
        Assert.Equal(HttpStatusCode.OK, (await withKey.GetAsync("/admin/api/stats")).StatusCode);

        // A wrong key is judged as a key, even from a signed-in admin.
        alex.DefaultRequestHeaders.Add("X-Admin-Key", "wrong-key");
        Assert.Equal(HttpStatusCode.Unauthorized, (await alex.GetAsync("/admin/api/stats")).StatusCode);
    }

    [Fact]
    public async Task Admins_can_be_added_and_removed_but_never_the_last_one()
    {
        using var api = new ApiFactory { AdminKey = Key };
        var (alex, alexId, _) = await api.SignUpAsync("alex");
        var (niamh, niamhId, _) = await api.SignUpAsync("niamh");
        await Claim(alex, Key);

        Assert.Equal(HttpStatusCode.Conflict, (await alex.PatchAsJsonAsync($"/admin/api/users/{alexId}", new { isAdmin = false })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await alex.DeleteAsync($"/admin/api/users/{alexId}")).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await alex.PatchAsJsonAsync($"/admin/api/users/{niamhId}", new { isAdmin = true })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await niamh.GetAsync("/admin/api/stats")).StatusCode);

        // Removing an admin takes effect on their next request, not when their token expires.
        Assert.Equal(HttpStatusCode.NoContent, (await niamh.PatchAsJsonAsync($"/admin/api/users/{alexId}", new { isAdmin = false })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await alex.GetAsync("/admin/api/stats")).StatusCode);

        var actions = await api.WithDbAsync(db => db.AdminActions.OrderBy(a => a.CreatedAt).Select(a => a.Action + " " + a.ActorName + " " + a.TargetName).ToListAsync());
        Assert.Equal(["admin.claim alex alex", "admin.grant alex niamh", "admin.remove niamh alex"], actions);
    }

    [Fact]
    public async Task Admin_actions_name_who_did_them()
    {
        using var api = new ApiFactory { AdminKey = Key };
        var (alex, _, _) = await api.SignUpAsync("alex");
        var (_, conorId, _) = await api.SignUpAsync("conor");
        await Claim(alex, Key);

        await alex.PostAsJsonAsync($"/admin/api/users/{conorId}/reset-password", new { newPassword = "N3w-password-long" });
        var withKey = api.CreateClient();
        withKey.DefaultRequestHeaders.Add("X-Admin-Key", Key);
        await withKey.DeleteAsync($"/admin/api/users/{conorId}/tokens");
        await withKey.PostAsJsonAsync("/admin/api/invites", new { note = "Gym group", maxUses = 10 });

        var log = await Json(await alex.GetAsync("/admin/api/actions"));
        var rows = log.EnumerateArray().Select(a => $"{a.GetProperty("action").GetString()} by {a.GetProperty("actorName").GetString()}").ToList();
        Assert.Contains("user.reset-password by alex", rows);
        Assert.Contains("user.sign-out by admin key", rows);
        Assert.Contains("invite.create by admin key", rows);

        // The person page shows what was done to them, and the entries outlive the account.
        var conor = await Json(await alex.GetAsync($"/admin/api/users/{conorId}"));
        Assert.Equal(2, conor.GetProperty("adminActions").GetArrayLength());
        await alex.DeleteAsync($"/admin/api/users/{conorId}");
        Assert.Equal(3, await api.WithDbAsync(db => db.AdminActions.CountAsync(a => a.TargetUserId == conorId)));
    }

    [Fact]
    public async Task Without_a_key_existing_admins_still_work_and_nobody_can_claim()
    {
        using var api = new ApiFactory();
        var (alex, alexId, _) = await api.SignUpAsync("alex");
        var (niamh, _, _) = await api.SignUpAsync("niamh");
        await api.WithDbAsync(async db =>
        {
            (await db.Users.SingleAsync(u => u.Id == alexId)).IsAdmin = true;
            await db.SaveChangesAsync();
        });

        Assert.Equal(HttpStatusCode.NotFound, (await Claim(niamh, "anything")).StatusCode);
        Assert.False((await Json(await niamh.GetAsync("/admin/me"))).GetProperty("claimOffered").GetBoolean());
        Assert.Equal(HttpStatusCode.OK, (await alex.GetAsync("/admin/api/stats")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await api.CreateClient().GetAsync("/admin")).StatusCode);

        var withKey = api.CreateClient();
        withKey.DefaultRequestHeaders.Add("X-Admin-Key", "anything");
        Assert.Equal(HttpStatusCode.Unauthorized, (await withKey.GetAsync("/admin/api/stats")).StatusCode);
    }
}
