namespace Logit.Api.Features.Billing;

public record CheckoutRequest(string SuccessUrl, string CancelUrl, string Plan);
public record CheckoutResponse(string CheckoutUrl);
public record BillingStatusResponse(string Tier, bool SubscriptionActive);
