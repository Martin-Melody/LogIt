using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features;

public static class EndpointTierExtensions
{
    /// Rejects the request with 403 unless the caller's current tier (read fresh from the DB,
    /// not the JWT claim, so a downgrade/cancellation takes effect immediately) is at least
    /// `minimumTier`. Apply to a `MapGroup(...)` to gate a whole feature area.
    public static TBuilder RequireTier<TBuilder>(this TBuilder builder, UserTier minimumTier)
        where TBuilder : IEndpointConventionBuilder
    {
        builder.AddEndpointFilter(async (context, next) =>
        {
            var config = context.HttpContext.RequestServices.GetRequiredService<IConfiguration>();
            if (config.GetValue<bool>("Deployment:SelfHosted"))
                return await next(context);

            var db = context.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
            var userId = context.HttpContext.User.GetUserId();
            var user = await db.Users.FindAsync(userId);
            if (user is null) return Results.Unauthorized();

            if (user.Tier < minimumTier)
                return Results.Json(
                    new { error = $"This feature requires a {minimumTier}-tier account or higher." },
                    statusCode: StatusCodes.Status403Forbidden);

            return await next(context);
        });
        return builder;
    }
}
