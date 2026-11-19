using Stripe;
using Stripe.Checkout;

namespace Logit.Api.Features.Coach.Payments;

/// Everything coach payments need from Stripe, behind an interface so the rules can be tested
/// without Stripe. Coaches are connected accounts (Accounts v2) that are the merchant of
/// record: every charge is a direct charge on the coach's account, and LogIt takes no fee.
public interface ICoachStripe
{
    /// Stripe:SecretKey is set on this server.
    bool Configured { get; }
    Task<string> CreateAccountAsync(string email, string displayName, string country, CancellationToken ct);
    Task<string> OnboardingLinkAsync(string accountId, string returnUrl, string refreshUrl, CancellationToken ct);
    Task<ConnectAccountStatus> GetAccountAsync(string accountId, CancellationToken ct);
    Task<CheckoutStart> CreateCheckoutAsync(CheckoutStartRequest req, CancellationToken ct);
    Task<CheckoutInfo> GetCheckoutAsync(string accountId, string sessionId, CancellationToken ct);
    Task<StripeSubscriptionInfo> GetSubscriptionAsync(string accountId, string subscriptionId, CancellationToken ct);
    /// Stripe's billing page for one of the coach's customers: change the card (paying what's
    /// overdue), see receipts, stop the plan. Returns its short-lived URL.
    Task<string> CreateBillingPortalAsync(string accountId, string customerId, string returnUrl, CancellationToken ct);
    Task SetCancelAtPeriodEndAsync(string accountId, string subscriptionId, bool cancel, CancellationToken ct);
    Task CancelNowAsync(string accountId, string subscriptionId, CancellationToken ct);
}

public record ConnectAccountStatus(bool CardPaymentsActive, bool RequirementsDue, string? DisplayName, string? Currency);

public record CheckoutStartRequest(
    string AccountId,
    bool Monthly,
    string Currency,
    long AmountCents,
    string ProductName,
    string? Description,
    string? CustomerEmail,
    string ClientReferenceId,
    Dictionary<string, string> Metadata,
    string SuccessUrl,
    string CancelUrl);

public record CheckoutStart(string SessionId, string Url);

public record CheckoutInfo(
    string SessionId,
    bool Paid,
    string? SubscriptionId,
    string? CustomerId,
    long AmountTotal,
    string Currency,
    IReadOnlyDictionary<string, string> Metadata);

public record StripeSubscriptionInfo(string Id, string Status, bool CancelAtPeriodEnd, DateTime? PeriodEnd);

public class CoachStripe(IConfiguration config) : ICoachStripe
{
    private readonly string? _key = config["Stripe:SecretKey"];
    private StripeClient? _client;

    public bool Configured => !string.IsNullOrEmpty(_key);

    private StripeClient Client => _client ??= Configured
        ? new StripeClient(_key)
        : throw new InvalidOperationException("Stripe:SecretKey isn't set.");

    private static RequestOptions On(string accountId) => new() { StripeAccount = accountId };

    public async Task<string> CreateAccountAsync(string email, string displayName, string country, CancellationToken ct)
    {
        // A coach runs their own business: full Stripe Dashboard, Stripe bills the coach for
        // its fees and covers losses, and the account takes card payments as the merchant.
        var account = await Client.V2.Core.Accounts.CreateAsync(new Stripe.V2.Core.AccountCreateOptions
        {
            ContactEmail = email,
            DisplayName = displayName,
            Dashboard = "full",
            Identity = new Stripe.V2.Core.AccountCreateIdentityOptions { Country = country },
            Defaults = new Stripe.V2.Core.AccountCreateDefaultsOptions
            {
                Responsibilities = new Stripe.V2.Core.AccountCreateDefaultsResponsibilitiesOptions
                {
                    FeesCollector = "stripe",
                    LossesCollector = "stripe",
                },
            },
            Configuration = new Stripe.V2.Core.AccountCreateConfigurationOptions
            {
                Merchant = new Stripe.V2.Core.AccountCreateConfigurationMerchantOptions
                {
                    Capabilities = new Stripe.V2.Core.AccountCreateConfigurationMerchantCapabilitiesOptions
                    {
                        CardPayments = new Stripe.V2.Core.AccountCreateConfigurationMerchantCapabilitiesCardPaymentsOptions
                        {
                            Requested = true,
                        },
                    },
                },
            },
        }, cancellationToken: ct);
        return account.Id;
    }

    public async Task<string> OnboardingLinkAsync(string accountId, string returnUrl, string refreshUrl, CancellationToken ct)
    {
        var link = await Client.V2.Core.AccountLinks.CreateAsync(new Stripe.V2.Core.AccountLinkCreateOptions
        {
            Account = accountId,
            UseCase = new Stripe.V2.Core.AccountLinkCreateUseCaseOptions
            {
                Type = "account_onboarding",
                AccountOnboarding = new Stripe.V2.Core.AccountLinkCreateUseCaseAccountOnboardingOptions
                {
                    Configurations = ["merchant"],
                    ReturnUrl = returnUrl,
                    RefreshUrl = refreshUrl,
                },
            },
        }, cancellationToken: ct);
        return link.Url;
    }

