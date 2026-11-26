using Logit.Api.Features.Coach.Payments;
using Logit.Api.Features.Email;

namespace Logit.Api.Tests;

/// A Stripe that records what it was asked to do, and can be told to fail.
public sealed class FakeCoachStripe : ICoachStripe
{
    public List<string> Cancelled { get; } = [];
    public List<(string PaymentRef, long Cents, string Key)> Refunds { get; } = [];
    /// CancelNowAsync throws while true.
    public bool CancelFails { get; set; }
    /// RefundAsync throws while true.
    public bool RefundFails { get; set; }
    /// What GetSubscriptionAsync reports as the plan's status.
    public string SubscriptionStatus { get; set; } = "active";

    public bool Configured { get; set; } = true;
    public Task<string> CreateAccountAsync(string email, string displayName, string country, CancellationToken ct) => Task.FromResult("acct_new");
    public Task<string> OnboardingLinkAsync(string accountId, string returnUrl, string refreshUrl, CancellationToken ct) => Task.FromResult("https://connect.stripe.test");
    public Task<ConnectAccountStatus> GetAccountAsync(string accountId, CancellationToken ct) => Task.FromResult(new ConnectAccountStatus(true, false, "Coach", "eur"));
    public Task<CheckoutStart> CreateCheckoutAsync(CheckoutStartRequest req, CancellationToken ct) => Task.FromResult(new CheckoutStart("cs_new", "https://checkout.stripe.test"));
    public Task<CheckoutInfo> GetCheckoutAsync(string accountId, string sessionId, CancellationToken ct) => throw new NotSupportedException();
    public Task<StripeSubscriptionInfo> GetSubscriptionAsync(string accountId, string subscriptionId, CancellationToken ct) =>
        Task.FromResult(new StripeSubscriptionInfo(subscriptionId, SubscriptionStatus, false, null));
    public Task<string> CreateBillingPortalAsync(string accountId, string customerId, string returnUrl, CancellationToken ct) =>
        Task.FromResult("https://billing.stripe.test/" + customerId);
    public Task SetCancelAtPeriodEndAsync(string accountId, string subscriptionId, bool cancel, CancellationToken ct) => Task.CompletedTask;

    public Task CancelNowAsync(string accountId, string subscriptionId, CancellationToken ct)
    {
        if (CancelFails) throw new InvalidOperationException("Stripe is down");
        Cancelled.Add(subscriptionId);
        SubscriptionStatus = "canceled";
        return Task.CompletedTask;
    }

    public Task<StripeRefund> RefundAsync(string accountId, string paymentRef, long amountCents, string idempotencyKey, CancellationToken ct)
    {
        if (RefundFails) throw new InvalidOperationException("Stripe is down");
        Refunds.Add((paymentRef, amountCents, idempotencyKey));
        return Task.FromResult(new StripeRefund("re_" + Refunds.Count, "succeeded"));
    }
}

public sealed class FakeEmailSender : IEmailSender
{
    public List<(string To, string Subject, string Body)> Sent { get; } = [];
    public bool IsConfigured => true;
    public Task SendAsync(string toAddress, string subject, string textBody)
    {
        Sent.Add((toAddress, subject, textBody));
        return Task.CompletedTask;
    }
}
