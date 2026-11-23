using System.Net;
using System.Net.Http.Json;
using Logit.Api.Features.Auth;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Tests;

/// Usernames hold to what the sign-up form says (letters, numbers, underscores): a space broke
/// @mentions and profile links ("ava ava" was accepted).
public class UsernameRulesTests
{
    [Theory]
    [InlineData("ava", true)]
    [InlineData("dana_coach", true)]
    [InlineData("a1_", true)]
    [InlineData("ab", false)]
    [InlineData("ava ava", false)]
    [InlineData("ava.b", false)]
    [InlineData("zoë", false)]
    [InlineData("abcdefghijabcdefghijabcdefghij", true)]
    [InlineData("abcdefghijabcdefghijabcdefghijk", false)]
    public void Valid_usernames(string name, bool valid) => Assert.Equal(valid, Usernames.IsValid(name));

    [Fact]
    public async Task Sign_up_refuses_a_username_with_a_space()
    {
        using var api = new ApiFactory();
        var res = await api.CreateClient().PostAsJsonAsync("/auth/register",
            new { username = "ava Ava", email = "ava@example.com", password = "test-pass-123", displayName = "Ava" });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal(0, await api.WithDbAsync(db => db.Users.CountAsync()));
    }

    [Fact]
    public async Task An_empty_display_name_becomes_the_username()
    {
        using var api = new ApiFactory();
        (await api.CreateClient().PostAsJsonAsync("/auth/register",
            new { username = "ava", email = "ava@example.com", password = "test-pass-123", displayName = "" })).EnsureSuccessStatusCode();
        Assert.Equal("ava", await api.WithDbAsync(db => db.Users.Select(u => u.DisplayName).SingleAsync()));
    }
}
