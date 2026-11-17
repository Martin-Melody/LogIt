using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features;

/// Endpoint metadata saying which plan an endpoint needs. RequireTier adds it, so the list of
/// locked endpoints can be read from the app itself (TierGateSnapshotTests writes it to
/// docs/generated/tier-gates.json, which the docs' feature list is checked against).
public sealed record TierRequirement(UserTier MinimumTier, bool OrActivelyCoached);

public static class EndpointTierExtensions
{
    /// Rejects the request with 403 unless the caller's current tier (read fresh from the DB,
    /// not the JWT claim, so a downgrade/cancellation takes effect immediately) is at least
    /// `minimumTier`. Apply to a `MapGroup(...)` or a single endpoint to gate a feature area.
    ///
    /// When `orActivelyCoached` is set, a caller below `minimumTier` is also allowed if they
    /// are an Active client of a Studio-tier coach — used for the two sync endpoints
    /// (sessions, check-in submissions) whose data flows to a coach, so a coached Free client
    /// gets those without paying. This is a computed entitlement: `User.Tier` is never changed,
    /// so it reverts automatically when the relationship ends or the coach downgrades.
    public static TBuilder RequireTier<TBuilder>(
        this TBuilder builder, UserTier minimumTier, bool orActivelyCoached = false)
        where TBuilder : IEndpointConventionBuilder
    {
        builder.WithMetadata(new TierRequirement(minimumTier, orActivelyCoached));
        builder.AddEndpointFilter(async (context, next) =>
        {
            var config = context.HttpContext.RequestServices.GetRequiredService<IConfiguration>();
            if (config.GetValue<bool>("Deployment:SelfHosted"))
                return await next(context);

            var db = context.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
            var userId = context.HttpContext.User.GetUserId();
            var user = await db.Users.FindAsync(userId);
            if (user is null) return Results.Unauthorized();

            if (user.Tier >= minimumTier)
                return await next(context);

            if (orActivelyCoached)
            {
                var coachedByStudio = await db.CoachClientRelationships.AnyAsync(r =>
                    r.ClientId == userId
                    && r.Status == CoachClientStatus.Active
                    && r.Coach.Tier == UserTier.Studio);
                if (coachedByStudio) return await next(context);
            }

            // Free accounts back up one phone: the /sync endpoints let the phone holding the
            // backup through (Features/Sync/FreeBackup.cs).
            var request = context.HttpContext.Request;
            switch (Sync.FreeBackup.Check(user, minimumTier, request.Path, request.Headers[Sync.FreeBackup.DeviceHeader]))
            {
                case Sync.FreeBackup.Decision.Allowed:
                    return await next(context);
                case Sync.FreeBackup.Decision.Claim:
                    Sync.FreeBackup.MoveTo(user, request.Headers[Sync.FreeBackup.DeviceHeader]);
                    await db.SaveChangesAsync();
                    return await next(context);
                case Sync.FreeBackup.Decision.OtherDevice:
                    return Results.Json(
                        new { error = Sync.FreeBackup.OtherDeviceMessage, code = Sync.FreeBackup.OtherDeviceCode },
                        statusCode: StatusCodes.Status403Forbidden);
            }

            return Results.Json(
                new { error = $"This feature requires a {minimumTier}-tier account or higher." },
                statusCode: StatusCodes.Status403Forbidden);
        });
        return builder;
    }
}
