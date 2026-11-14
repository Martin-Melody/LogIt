using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Google.Apis.Auth.OAuth2;

namespace Logit.Api.Features.Billing.GooglePlay;

/// A subscription purchase as Google Play reports it (purchases.subscriptionsv2.get),
/// reduced to what we use.
public record GoogleSubscription(
    string State,
    IReadOnlyList<string> ProductIds,
    DateTime? ExpiresAt,
    bool AutoRenewing,
    string? LinkedPurchaseToken,
    bool NeedsAcknowledge,
    string? AccountId,
    bool IsTest,
    string? LatestOrderId)
{
    public static GoogleSubscription Parse(JsonElement root)
    {
        var productIds = new List<string>();
        DateTime? expires = null;
        var autoRenewing = false;
        if (root.TryGetProperty("lineItems", out var items) && items.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in items.EnumerateArray())
            {
                if (Str(item, "productId") is { } pid) productIds.Add(pid);
                if (ParseTime(Str(item, "expiryTime")) is { } t && (expires is null || t > expires)) expires = t;
                if (item.TryGetProperty("autoRenewingPlan", out var plan)
                    && plan.TryGetProperty("autoRenewEnabled", out var on) && on.ValueKind == JsonValueKind.True)
                    autoRenewing = true;
            }
        }

        string? accountId = null;
        if (root.TryGetProperty("externalAccountIdentifiers", out var ids))
            accountId = Str(ids, "obfuscatedExternalAccountId");

        return new GoogleSubscription(
            State: Str(root, "subscriptionState") ?? "SUBSCRIPTION_STATE_UNSPECIFIED",
            ProductIds: productIds,
            ExpiresAt: expires,
            AutoRenewing: autoRenewing,
            LinkedPurchaseToken: Str(root, "linkedPurchaseToken"),
            NeedsAcknowledge: Str(root, "acknowledgementState") == "ACKNOWLEDGEMENT_STATE_PENDING",
            AccountId: accountId,
            IsTest: root.TryGetProperty("testPurchase", out _),
            LatestOrderId: Str(root, "latestOrderId"));
    }

    private static string? Str(JsonElement e, string name) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String
            ? v.GetString()
            : null;

    /// Google sends RFC 3339 times with up to 9 fractional digits; .NET parses at most 7.
    public static DateTime? ParseTime(string? s)
    {
        if (string.IsNullOrEmpty(s)) return null;
        var dot = s.IndexOf('.');
        if (dot >= 0)
        {
            var end = dot + 1;
            while (end < s.Length && char.IsDigit(s[end])) end++;
            if (end - dot - 1 > 7) s = s[..(dot + 8)] + s[end..];
        }
        return DateTimeOffset.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var dto)
            ? dto.UtcDateTime
            : null;
    }
}

/// Google said no for a reason that may pass (network, 5xx, quota). The caller should retry
/// later; a Pub/Sub notification gets a 500 so Google sends it again.
public class GooglePlayUnavailableException(string message, Exception? inner = null) : Exception(message, inner);

public interface IGooglePlayApi
{
    bool IsConfigured { get; }
    string PackageName { get; }

    /// Null when Google doesn't know the token (made up, another app's, or expired > 60 days ago).
    Task<GoogleSubscription?> GetSubscriptionAsync(string purchaseToken, CancellationToken ct = default);

    /// Must happen within 3 days of the purchase or Google refunds it.
    Task AcknowledgeAsync(string productId, string purchaseToken, CancellationToken ct = default);
}

/// Calls the Google Play Developer API with a service account that has "View financial data"
/// and "Manage orders and subscriptions" in Play Console.
///
/// Config: GooglePlay:PackageName (default ie.logit.app) and the service account key, as
/// GooglePlay:ServiceAccountKeyFile (a path) or GooglePlay:ServiceAccountJson (the JSON itself).
public class GooglePlayApi : IGooglePlayApi
{
    private const string Scope = "https://www.googleapis.com/auth/androidpublisher";
    private const string BaseUrl = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/";

