using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Billing;

/// Works out which plan a user has. The rule is the same for every store:
/// Tier = the higher of the admin grant (ManualTier) and the best subscription that grants
/// access right now. Every place that changes a subscription or a grant calls Recompute, so
/// `User.Tier` (which the tier checks read) always matches the rows.
public static class Entitlements
{
    /// Whether a subscription gives access at `now`. Active, cancelled-but-paid-up and grace
    /// period do; everything else doesn't. A row whose paid period has ended doesn't either,
    /// even if the store's "expired" notice hasn't arrived yet.
    public static bool GrantsAccess(BillingSubscription sub, DateTime now) =>
        sub.State is SubscriptionState.Active or SubscriptionState.Canceled or SubscriptionState.GracePeriod
        && (sub.ExpiresAt is null || sub.ExpiresAt > now);

    /// The subscription that decides the user's paid plan: the highest plan among those that
    /// grant access, latest expiry first. Null when none do.
    public static BillingSubscription? Current(IEnumerable<BillingSubscription> subs, DateTime now) =>
        subs.Where(s => GrantsAccess(s, now))
            .OrderByDescending(s => s.Plan)
            .ThenByDescending(s => s.ExpiresAt ?? DateTime.MaxValue)
            .FirstOrDefault();

    /// The subscription to show the user: the one that gives access, otherwise the most
    /// recently changed one that isn't superseded (so an on-hold or expired plan can still say
    /// "fix your payment in Google Play").
    public static BillingSubscription? ToShow(IEnumerable<BillingSubscription> subs, DateTime now) =>
        Current(subs, now)
        ?? subs.Where(s => s.State != SubscriptionState.Replaced)
               .OrderByDescending(s => s.UpdatedAt)
               .FirstOrDefault();

    public static UserTier TierFor(UserTier? manualTier, IEnumerable<BillingSubscription> subs, DateTime now)
    {
        var paid = Current(subs, now)?.Plan ?? UserTier.Free;
        var manual = manualTier ?? UserTier.Free;
        return paid > manual ? paid : manual;
    }

    /// Sets `user.Tier` from its grant and subscriptions (loading them if needed). Returns
    /// true when the tier changed. Doesn't save.
    public static async Task<bool> RecomputeAsync(AppDbContext db, User user, DateTime now, ILogger? log = null)
    {
        var subs = await db.BillingSubscriptions.Where(s => s.UserId == user.Id).ToListAsync();
        // Include rows added or changed in this unit of work but not saved yet.
        var pending = db.ChangeTracker.Entries<BillingSubscription>()
            .Where(e => e.Entity.UserId == user.Id && e.State == EntityState.Added)
            .Select(e => e.Entity);
        var all = subs.Concat(pending).DistinctBy(s => s.Id).ToList();

        var tier = TierFor(user.ManualTier, all, now);
        if (tier == user.Tier) return false;

        log?.LogInformation("User {UserId} tier {From} -> {To}", user.Id, user.Tier, tier);
        user.Tier = tier;
        user.UpdatedAt = now;
        return true;
    }
}
