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
    public string CreateAccessToken(User user, bool sample = false)
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

        var token = new JwtSecurityToken(
            issuer: _issuer,
            audience: _audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(_accessTokenMinutes),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public RefreshToken CreateRefreshToken(Guid userId)
    {
        return new RefreshToken
        {
            UserId = userId,
            Token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64)),
            ExpiresAt = DateTime.UtcNow.AddDays(_refreshTokenDays),
        };
    }
}