    private readonly HttpClient _http;
    private readonly ILogger<GooglePlayApi> _log;
    private readonly GoogleCredential? _credential;

    public GooglePlayApi(HttpClient http, IConfiguration config, ILogger<GooglePlayApi> log)
    {
        _http = http;
        _log = log;
        PackageName = config["GooglePlay:PackageName"] is { Length: > 0 } p ? p : "ie.logit.app";

        var json = config["GooglePlay:ServiceAccountJson"];
        var file = config["GooglePlay:ServiceAccountKeyFile"];
        if (string.IsNullOrWhiteSpace(json) && !string.IsNullOrWhiteSpace(file))
        {
            if (File.Exists(file)) json = File.ReadAllText(file);
            else log.LogWarning("GooglePlay:ServiceAccountKeyFile {File} doesn't exist; Google Play purchases can't be checked", file);
        }
        if (!string.IsNullOrWhiteSpace(json))
        {
            try
            {
                _credential = CredentialFactory.FromJson<ServiceAccountCredential>(json)
                    .ToGoogleCredential()
                    .CreateScoped(Scope);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "The Google Play service account key couldn't be read; Google Play purchases can't be checked");
            }
        }
    }

    public bool IsConfigured => _credential is not null;
    public string PackageName { get; }

    public async Task<GoogleSubscription?> GetSubscriptionAsync(string purchaseToken, CancellationToken ct = default)
    {
        var url = $"{BaseUrl}{Uri.EscapeDataString(PackageName)}/purchases/subscriptionsv2/tokens/{Uri.EscapeDataString(purchaseToken)}";
        using var res = await SendAsync(HttpMethod.Get, url, ct);
        if (res.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Gone or HttpStatusCode.BadRequest)
        {
            _log.LogWarning("Google Play doesn't know purchase token …{Tail} ({Status})", Tail(purchaseToken), (int)res.StatusCode);
            return null;
        }
        await EnsureOk(res, "read subscription", ct);
        await using var stream = await res.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        return GoogleSubscription.Parse(doc.RootElement);
    }

    public async Task AcknowledgeAsync(string productId, string purchaseToken, CancellationToken ct = default)
    {
        var url = $"{BaseUrl}{Uri.EscapeDataString(PackageName)}/purchases/subscriptions/{Uri.EscapeDataString(productId)}/tokens/{Uri.EscapeDataString(purchaseToken)}:acknowledge";
        using var res = await SendAsync(HttpMethod.Post, url, ct, new StringContent("{}", System.Text.Encoding.UTF8, "application/json"));
        await EnsureOk(res, "acknowledge", ct);
    }

    private async Task<HttpResponseMessage> SendAsync(HttpMethod method, string url, CancellationToken ct, HttpContent? body = null)
    {
        if (_credential is null) throw new InvalidOperationException("Google Play isn't configured.");
        try
        {
            var token = await ((ITokenAccess)_credential).GetAccessTokenForRequestAsync(cancellationToken: ct);
            var req = new HttpRequestMessage(method, url) { Content = body };
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            return await _http.SendAsync(req, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or Google.Apis.Auth.OAuth2.Responses.TokenResponseException
                                   && !ct.IsCancellationRequested)
        {
            throw new GooglePlayUnavailableException($"Couldn't reach Google Play: {ex.Message}", ex);
        }
    }

    private static async Task EnsureOk(HttpResponseMessage res, string what, CancellationToken ct)
    {
        if (res.IsSuccessStatusCode) return;
        var text = await res.Content.ReadAsStringAsync(ct);
        if (text.Length > 500) text = text[..500];
        throw new GooglePlayUnavailableException($"Google Play {what} failed ({(int)res.StatusCode}): {text}");
    }

    /// Purchase tokens are bearer secrets of a sort; logs only show the end.
    public static string Tail(string token) => token.Length <= 8 ? token : token[^8..];
}
