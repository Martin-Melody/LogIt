using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;

namespace Logit.Api.Features.Foods;

/// <summary>
/// Food search for the browser builds of the app. Open Food Facts' good search
/// (search.openfoodfacts.org) sends no CORS headers, so a web page can't call it; the phone
/// app calls it directly and the browser comes through here instead. Anonymous (the app
/// works without an account), rate-limited per address, and answers are kept for a few hours
/// so a popular search costs Open Food Facts one request.
/// </summary>
public static class FoodSearchEndpoints
{
    public const string RateLimitPolicy = "food-search";
    public const string HttpClientName = "open-food-facts";
    public const int MaxQueryLength = 100;

    private const string SearchUrl = "https://search.openfoodfacts.org/search";
    private const string Fields = "code,product_name,product_name_en,brands,nutriments,serving_quantity,serving_size";

    public static void MapFoodSearchEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/foods/search", Search)
            .WithTags("Foods")
            .AllowAnonymous()
            .RequireRateLimiting(RateLimitPolicy);
    }

    /// { hits: [Open Food Facts product, …] }, the same shape search.openfoodfacts.org answers
    /// with, trimmed to the fields the app reads. 502 when Open Food Facts can't be reached.
    private static async Task<IResult> Search(
        string? q, int? limit, IHttpClientFactory http, FoodSearchCache cache,
        ILoggerFactory loggerFactory, CancellationToken ct)
    {
        var query = (q ?? "").Trim();
        if (query.Length == 0) return Results.Text("{\"hits\":[]}", "application/json");
        if (query.Length > MaxQueryLength) return Results.BadRequest(new { error = "That search is too long." });
        var size = Math.Clamp(limit ?? 25, 1, 50);

        var key = $"{size}:{query.ToLowerInvariant()}";
        if (cache.TryGet(key, out var cached)) return Results.Text(cached, "application/json");

        try
        {
            var client = http.CreateClient(HttpClientName);
            using var res = await client.GetAsync(
                $"{SearchUrl}?q={Uri.EscapeDataString(query)}&page_size={size}&fields={Fields}", ct);
            if (!res.IsSuccessStatusCode)
            {
                loggerFactory.CreateLogger("Logit.Foods").LogWarning("Open Food Facts search answered {Status}", (int)res.StatusCode);
                return Results.StatusCode(StatusCodes.Status502BadGateway);
            }
            await using var stream = await res.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
            if (!doc.RootElement.TryGetProperty("hits", out var hits) || hits.ValueKind != JsonValueKind.Array)
                return Results.StatusCode(StatusCodes.Status502BadGateway);

            var json = JsonSerializer.Serialize(new { hits });
            cache.Set(key, json);
            return Results.Text(json, "application/json");
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException)
        {
            if (ct.IsCancellationRequested) return Results.StatusCode(499);
            loggerFactory.CreateLogger("Logit.Foods").LogWarning(e, "Open Food Facts search failed");
            return Results.StatusCode(StatusCodes.Status502BadGateway);
        }
    }
}

/// Recent search answers, at most ~20 MB of JSON, each kept for six hours.
public sealed class FoodSearchCache
{
    private readonly MemoryCache _cache = new(new MemoryCacheOptions { SizeLimit = 20_000_000 });

    public bool TryGet(string key, out string value)
    {
        if (_cache.TryGetValue(key, out string? v) && v is not null)
        {
            value = v;
            return true;
        }
        value = "";
        return false;
    }

    public void Set(string key, string json) =>
        _cache.Set(key, json, new MemoryCacheEntryOptions
        {
            Size = json.Length,
            AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(6),
        });
}
