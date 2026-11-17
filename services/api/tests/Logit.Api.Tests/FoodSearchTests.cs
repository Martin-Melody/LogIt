using System.Net;
using System.Text.Json;
using Logit.Api.Features.Foods;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace Logit.Api.Tests;

public class FoodSearchTests
{
    /// Stands in for search.openfoodfacts.org and counts the calls.
    private sealed class FakeOff(HttpStatusCode status, string body) : HttpMessageHandler
    {
        public int Calls;
        public Uri? LastUri;
        public string? LastUserAgent;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Calls++;
            LastUri = request.RequestUri;
            LastUserAgent = request.Headers.UserAgent.ToString();
            return Task.FromResult(new HttpResponseMessage(status) { Content = new StringContent(body) });
        }
    }

    private static HttpClient Client(ApiFactory factory, FakeOff off, int perMinute = 60) =>
        factory.WithWebHostBuilder(b =>
        {
            b.UseSetting("FoodSearch:PerMinute", perMinute.ToString());
            b.ConfigureServices(s => s.AddHttpClient(FoodSearchEndpoints.HttpClientName).ConfigurePrimaryHttpMessageHandler(() => off));
        }).CreateClient();

    private const string Hits = """{"hits":[{"code":"123","product_name":"Skyr"}],"count":1,"took":3}""";

    [Fact]
    public async Task Search_passes_the_hits_through_without_an_account()
    {
        using var factory = new ApiFactory();
        var off = new FakeOff(HttpStatusCode.OK, Hits);
        var http = Client(factory, off);

        var res = await http.GetAsync("/foods/search?q=greek%20yog&limit=10");

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = JsonDocument.Parse(await res.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("Skyr", body.GetProperty("hits")[0].GetProperty("product_name").GetString());
        Assert.False(body.TryGetProperty("count", out _));
        Assert.Contains("q=greek%20yog", off.LastUri!.Query);
        Assert.Contains("page_size=10", off.LastUri.Query);
        Assert.StartsWith("LogIt/", off.LastUserAgent);
    }

    [Fact]
    public async Task The_same_search_is_answered_from_the_cache()
    {
        using var factory = new ApiFactory();
        var off = new FakeOff(HttpStatusCode.OK, Hits);
        var http = Client(factory, off);

        await http.GetAsync("/foods/search?q=Skyr");
        var again = await http.GetAsync("/foods/search?q=skyr");

        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        Assert.Equal(1, off.Calls);
    }

    [Fact]
    public async Task Empty_and_overlong_searches_never_reach_open_food_facts()
    {
        using var factory = new ApiFactory();
        var off = new FakeOff(HttpStatusCode.OK, Hits);
        var http = Client(factory, off);

        var empty = await http.GetAsync("/foods/search?q=%20");
        var tooLong = await http.GetAsync($"/foods/search?q={new string('a', FoodSearchEndpoints.MaxQueryLength + 1)}");

        Assert.Equal(HttpStatusCode.OK, empty.StatusCode);
        Assert.Equal("""{"hits":[]}""", await empty.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
        Assert.Equal(0, off.Calls);
    }

    [Fact]
    public async Task An_open_food_facts_outage_is_a_502()
    {
        using var factory = new ApiFactory();
        var http = Client(factory, new FakeOff(HttpStatusCode.ServiceUnavailable, "down"));

        var res = await http.GetAsync("/foods/search?q=skyr");

        Assert.Equal(HttpStatusCode.BadGateway, res.StatusCode);
    }

    [Fact]
    public async Task Searches_are_rate_limited_per_address()
    {
        using var factory = new ApiFactory();
        var http = Client(factory, new FakeOff(HttpStatusCode.OK, Hits), perMinute: 2);

        await http.GetAsync("/foods/search?q=a1");
        await http.GetAsync("/foods/search?q=a2");
        var third = await http.GetAsync("/foods/search?q=a3");

        Assert.Equal(HttpStatusCode.TooManyRequests, third.StatusCode);
    }
}
