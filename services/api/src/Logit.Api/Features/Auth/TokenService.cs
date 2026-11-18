using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Logit.Api.Data.Entities;
using Microsoft.IdentityModel.Tokens;

namespace Logit.Api.Features.Auth;

public class TokenService(IConfiguration config)
{
    private readonly string _secret = config["Jwt:Secret"] ?? throw new InvalidOperationException("Jwt:Secret is not configured.");
    private readonly string _issuer = config["Jwt:Issuer"] ?? "logit-api";
    private readonly string _audience = config["Jwt:Audience"] ?? "logit-app";
    private readonly int _accessTokenMinutes = int.Parse(config["Jwt:AccessTokenMinutes"] ?? "15");
    private readonly int _refreshTokenDays = int.Parse(config["Jwt:RefreshTokenDays"] ?? "30");

    /// `sample`: a token for a sandbox sample client, handed to its coach's app. It carries the
    /// "sample" claim, which SampleTokenGuard checks to keep it to the client-side coaching routes.
    /// The access token's claim naming the signed-in session (RefreshToken.SessionKey), so
    /// Account › Where you're signed in can say which row is "this browser".
    public const string SessionClaim = "sid";

    public string CreateAccessToken(User user, bool sample = false, Guid? sessionId = null)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.UniqueName, user.Username),
            new(JwtRegisteredClaimNames.Email, user.Email),
            new("tier", user.Tier.ToString()),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
        };
        if (sample) claims.Add(new Claim(Sandbox.SandboxEndpoints.SampleClaim, "1"));
        if (sessionId is { } sid) claims.Add(new Claim(SessionClaim, sid.ToString()));

        var token = new JwtSecurityToken(
            issuer: _issuer,
            audience: _audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(_accessTokenMinutes),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    /// A new session (`label` says which device), or the next token of an existing one
    /// (`previous`, on refresh), which keeps that session's id, label and start time.
    public RefreshToken CreateRefreshToken(Guid userId, string? label = null, RefreshToken? previous = null)
    {
        var now = DateTime.UtcNow;
        return new RefreshToken
        {
            UserId = userId,
            Token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64)),
            CreatedAt = now,
            ExpiresAt = now.AddDays(_refreshTokenDays),
            SessionId = previous?.SessionKey ?? Guid.NewGuid(),
            Label = Truncate(previous?.Label ?? label),
            SessionStartedAt = previous is null ? now : previous.SessionStartedAt ?? previous.CreatedAt,
        };
    }

    private static string? Truncate(string? s) =>
        s is null ? null : s.Length <= RefreshTokenLimits.MaxLabelChars ? s : s[..RefreshTokenLimits.MaxLabelChars];
}
