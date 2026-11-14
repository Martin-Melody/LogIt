namespace Logit.Api.Data.Entities;

/// One paid subscription, wherever it was bought. A user can have several rows over time
/// (a lapsed Google subscription, then a new one), but at most one should grant access at a
/// time. `User.Tier` is worked out from these rows plus `User.ManualTier` (see Entitlements).
public class BillingSubscription
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public SubscriptionSource Source { get; set; }

    /// The store's id for this subscription: the Google Play purchase token, the App Store
    /// original transaction id, or the Stripe subscription id. Unique per source.
    public string ExternalId { get; set; } = string.Empty;

    /// The store product (Google/Apple product id, Stripe price id).
    public string ProductId { get; set; } = string.Empty;

    /// The plan this subscription pays for (Pro or Studio).
    public UserTier Plan { get; set; }

    public SubscriptionState State { get; set; }

    /// When the current paid period ends. Null when the store doesn't say (Stripe: its
    /// webhooks are the source of truth instead).
    public DateTime? ExpiresAt { get; set; }

    /// Whether it will renew at ExpiresAt. False after the person cancels (they keep access
    /// until ExpiresAt).
    public bool AutoRenewing { get; set; }

    /// The external id of the subscription this one replaced (Google's linkedPurchaseToken,
    /// set on an upgrade/downgrade or resubscribe). That older row is marked Replaced.
    public string? ReplacesExternalId { get; set; }

    /// A purchase made by a store test account (Google license testers). Shown in the admin
    /// page so test purchases aren't mistaken for income.
    public bool IsTest { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    /// Last time the state was read from the store itself.
    public DateTime? CheckedAt { get; set; }
}

public enum SubscriptionSource { Google, Apple, Stripe }

public enum SubscriptionState
{
    /// Bought but not paid yet (e.g. a cash payment pending at Google). No access.
    Pending,
    Active,
    /// Will not renew, but paid up until ExpiresAt. Access until then.
    Canceled,
    /// A renewal payment failed and the store is retrying. Access continues.
    GracePeriod,
    /// Retrying failed past the grace period. No access until the person fixes payment.
    OnHold,
    Paused,
    Expired,
    /// Refunded or revoked by the store. No access.
    Revoked,
    /// Superseded by a newer purchase (upgrade, downgrade or resubscribe). No access.
    Replaced,
}
