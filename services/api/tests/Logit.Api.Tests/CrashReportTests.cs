using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Tests;

/// Test builds send crashes by themselves, with or without an account (POST /diagnostics/crashes).
public class CrashReportTests
{
    private static object Crash(string log = "ERROR crash Uncaught error") =>
        new { appVersion = "1.0.0 (7)", platform = "android", log };

    [Fact]
    public async Task A_phone_with_no_account_can_send_a_crash()
    {
        using var api = new ApiFactory();
        var http = api.CreateClient();
        http.DefaultRequestHeaders.Add("X-Logit-Device", "0123456789abcdef01234567");

        var res = await http.PostAsJsonAsync("/diagnostics/crashes", Crash());

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var r = await api.WithDbAsync(db => db.DiagnosticReports.SingleAsync());
        Assert.Null(r.UserId);
        Assert.Equal("crash", r.Kind);
        Assert.Equal("0123456789abcdef01234567", r.DeviceId);
        Assert.Equal("android", r.Platform);
    }

    [Fact]
    public async Task A_signed_in_crash_is_tied_to_the_account_and_odd_device_ids_are_dropped()
    {
        using var api = new ApiFactory();
        var (http, id, _) = await api.SignUpAsync("sam");
        http.DefaultRequestHeaders.Add("X-Logit-Device", "<not hex>");

        (await http.PostAsJsonAsync("/diagnostics/crashes", Crash())).EnsureSuccessStatusCode();

        var r = await api.WithDbAsync(db => db.DiagnosticReports.SingleAsync());
        Assert.Equal(id, r.UserId);
        Assert.Null(r.DeviceId);
    }

    [Fact]
    public async Task Empty_or_oversized_crashes_are_refused()
    {
        using var api = new ApiFactory();
        var http = api.CreateClient();
        Assert.Equal(HttpStatusCode.BadRequest, (await http.PostAsJsonAsync("/diagnostics/crashes", Crash(""))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await http.PostAsJsonAsync("/diagnostics/crashes", Crash(new string('x', 50_001)))).StatusCode);
    }

    [Fact]
    public async Task Self_hosted_servers_take_no_crashes()
    {
        using var api = new ApiFactory { Settings = { ["Deployment:SelfHosted"] = "true" } };
        var res = await api.CreateClient().PostAsJsonAsync("/diagnostics/crashes", Crash());
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Fact]
    public async Task One_phone_can_send_ten_an_hour()
    {
        using var api = new ApiFactory();
        var http = api.CreateClient();
        http.DefaultRequestHeaders.Add("X-Logit-Device", "aaaaaaaaaaaaaaaaaaaaaaaa");
        for (var i = 0; i < 10; i++)
            (await http.PostAsJsonAsync("/diagnostics/crashes", Crash())).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.TooManyRequests, (await http.PostAsJsonAsync("/diagnostics/crashes", Crash())).StatusCode);
    }
}
