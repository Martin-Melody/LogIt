using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Logit.Api.Features.Admin;

/// <summary>
/// On getlogit.app the admin console sits behind Cloudflare Access: app.getlogit.app/admin* needs a
/// Cloudflare sign-in, and Caddy passes app.getlogit.app/admin-api/* on to /admin/api. Cloudflare
/// adds a signed <c>Cf-Access-Jwt-Assertion</c> header to every request it lets through, and the API
/// refuses admin requests without a valid one, so a stolen login can't reach the admin API by
/// calling api.getlogit.app directly. Off unless Admin:Access:TeamDomain and Admin:Access:Audience
/// are set (self-hosted servers don't use it).
/// </summary>
public sealed class CloudflareAccess
{
    public const string Header = "Cf-Access-Jwt-Assertion";

    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(10) };
    private static readonly TimeSpan KeysFor = TimeSpan.FromHours(1);

    private readonly string _issuer;
    private readonly string _audience;
    private readonly Func<Task<IList<SecurityKey>>> _fetchKeys;
    private readonly SemaphoreSlim _lock = new(1, 1);
    private IList<SecurityKey>? _keys;
    private DateTime _keysAt;

    /// <param name="teamDomain">e.g. "logit.cloudflareaccess.com"</param>
    /// <param name="audience">The Access application's "Application Audience (AUD) Tag".</param>
    /// <param name="fetchKeys">Tests pass their own keys; null fetches Cloudflare's.</param>
    public CloudflareAccess(string teamDomain, string audience, Func<Task<IList<SecurityKey>>>? fetchKeys = null)
    {
        var team = teamDomain.Trim().TrimEnd('/').Replace("https://", "");
        _issuer = $"https://{team}";
        _audience = audience.Trim();
        _fetchKeys = fetchKeys ?? (async () =>
            new JsonWebKeySet(await Http.GetStringAsync($"{_issuer}/cdn-cgi/access/certs")).GetSigningKeys());
    }

    public static CloudflareAccess? FromConfig(IConfiguration config) =>
        config["Admin:Access:TeamDomain"] is { Length: > 0 } team && config["Admin:Access:Audience"] is { Length: > 0 } aud
            ? new CloudflareAccess(team, aud)
            : null;

    /// Whether the header holds a token Cloudflare signed for this application, still in date.
    public async Task<bool> IsValidAsync(string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) return false;
        var parameters = new TokenValidationParameters
        {
            ValidIssuer = _issuer,
            ValidAudience = _audience,
            IssuerSigningKeys = await KeysAsync(refresh: false),
            ClockSkew = TimeSpan.FromMinutes(1),
        };
        var handler = new JsonWebTokenHandler();
        var result = await handler.ValidateTokenAsync(token, parameters);
        if (result.IsValid) return true;
        // Cloudflare rotates its keys: a token signed by a key we haven't seen gets one refetch.
        // At most every 5 minutes, so tokens with made-up key ids can't make us fetch on every request.
        if (result.Exception is not SecurityTokenSignatureKeyNotFoundException || DateTime.UtcNow - _keysAt < TimeSpan.FromMinutes(5)) return false;
        parameters.IssuerSigningKeys = await KeysAsync(refresh: true);
        return (await handler.ValidateTokenAsync(token, parameters)).IsValid;
    }

    private async Task<IList<SecurityKey>> KeysAsync(bool refresh)
    {
        if (!refresh && _keys is not null && DateTime.UtcNow - _keysAt < KeysFor) return _keys;
        await _lock.WaitAsync();
        try
        {
            if (refresh || _keys is null || DateTime.UtcNow - _keysAt >= KeysFor)
            {
                _keys = await _fetchKeys();
                _keysAt = DateTime.UtcNow;
            }
            return _keys;
        }
        finally
        {
            _lock.Release();
        }
    }
}
