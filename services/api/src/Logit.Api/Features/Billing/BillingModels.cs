namespace Logit.Api.Features.Billing;

public record CheckoutRequest(string SuccessUrl, string CancelUrl, string Plan);
public record CheckoutResponse(string CheckoutUrl);
public record PortalRequest(string ReturnUrl);
public record PortalResponse(string PortalUrl);
public record GoogleVerifyRequest(string PurchaseToken);

/// What the app and dashboard show on their plan screens.
/// - Tier: the plan in force now (what the feature checks use).
/// - SubscriptionActive: a paid subscription is giving access now (kept for older clients).
/// - ManualTier: a plan granted in the admin page, if any.
/// - Subscription: the subscription to show (the one giving access, else the latest), or null.
/// - WebCheckout: whether the website can sell plans (off at launch: plans are sold in the app).
public record BillingStatusResponse(
    string Tier,
    bool SubscriptionActive,
    string? ManualTier,
    SubscriptionInfo? Subscription,
    bool WebCheckout);

/// - Source: google | apple | stripe.
/// - State: pending | active | canceled | gracePeriod | onHold | paused | expired | revoked.
///   canceled = won't renew but paid up until ExpiresAt; gracePeriod/onHold = a payment failed
///   (gracePeriod keeps access, onHold doesn't) and the person should fix it in the store.
/// - ManageUrl: where to change or cancel it. Null for Stripe: POST /billing/portal instead.
public record SubscriptionInfo(
    string Source,
    string Plan,
    string State,
    DateTime? ExpiresAt,
    bool AutoRenewing,
    bool GrantsAccess,
    string ProductId,
    string? ManageUrl);
