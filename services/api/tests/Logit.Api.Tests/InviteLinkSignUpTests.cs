using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Auth;

namespace Logit.Api.Tests;

/// Opening a coach's invite link before having an account, then signing up on that page.
public class InviteLinkSignUpTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _api;
    public InviteLinkSignUpTests(ApiFactory api) => _api = api;

    [Fact]
    public async Task Anyone_can_see_a_link_before_signing_up()
    {
        var (coach, _, _) = await _api.SignUpAsync("coach_pub", UserTier.Studio);
        var link = await (await coach.PostAsJsonAsync("/coach/links", new { name = "Bio" })).Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);
        var code = link.GetProperty("code").GetString();

        var anon = _api.CreateClient();
        var res = await anon.GetAsync($"/coach/links/code/{code}");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var info = await res.Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);
        Assert.Equal("coach_pub", info.GetProperty("coach").GetProperty("username").GetString());
        Assert.Equal("active", info.GetProperty("state").GetString());
        Assert.Equal("none", info.GetProperty("relationship").GetString());
        Assert.False(info.GetProperty("isSelf").GetBoolean());

        // Asking to be coached still needs an account.
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.PostAsJsonAsync($"/coach/links/code/{code}/request", new { })).StatusCode);
    }

    [Fact]
    public async Task Sign_up_without_a_username_gets_one_from_the_name()
    {
        var http = _api.CreateClient();
        async Task<string> SignUp(string email) =>
            (await (await http.PostAsJsonAsync("/auth/register", new { email, password = "Passw0rd!long", displayName = "Zoë Walsh" }))
                .Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json)).GetProperty("user").GetProperty("username").GetString()!;

        Assert.Equal("zoewalsh", await SignUp("zoe@example.com"));
        var second = await SignUp("zoe2@example.com");
        Assert.StartsWith("zoewalsh", second);
        Assert.NotEqual("zoewalsh", second);
    }

    [Theory]
    [InlineData("Emma Walsh", "e@x.ie", "emmawalsh")]
    [InlineData("Jo", "jo.byrne@x.ie", "jobyrne")]
    [InlineData("😀", "", "member")]
    public void Usernames_come_from_the_name_then_the_email(string name, string email, string expected) =>
        Assert.Equal(expected, Usernames.Base(name, email));
}
