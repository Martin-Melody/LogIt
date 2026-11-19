using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Admin;
using Logit.Api.Features.Email;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Logit.Api.Tests;

/// getlogit.app's admin pages, Cloudflare Access, and what admins can and can't do quietly.
public class AdminHostedTests
{
    private const string Key = "test-admin-key-that-is-long-enough-1234";

    private sealed class FakeEmail : IEmailSender
    {
        public List<(string To, string Subject)> Sent { get; } = [];
        public bool IsConfigured => true;
        public Task SendAsync(string toAddress, string subject, string textBody)
        {
            lock (Sent) Sent.Add((toAddress, subject));
            return Task.CompletedTask;
        }
    }

    private static async Task<(ApiFactory Api, HttpClient Admin)> ServerWithAdminAsync(ApiFactory api)
    {
        var (admin, _, _) = await api.SignUpAsync("alex");
        (await admin.PostAsJsonAsync("/admin/claim", new { key = Key })).EnsureSuccessStatusCode();
        return (api, admin);
    }

    private static async Task<JsonElement> Json(HttpResponseMessage res) =>
        await res.Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);

    [Fact]
    public async Task Hosted_only_pages_are_refused_on_self_hosted_servers()
    {
        var (api, admin) = await ServerWithAdminAsync(new ApiFactory { AdminKey = Key, Settings = { ["Deployment:SelfHosted"] = "true" } });
        using var _ = api;
        foreach (var path in new[] { "/admin/api/subscriptions", "/admin/api/growth", "/admin/api/diagnostics", "/admin/api/discover" })
            Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/admin/api/overview")).StatusCode);
    }

    [Fact]
    public async Task Subscriptions_count_paying_people_and_keep_tests_apart()
    {
        var (api, admin) = await ServerWithAdminAsync(new ApiFactory { AdminKey = Key });
        using var _ = api;
        var (_, sarah, _) = await api.SignUpAsync("sarah");
        var (_, dara, _) = await api.SignUpAsync("dara");
        var now = DateTime.UtcNow;
        await api.WithDbAsync(async db =>
        {
            db.BillingSubscriptions.AddRange(
                new BillingSubscription { UserId = sarah, ExternalId = "a", Plan = UserTier.Pro, State = SubscriptionState.Active, ExpiresAt = now.AddDays(20) },
                new BillingSubscription { UserId = dara, ExternalId = "b", Plan = UserTier.Studio, State = SubscriptionState.GracePeriod, ExpiresAt = now.AddDays(3) },
                new BillingSubscription { UserId = dara, ExternalId = "c", Plan = UserTier.Pro, State = SubscriptionState.Active, ExpiresAt = now.AddDays(20), IsTest = true },
                new BillingSubscription { UserId = sarah, ExternalId = "d", Plan = UserTier.Pro, State = SubscriptionState.Replaced });
            await db.SaveChangesAsync();
        });

        var body = await Json(await admin.GetAsync("/admin/api/subscriptions"));
        var counts = body.GetProperty("counts");
        Assert.Equal(1, counts.GetProperty("payingPro").GetInt32());
        Assert.Equal(1, counts.GetProperty("payingStudio").GetInt32());
        Assert.Equal(1, counts.GetProperty("paymentProblems").GetInt32());
        Assert.Equal(1, counts.GetProperty("test").GetInt32());
        Assert.Equal(3, body.GetProperty("subscriptions").GetArrayLength()); // the replaced one is left out
    }

    [Fact]
    public async Task Growth_follows_each_weeks_sign_ups()
    {
        var (api, admin) = await ServerWithAdminAsync(new ApiFactory { AdminKey = Key });
        using var _ = api;
        var (_, niamh, _) = await api.SignUpAsync("niamh");
        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        await api.WithDbAsync(async db =>
        {
            for (var i = 0; i < 3; i++)
                db.SyncedWorkoutSessions.Add(new SyncedWorkoutSession { UserId = niamh, ClientId = $"w{i}", StartedAtMs = nowMs + i, DataJson = "{}" });
            await db.SaveChangesAsync();
        });

        var weeks = (await Json(await admin.GetAsync("/admin/api/growth"))).GetProperty("weeks").EnumerateArray().ToList();
        Assert.Equal(8, weeks.Count);
        var thisWeek = weeks[^1];
        Assert.Equal(2, thisWeek.GetProperty("signedUp").GetInt32());
        Assert.Equal(1, thisWeek.GetProperty("loggedWorkout").GetInt32());
        Assert.Equal(1, thisWeek.GetProperty("threeInWeekOne").GetInt32());
        Assert.Equal(JsonValueKind.Null, thisWeek.GetProperty("backInWeekTwo").ValueKind); // too recent to know
    }

    [Fact]
    public async Task People_hear_about_what_an_admin_changed()
    {
        var email = new FakeEmail();
        var (api, admin) = await ServerWithAdminAsync(new ApiFactory
        {
            AdminKey = Key,
            ConfigureTestServices = s => { s.RemoveAll<IEmailSender>(); s.AddSingleton<IEmailSender>(email); },
        });
        using var _ = api;
        var (_, sarah, _) = await api.SignUpAsync("sarah");

        await admin.PostAsJsonAsync($"/admin/api/users/{sarah}/reset-password", new { newPassword = "plate-ridge-curl-swing-4471" });
        await admin.PatchAsJsonAsync($"/admin/api/users/{sarah}", new { email = "sarah.new@example.com", tier = "Pro" });
        await admin.DeleteAsync($"/admin/api/users/{sarah}");

        Assert.Contains(("sarah@example.com", "Your Logit password was reset"), email.Sent);
        Assert.Contains(("sarah@example.com", "The email on your Logit account was changed"), email.Sent);
        Assert.Contains(("sarah.new@example.com", "The email on your Logit account was changed"), email.Sent);
        Assert.Contains(("sarah.new@example.com", "You've been given Logit Pro"), email.Sent);
        Assert.Contains(("sarah.new@example.com", "Your Logit account was deleted"), email.Sent);

        // Older log entries stop naming a deleted account; the deletion itself keeps the username.
        var names = await api.WithDbAsync(db => db.AdminActions.Where(a => a.TargetUserId == sarah).Select(a => a.Action + ":" + a.TargetName).ToListAsync());
        Assert.Contains("user.reset-password:a deleted account", names);
        Assert.Contains("user.delete:sarah", names);
        Assert.DoesNotContain(names, n => n.Contains("example.com"));
    }

    [Fact]
    public async Task Reading_someones_diagnostics_is_logged()
    {
        var (api, admin) = await ServerWithAdminAsync(new ApiFactory { AdminKey = Key });
        using var _ = api;
        var (_, sarah, _) = await api.SignUpAsync("sarah");
        var reportId = Guid.NewGuid();
        await api.WithDbAsync(async db =>
        {
            db.DiagnosticReports.Add(new DiagnosticReport { Id = reportId, UserId = sarah, AppVersion = "1.4", Platform = "android", Log = "x" });
            await db.SaveChangesAsync();
        });
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync($"/admin/api/diagnostics/{reportId}")).StatusCode);
        Assert.True(await api.WithDbAsync(db => db.AdminActions.AnyAsync(a => a.Action == "diagnostics.view" && a.TargetUserId == sarah)));
    }

    // ── Cloudflare Access ───────────────────────────────────────────────────

    private static readonly RsaSecurityKey SigningKey = new(RSA.Create(2048)) { KeyId = "k1" };

    private static string Token(string aud = "aud-123", string iss = "https://logit.cloudflareaccess.com", DateTime? expires = null) =>
        new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = iss,
            Audience = aud,
            Expires = expires ?? DateTime.UtcNow.AddMinutes(10),
            NotBefore = (expires ?? DateTime.UtcNow.AddMinutes(10)).AddMinutes(-30),
            SigningCredentials = new SigningCredentials(SigningKey, SecurityAlgorithms.RsaSha256),
        });

    [Fact]
    public async Task Access_tokens_must_be_signed_for_this_application_and_in_date()
    {
        var access = new CloudflareAccess("logit.cloudflareaccess.com", "aud-123", () => Task.FromResult<IList<SecurityKey>>([SigningKey]));
        Assert.True(await access.IsValidAsync(Token()));
        Assert.False(await access.IsValidAsync(Token(aud: "another-app")));
        Assert.False(await access.IsValidAsync(Token(iss: "https://evil.cloudflareaccess.com")));
        Assert.False(await access.IsValidAsync(Token(expires: DateTime.UtcNow.AddMinutes(-10))));
        Assert.False(await access.IsValidAsync(""));
        Assert.False(await access.IsValidAsync("not-a-token"));

        var otherKey = new RsaSecurityKey(RSA.Create(2048)) { KeyId = "k1" };
        var forged = new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = "https://logit.cloudflareaccess.com", Audience = "aud-123", Expires = DateTime.UtcNow.AddMinutes(10),
            SigningCredentials = new SigningCredentials(otherKey, SecurityAlgorithms.RsaSha256),
        });
        Assert.False(await access.IsValidAsync(forged));
    }

    [Fact]
    public async Task With_access_configured_an_admin_login_alone_is_not_enough()
    {
        var (api, admin) = await ServerWithAdminAsync(new ApiFactory
        {
            AdminKey = Key,
            Settings = { ["Admin:Access:TeamDomain"] = "logit.cloudflareaccess.com", ["Admin:Access:Audience"] = "aud-123" },
        });
        using var _ = api;
        var res = await admin.GetAsync("/admin/api/stats");
        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
        Assert.Contains("Cloudflare", (await Json(res)).GetProperty("error").GetString());
    }
}
