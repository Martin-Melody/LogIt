using System.Security.Claims;

namespace Logit.Api.Features;

public static class ClaimsPrincipalExtensions
{
    public static Guid GetUserId(this ClaimsPrincipal principal)
    {
        var value = principal.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? principal.FindFirstValue("sub");
        return Guid.Parse(value ?? throw new InvalidOperationException("User ID claim missing."));
    }
}
