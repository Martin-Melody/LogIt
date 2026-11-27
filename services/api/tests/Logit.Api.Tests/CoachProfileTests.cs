using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Tests;

/// The Coaching section of a coach's profile (canvas P1, P3).
public class CoachProfileTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _api;
    public CoachProfileTests(ApiFactory api) => _api = api;

    private static object Profile(string headline = "Strength coaching", string mode = "both", string[]? goodFor = null) => new
    {
        profile = new
        {
            headline, mode, place = "Cork", about = "**Ten years** lifting.",
            goodFor = goodFor ?? ["Strength", "Beginners"],
        },
    };

    private static async Task<JsonElement> Json(HttpResponseMessage res)
    {
        Assert.True(res.IsSuccessStatusCode, $"{(int)res.StatusCode} {await res.Content.ReadAsStringAsync()}");
        return await res.Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);
    }

    [Fact]
    public async Task A_studio_coach_saves_it_and_everyone_sees_it_with_the_listed_packages()
    {
        var (coach, coachId, username) = await _api.SignUpAsync("profile_coach", UserTier.Studio);
        Guid listed = Guid.Empty;
        await _api.WithDbAsync(async db =>
        {
            var monthly = new CoachPackage { CoachId = coachId, Name = "Monthly", AmountCents = 8000, Interval = "month" };
            var hiddenFromProfile = new CoachPackage { CoachId = coachId, Name = "Link only", AmountCents = 12000, Interval = "once", Weeks = 8 };
            listed = monthly.Id;
            db.CoachPackages.AddRange(monthly, hiddenFromProfile);
            db.CoachInviteLinks.Add(new CoachInviteLink { CoachId = coachId, Code = "PAIDLINK", Name = "Paid", PackageId = monthly.Id, CreatedAt = DateTime.UtcNow });
            db.CoachInviteLinks.Add(new CoachInviteLink { CoachId = coachId, Code = "FREELINK", Name = "Bio", CreatedAt = DateTime.UtcNow.AddDays(-3) });
            await db.SaveChangesAsync();
        });

        var saved = await Json(await coach.PutAsJsonAsync("/coach/profile", new
        {
            profile = new { headline = "  Strength coaching  ", mode = "both", place = "Cork", about = "**Ten years** lifting.", goodFor = new[] { "Strength", "strength", "Beginners" } },
            packagesOnProfile = new[] { listed },
        }));
        Assert.Equal("Strength coaching", saved.GetProperty("profile").GetProperty("headline").GetString());
        Assert.Equal(2, saved.GetProperty("profile").GetProperty("goodFor").GetArrayLength()); // duplicates go
        Assert.True(saved.GetProperty("public").GetBoolean());

        // Signed out, on getlogit.app.
        var anon = _api.CreateClient();
        var page = await Json(await anon.GetAsync($"/public/users/{username}"));
        var section = page.GetProperty("profile").GetProperty("coaching");
        Assert.Equal("Strength coaching", section.GetProperty("headline").GetString());
        Assert.Equal("**Ten years** lifting.", section.GetProperty("about").GetString());
        var packages = section.GetProperty("packages");
        Assert.Equal(1, packages.GetArrayLength());
        Assert.Equal("Monthly", packages[0].GetProperty("name").GetString());
        // "Ask to be coached" opens the free link, even though the paid one is newer.
        Assert.Equal("FREELINK", section.GetProperty("askCode").GetString());
        Assert.False(section.GetProperty("askPays").GetBoolean());

        // Signed in, in the app.
        var (other, _, _) = await _api.SignUpAsync("profile_reader");
        var viaApp = await Json(await other.GetAsync($"/users/{username}"));
        Assert.Equal("Strength coaching", viaApp.GetProperty("coaching").GetProperty("headline").GetString());
    }

    [Fact]
    public async Task It_stays_off_the_profile_until_the_account_has_studio()
    {
        var (coach, coachId, username) = await _api.SignUpAsync("trying_coach", UserTier.Pro);
        // Trying Studio (no real clients, the same rule as the rest of the coaching space):
        // they can write it and see it, not publish it.
        var saved = await Json(await coach.PutAsJsonAsync("/coach/profile", Profile()));
        Assert.False(saved.GetProperty("public").GetBoolean());
        var anon = _api.CreateClient();
        var page = await Json(await anon.GetAsync($"/public/users/{username}"));
        Assert.Equal(JsonValueKind.Null, page.GetProperty("profile").GetProperty("coaching").ValueKind);

        await _api.SetTierAsync(coachId, UserTier.Studio);
        page = await Json(await anon.GetAsync($"/public/users/{username}"));
        Assert.Equal("Strength coaching", page.GetProperty("profile").GetProperty("coaching").GetProperty("headline").GetString());
    }

    [Theory]
    [InlineData("", "both", "Add a headline")]
    [InlineData("Coach", "somewhere", "online, in person or both")]
    public async Task It_says_what_to_fix(string headline, string mode, string expected)
    {
        var (coach, _, _) = await _api.SignUpAsync($"bad_{Guid.NewGuid():N}"[..20], UserTier.Studio);
        var res = await coach.PutAsJsonAsync("/coach/profile", Profile(headline, mode));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Contains(expected, await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task No_more_than_six_good_fit_tags()
    {
        var (coach, _, _) = await _api.SignUpAsync("many_tags", UserTier.Studio);
        var res = await coach.PutAsJsonAsync("/coach/profile", Profile(goodFor: ["a", "b", "c", "d", "e", "f", "g"]));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task New_packages_show_on_the_profile()
    {
        var (coach, coachId, _) = await _api.SignUpAsync("pkg_coach", UserTier.Studio);
        // Creating a package needs a Stripe account row; the package itself is what's checked.
        await _api.WithDbAsync(async db =>
        {
            db.CoachPaymentAccounts.Add(new CoachPaymentAccount { CoachId = coachId, StripeAccountId = "acct_x", CardPaymentsActive = true, Country = "ie" });
            await db.SaveChangesAsync();
        });
        var res = await coach.PostAsJsonAsync("/coach/payments/packages", new { name = "Monthly", description = "", amountCents = 8000, interval = "month" });
        if (res.IsSuccessStatusCode)
            Assert.True(await _api.WithDbAsync(db => db.CoachPackages.AnyAsync(k => k.CoachId == coachId && k.ShowOnProfile)));
        else
            Assert.Fail($"{(int)res.StatusCode} {await res.Content.ReadAsStringAsync()}");
    }
}
