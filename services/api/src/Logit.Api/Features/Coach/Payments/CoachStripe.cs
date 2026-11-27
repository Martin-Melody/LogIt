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
    /// The coach paused coaching (canvas E1): no charges until `resumesAt`; null resumes now.
    Task PauseCollectionAsync(string accountId, string subscriptionId, DateTime? resumesAt, CancellationToken ct);
    /// After a new card (canvas Z3): try the unpaid payment now rather than at Stripe's next
    /// retry. True when it's paid.
    Task<bool> RetryUnpaidAsync(string accountId, string subscriptionId, CancellationToken ct);
    /// A change of package (canvas K14) between two monthly prices: the new price from the next
    /// payment, nothing charged or credited now.
    /// The customer a payment came from (a dispute names only the payment).
    Task<string?> CustomerOfPaymentAsync(string accountId, string paymentIntentId, CancellationToken ct);
    Task ChangeMonthlyPriceAsync(string accountId, string subscriptionId, long amountCents, string currency, string productName, CancellationToken ct);
    /// Give back part of a payment. `paymentRef` is what a receipt stores: the invoice or the
    /// checkout session the money came from. `idempotencyKey` makes a retry return the same refund.
    Task<StripeRefund> RefundAsync(string accountId, string paymentRef, long amountCents, string idempotencyKey, CancellationToken ct);
}

public record ConnectAccountStatus(bool CardPaymentsActive, bool RequirementsDue, string? DisplayName, string? Currency, string? Needs = null);

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
    string CancelUrl,
    // Monthly only: no charge until this date (a later first charge, canvas C2). Stripe needs it
    // at least two days ahead; nearer dates charge now.
    DateTime? FirstChargeAt = null);

public record CheckoutStart(string SessionId, string Url);

public record CheckoutInfo(
    string SessionId,
    bool Paid,
    string? SubscriptionId,
    string? CustomerId,
    long AmountTotal,
    string Currency,
    IReadOnlyDictionary<string, string> Metadata);

/// Status is Stripe's: "succeeded", "pending" (waiting for money in the coach's balance),
/// "failed" or "canceled".
public record StripeRefund(string Id, string Status);

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
        var dueEntries = account.Requirements?.Entries?.Where(e => e.MinimumDeadline?.Status is "currently_due" or "past_due").ToList() ?? [];
        return new ConnectAccountStatus(
            CardPaymentsActive: cardStatus == "active",
            RequirementsDue: dueEntries.Count > 0,
            DisplayName: account.DisplayName,
            Currency: account.Defaults?.Currency,
            // Stripe's own description of the first thing it wants (canvas Z4).
            Needs: dueEntries.Select(e => e.Description).FirstOrDefault(d => !string.IsNullOrWhiteSpace(d)));
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
            options.SubscriptionData = new SessionSubscriptionDataOptions
            {
                Metadata = req.Metadata,
                TrialEnd = req.FirstChargeAt is { } at && at > DateTime.UtcNow.AddDays(2) ? at : null,
            };
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

    public Task PauseCollectionAsync(string accountId, string subscriptionId, DateTime? resumesAt, CancellationToken ct)
    {
        var options = new SubscriptionUpdateOptions();
        // "void": nothing is owed for the paused time; Stripe resumes on its own on the date.
        if (resumesAt is { } at) options.PauseCollection = new SubscriptionPauseCollectionOptions { Behavior = "void", ResumesAt = at };
        else options.AddExtraParam("pause_collection", "");
        return Client.V1.Subscriptions.UpdateAsync(subscriptionId, options, On(accountId), ct);
    }

    public async Task<string?> CustomerOfPaymentAsync(string accountId, string paymentIntentId, CancellationToken ct) =>
        (await Client.V1.PaymentIntents.GetAsync(paymentIntentId, null, On(accountId), ct)).CustomerId;

    public async Task ChangeMonthlyPriceAsync(string accountId, string subscriptionId, long amountCents, string currency, string productName, CancellationToken ct)
    {
        var sub = await Client.V1.Subscriptions.GetAsync(subscriptionId, null, On(accountId), ct);
        var item = sub.Items.Data[0];
        var product = await Client.V1.Products.CreateAsync(new ProductCreateOptions { Name = productName }, On(accountId), ct);
        await Client.V1.Subscriptions.UpdateAsync(subscriptionId, new SubscriptionUpdateOptions
        {
            Items =
            [
                new SubscriptionItemOptions
                {
                    Id = item.Id,
                    PriceData = new SubscriptionItemPriceDataOptions
                    {
                        Currency = currency, UnitAmount = amountCents, Product = product.Id,
                        Recurring = new SubscriptionItemPriceDataRecurringOptions { Interval = "month" },
                    },
                },
            ],
            // From the next payment: no charge or credit for the rest of this month.
            ProrationBehavior = "none",
        }, On(accountId), ct);
    }

    public async Task<bool> RetryUnpaidAsync(string accountId, string subscriptionId, CancellationToken ct)
    {
        var sub = await Client.V1.Subscriptions.GetAsync(subscriptionId, new SubscriptionGetOptions { Expand = ["latest_invoice"] }, On(accountId), ct);
        if (sub.LatestInvoice is not { Status: "open" } invoice) return sub.LatestInvoice?.Status == "paid";
        var paid = await Client.V1.Invoices.PayAsync(invoice.Id, null, On(accountId), ct);
        return paid.Status == "paid";
    }

    public async Task<StripeRefund> RefundAsync(
        string accountId, string paymentRef, long amountCents, string idempotencyKey, CancellationToken ct)
    {
        var intent = await PaymentIntentForAsync(accountId, paymentRef, ct)
            ?? throw new InvalidOperationException($"Stripe has no card payment for {paymentRef}.");
        // A direct charge lives on the coach's account, so the refund is made there and comes
        // out of the coach's Stripe balance (Stripe's docs: "Issue refunds" for direct charges).
        var refund = await Client.V1.Refunds.CreateAsync(
            new RefundCreateOptions { PaymentIntent = intent, Amount = amountCents },
            new RequestOptions { StripeAccount = accountId, IdempotencyKey = idempotencyKey }, ct);
        return new StripeRefund(refund.Id, refund.Status);
    }

    /// The payment behind a receipt: a one-off checkout has its own payment intent; a monthly
    /// one is paid through an invoice, whose payments list holds it.
    private async Task<string?> PaymentIntentForAsync(string accountId, string paymentRef, CancellationToken ct)
    {
        var invoiceId = paymentRef;
        if (paymentRef.StartsWith("cs_", StringComparison.Ordinal))
        {
            var session = await Client.V1.Checkout.Sessions.GetAsync(paymentRef, null, On(accountId), ct);
            if (session.PaymentIntentId is { Length: > 0 } direct) return direct;
            if (session.InvoiceId is not { Length: > 0 } fromSession) return null;
            invoiceId = fromSession;
        }
        var payments = await Client.V1.InvoicePayments.ListAsync(
            new InvoicePaymentListOptions { Invoice = invoiceId }, On(accountId), ct);
        return payments.Data.FirstOrDefault(p => p.Status == "paid")?.Payment?.PaymentIntentId;
    }
}
