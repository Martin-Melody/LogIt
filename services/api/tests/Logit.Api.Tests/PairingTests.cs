using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Tests;

/// Scan-to-sign-in (web onboarding W1) and Where you're signed in.
public class PairingTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _api;
    public PairingTests(ApiFactory api) => _api = api;

    private const string ChromeOnWindows =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

    private static async Task<JsonElement> Json(HttpResponseMessage res)
    {
        var text = await res.Content.ReadAsStringAsync();
        Assert.True(res.IsSuccessStatusCode, $"{(int)res.StatusCode}: {text}");
        return JsonDocument.Parse(text).RootElement;
    }

    private async Task<(HttpClient Web, Guid Id, string Qr, string Secret)> StartOnComputer()
    {
        var web = _api.CreateClient();
        web.DefaultRequestHeaders.UserAgent.ParseAdd(ChromeOnWindows);
        var started = await Json(await web.PostAsync("/auth/pair", null));
        var qr = started.GetProperty("qr").GetString()!;
        Assert.StartsWith("logit-pair:", qr);
        return (web, started.GetProperty("id").GetGuid(), qr, started.GetProperty("secret").GetString()!);
    }

    private static async Task<string> PollState(HttpClient web, Guid id, string secret) =>
        (await Json(await web.PostAsJsonAsync($"/auth/pair/{id}/poll", new { secret }))).GetProperty("state").GetString()!;

    [Fact]
    public async Task Phone_approves_and_the_computer_gets_its_own_session_once()
    {
        var (phone, userId, _) = await _api.SignUpAsync("pair_ok");
        var (web, id, qr, secret) = await StartOnComputer();

        Assert.Equal("waiting", await PollState(web, id, secret));

        var look = await Json(await phone.PostAsJsonAsync("/auth/pair/look", new { code = qr }));
        Assert.Equal("Chrome on Windows", look.GetProperty("device").GetString());

        await Json(await phone.PostAsJsonAsync("/auth/pair/answer", new { code = qr, approve = true }));

        var poll = await Json(await web.PostAsJsonAsync($"/auth/pair/{id}/poll", new { secret }));
        Assert.Equal("approved", poll.GetProperty("state").GetString());
        var auth = poll.GetProperty("auth");
        Assert.Equal(userId, auth.GetProperty("user").GetProperty("id").GetGuid());
        var signedIn = _api.ClientWithToken(auth.GetProperty("accessToken").GetString()!);
        Assert.Equal(HttpStatusCode.OK, (await signedIn.GetAsync("/users/me")).StatusCode);

        // Used up: the poll says so and the code can't be looked up or answered again.
        Assert.Equal("used", await PollState(web, id, secret));
        Assert.Equal(HttpStatusCode.Gone, (await phone.PostAsJsonAsync("/auth/pair/look", new { code = qr })).StatusCode);
        Assert.Equal(HttpStatusCode.Gone, (await phone.PostAsJsonAsync("/auth/pair/answer", new { code = qr, approve = true })).StatusCode);

        // The computer is its own row in Where you're signed in, and the phone can sign it out.
        var sessions = (await Json(await phone.GetAsync("/auth/sessions"))).GetProperty("sessions").EnumerateArray().ToList();
        Assert.Equal(2, sessions.Count);
        Assert.True(sessions[0].GetProperty("current").GetBoolean());
        var computer = sessions.Single(s => !s.GetProperty("current").GetBoolean());
        Assert.Equal("Chrome on Windows · from your phone", computer.GetProperty("label").GetString());
        Assert.Equal(HttpStatusCode.NoContent, (await phone.DeleteAsync($"/auth/sessions/{computer.GetProperty("id").GetGuid()}")).StatusCode);
        var refreshed = await web.PostAsJsonAsync("/auth/refresh", new { refreshToken = auth.GetProperty("refreshToken").GetString() });
        Assert.Equal(HttpStatusCode.Unauthorized, refreshed.StatusCode);
    }

    [Fact]
    public async Task Turned_down_wrong_secret_and_expired_requests_sign_nobody_in()
    {
        var (phone, _, _) = await _api.SignUpAsync("pair_no");

        var (web, id, qr, secret) = await StartOnComputer();
        await Json(await phone.PostAsJsonAsync("/auth/pair/answer", new { code = qr, approve = false }));
        Assert.Equal("denied", await PollState(web, id, secret));

        var (web2, id2, qr2, secret2) = await StartOnComputer();
        await Json(await phone.PostAsJsonAsync("/auth/pair/answer", new { code = qr2, approve = true }));
        // Only the page holding the secret can collect; the code from the QR is not enough.
        Assert.Equal(HttpStatusCode.NotFound, (await web2.PostAsJsonAsync($"/auth/pair/{id2}/poll", new { secret = "wrong" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await web2.PostAsJsonAsync($"/auth/pair/{id2}/poll", new { secret = qr2 })).StatusCode);
        Assert.Equal("approved", await PollState(web2, id2, secret2));

        var (web3, id3, qr3, secret3) = await StartOnComputer();
        await _api.WithDbAsync(async db =>
        {
            var p = await db.PairingRequests.SingleAsync(x => x.Id == id3);
            p.ExpiresAt = DateTime.UtcNow.AddSeconds(-1);
            await db.SaveChangesAsync();
        });
        Assert.Equal(HttpStatusCode.Gone, (await phone.PostAsJsonAsync("/auth/pair/look", new { code = qr3 })).StatusCode);
        Assert.Equal("expired", await PollState(web3, id3, secret3));

        // Looking up and answering need a signed-in phone.
        var anon = _api.CreateClient();
        var (_, _, qr4, _) = await StartOnComputer();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.PostAsJsonAsync("/auth/pair/answer", new { code = qr4, approve = true })).StatusCode);
    }

    [Fact]
    public async Task A_session_keeps_its_row_through_refreshes()
    {
        var (_, _, username) = await _api.SignUpAsync("sess_rot");
        var web = _api.CreateClient();
        web.DefaultRequestHeaders.UserAgent.ParseAdd(ChromeOnWindows);
        var login = await Json(await web.PostAsJsonAsync("/auth/login", new { usernameOrEmail = username, password = "Passw0rd!long" }));
        var refresh = login.GetProperty("refreshToken").GetString()!;
        for (var i = 0; i < 3; i++)
            refresh = (await Json(await web.PostAsJsonAsync("/auth/refresh", new { refreshToken = refresh }))).GetProperty("refreshToken").GetString()!;
        var last = await Json(await web.PostAsJsonAsync("/auth/refresh", new { refreshToken = refresh }));

        var me = _api.ClientWithToken(last.GetProperty("accessToken").GetString()!);
        var sessions = (await Json(await me.GetAsync("/auth/sessions"))).GetProperty("sessions").EnumerateArray().ToList();
        // Sign-up and this browser: two rows, however many times the browser refreshed.
        Assert.Equal(2, sessions.Count);
        var mine = sessions.Single(s => s.GetProperty("current").GetBoolean());
        Assert.Equal("Chrome on Windows", mine.GetProperty("label").GetString());
    }
}
