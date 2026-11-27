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
    /// Every checkout asked for; GetCheckoutAsync reports the last one, paid while CheckoutPaid.
    public List<CheckoutStartRequest> Checkouts { get; } = [];
    public bool CheckoutPaid { get; set; } = true;

    public Task<CheckoutStart> CreateCheckoutAsync(CheckoutStartRequest req, CancellationToken ct)
    {
        Checkouts.Add(req);
        return Task.FromResult(new CheckoutStart("cs_new", "https://checkout.stripe.test"));
    }

    public Task<CheckoutInfo> GetCheckoutAsync(string accountId, string sessionId, CancellationToken ct)
    {
        var last = Checkouts.LastOrDefault() ?? throw new NotSupportedException();
        return Task.FromResult(new CheckoutInfo(sessionId, CheckoutPaid, last.Monthly ? "sub_" + sessionId : null, "cus_1",
            last.FirstChargeAt is null ? last.AmountCents : 0, last.Currency, last.Metadata));
    }
    public Task<StripeSubscriptionInfo> GetSubscriptionAsync(string accountId, string subscriptionId, CancellationToken ct) =>
        Task.FromResult(new StripeSubscriptionInfo(subscriptionId, SubscriptionStatus, false, null));
    public Task<string> CreateBillingPortalAsync(string accountId, string customerId, string returnUrl, CancellationToken ct) =>
        Task.FromResult("https://billing.stripe.test/" + customerId);
    /// SetCancelAtPeriodEndAsync throws while true.
    public bool PeriodEndFails { get; set; }
    public Task SetCancelAtPeriodEndAsync(string accountId, string subscriptionId, bool cancel, CancellationToken ct) =>
        PeriodEndFails ? throw new InvalidOperationException("Stripe is down") : Task.CompletedTask;

    /// Pauses asked for, by subscription: the resume date, or null when resumed.
    public Dictionary<string, DateTime?> Paused { get; } = [];
    public Task PauseCollectionAsync(string accountId, string subscriptionId, DateTime? resumesAt, CancellationToken ct)
    {
        Paused[subscriptionId] = resumesAt;
        return Task.CompletedTask;
    }

    public Task<string?> CustomerOfPaymentAsync(string accountId, string paymentIntentId, CancellationToken ct) => Task.FromResult<string?>("cus_" + paymentIntentId);

    /// Monthly price changes asked for: subscription → new amount.
    public Dictionary<string, long> PriceChanges { get; } = [];
    public Task ChangeMonthlyPriceAsync(string accountId, string subscriptionId, long amountCents, string currency, string productName, CancellationToken ct)
    {
        PriceChanges[subscriptionId] = amountCents;
        return Task.CompletedTask;
    }

    /// What RetryUnpaidAsync answers, and how many times it was asked.
    public bool RetryPays { get; set; } = true;
    public int Retries { get; private set; }
    public Task<bool> RetryUnpaidAsync(string accountId, string subscriptionId, CancellationToken ct)
    {
        Retries++;
        return Task.FromResult(RetryPays);
    }

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