    public async Task<ConnectAccountStatus> GetAccountAsync(string accountId, CancellationToken ct)
    {
        var account = await Client.V2.Core.Accounts.GetAsync(accountId, new Stripe.V2.Core.AccountGetOptions
        {
            Include = ["configuration.merchant", "defaults", "requirements"],
        }, cancellationToken: ct);
        var cardStatus = account.Configuration?.Merchant?.Capabilities?.CardPayments?.Status;
        var due = account.Requirements?.Entries?.Any(e =>
            e.MinimumDeadline?.Status is "currently_due" or "past_due") ?? false;
        return new ConnectAccountStatus(
            CardPaymentsActive: cardStatus == "active",
            RequirementsDue: due,
            DisplayName: account.DisplayName,
            Currency: account.Defaults?.Currency);
    }

    public async Task<CheckoutStart> CreateCheckoutAsync(CheckoutStartRequest req, CancellationToken ct)
    {
        var priceData = new SessionLineItemPriceDataOptions
        {
            Currency = req.Currency,
            UnitAmount = req.AmountCents,
            ProductData = new SessionLineItemPriceDataProductDataOptions
            {
                Name = req.ProductName,
                Description = string.IsNullOrWhiteSpace(req.Description) ? null : req.Description,
            },
            Recurring = req.Monthly ? new SessionLineItemPriceDataRecurringOptions { Interval = "month" } : null,
        };
        var options = new SessionCreateOptions
        {
            Mode = req.Monthly ? "subscription" : "payment",
            LineItems = [new SessionLineItemOptions { PriceData = priceData, Quantity = 1 }],
            CustomerEmail = req.CustomerEmail,
            ClientReferenceId = req.ClientReferenceId,
            Metadata = req.Metadata,
            SuccessUrl = req.SuccessUrl,
            CancelUrl = req.CancelUrl,
            // Codes the coach makes in their own Stripe dashboard.
            AllowPromotionCodes = true,
        };
        if (req.Monthly)
            options.SubscriptionData = new SessionSubscriptionDataOptions { Metadata = req.Metadata };
        else
        {
            options.PaymentIntentData = new SessionPaymentIntentDataOptions { Metadata = req.Metadata };
            // A Customer, so the coach sees who paid in their Stripe Dashboard.
            options.CustomerCreation = "always";
        }
        var session = await Client.V1.Checkout.Sessions.CreateAsync(options, On(req.AccountId), ct);
        return new CheckoutStart(session.Id, session.Url);
    }

    public async Task<string> CreateBillingPortalAsync(string accountId, string customerId, string returnUrl, CancellationToken ct)
    {
        var session = await Client.V1.BillingPortal.Sessions.CreateAsync(
            new Stripe.BillingPortal.SessionCreateOptions { Customer = customerId, ReturnUrl = returnUrl }, On(accountId), ct);
        return session.Url;
    }

    public async Task<CheckoutInfo> GetCheckoutAsync(string accountId, string sessionId, CancellationToken ct)
    {
        var s = await Client.V1.Checkout.Sessions.GetAsync(sessionId, null, On(accountId), ct);
        return FromSession(s);
    }

    public static CheckoutInfo FromSession(Session s) => new(
        s.Id,
        Paid: s.Status == "complete" && s.PaymentStatus is "paid" or "no_payment_required",
        SubscriptionId: s.SubscriptionId,
        CustomerId: s.CustomerId,
        AmountTotal: s.AmountTotal ?? 0,
        Currency: s.Currency ?? "eur",
        Metadata: s.Metadata ?? new Dictionary<string, string>());

    public async Task<StripeSubscriptionInfo> GetSubscriptionAsync(string accountId, string subscriptionId, CancellationToken ct)
    {
        var sub = await Client.V1.Subscriptions.GetAsync(subscriptionId, null, On(accountId), ct);
        return FromSubscription(sub);
    }

    public static StripeSubscriptionInfo FromSubscription(Subscription sub) => new(
        sub.Id,
        sub.Status,
        sub.CancelAtPeriodEnd,
        // The period lives on the item since the 2025 API versions.
        sub.Items?.Data?.FirstOrDefault()?.CurrentPeriodEnd);

    public Task SetCancelAtPeriodEndAsync(string accountId, string subscriptionId, bool cancel, CancellationToken ct) =>
        Client.V1.Subscriptions.UpdateAsync(subscriptionId,
            new SubscriptionUpdateOptions { CancelAtPeriodEnd = cancel }, On(accountId), ct);

    public Task CancelNowAsync(string accountId, string subscriptionId, CancellationToken ct) =>
        Client.V1.Subscriptions.CancelAsync(subscriptionId, null, On(accountId), ct);
}
