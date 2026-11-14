using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Billing.GooglePlay;
using Microsoft.EntityFrameworkCore;
using Stripe;
using Stripe.Checkout;

namespace Logit.Api.Features.Billing;

public static class BillingEndpoints
{
    public static void MapBillingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/billing").WithTags("Billing");

        group.MapGet("/status", Status).RequireAuthorization();

        // Google Play: the app reports a purchase (or restores one); Google's Pub/Sub pushes
        // Real-time developer notifications.
        group.MapPost("/google/verify", GoogleVerify).RequireAuthorization();
        group.MapPost("/google/notifications", GoogleNotification);

        // Stripe (website sales). Checkout is off unless Billing:WebCheckout is true; the portal
        // and webhook keep working for anyone who already pays through Stripe.
        group.MapPost("/checkout", Checkout).RequireAuthorization();
        group.MapPost("/portal", Portal).RequireAuthorization();
        group.MapPost("/webhook", Webhook);
    }

    public static bool WebCheckoutEnabled(IConfiguration config) => config.GetValue<bool>("Billing:WebCheckout");

    // ---- Status ----------------------------------------------------------------------------

    private static async Task<IResult> Status(ClaimsPrincipal caller, AppDbContext db, IConfiguration config, TimeProvider clock)
    {
        var user = await db.Users.FindAsync(caller.GetUserId());
        if (user is null) return Results.NotFound();
        return Results.Ok(await BuildStatusAsync(db, user, config, clock.GetUtcNow().UtcDateTime));
    }

    public static async Task<BillingStatusResponse> BuildStatusAsync(AppDbContext db, User user, IConfiguration config, DateTime now)
    {
        var subs = await db.BillingSubscriptions.Where(s => s.UserId == user.Id).ToListAsync();
        var current = Entitlements.Current(subs, now);
        var shown = Entitlements.ToShow(subs, now);

        return new BillingStatusResponse(
            Tier: user.Tier.ToString(),
            SubscriptionActive: current is not null,
            ManualTier: user.ManualTier?.ToString(),
            Subscription: shown is null ? null : new SubscriptionInfo(
                Source: JsonNamingPolicy.CamelCase.ConvertName(shown.Source.ToString()),
                Plan: shown.Plan.ToString(),
                State: JsonNamingPolicy.CamelCase.ConvertName(shown.State.ToString()),
                ExpiresAt: shown.ExpiresAt,
                AutoRenewing: shown.AutoRenewing,
                GrantsAccess: Entitlements.GrantsAccess(shown, now),
                ProductId: shown.ProductId,
                ManageUrl: ManageUrl(shown, config)),
            WebCheckout: WebCheckoutEnabled(config));
    }

    public static string? ManageUrl(BillingSubscription sub, IConfiguration config) => sub.Source switch
    {
        SubscriptionSource.Google =>
            "https://play.google.com/store/account/subscriptions?sku=" + Uri.EscapeDataString(sub.ProductId)
            + "&package=" + Uri.EscapeDataString(config["GooglePlay:PackageName"] is { Length: > 0 } p ? p : "ie.logit.app"),
        SubscriptionSource.Apple => "https://apps.apple.com/account/subscriptions",
        _ => null,
    };

    // ---- Google Play -----------------------------------------------------------------------

    private static async Task<IResult> GoogleVerify(
        GoogleVerifyRequest req, ClaimsPrincipal caller, GooglePlayBilling billing, AppDbContext db,
        IConfiguration config, TimeProvider clock, CancellationToken ct)
    {
        var userId = caller.GetUserId();
        var outcome = await billing.VerifyAsync(userId, req.PurchaseToken, ct);
        return outcome switch
        {
            GoogleVerifyOutcome.Ok => Results.Ok(await BuildStatusAsync(db, (await db.Users.FindAsync([userId], ct))!, config, clock.GetUtcNow().UtcDateTime)),
            GoogleVerifyOutcome.NotConfigured => Error(503, "store_not_configured", "This server doesn't take Google Play purchases."),
            GoogleVerifyOutcome.InvalidPurchase => Error(400, "invalid_purchase", "Google Play doesn't recognise this purchase."),
            GoogleVerifyOutcome.OtherAccount => Error(409, "other_account",
                "This Google Play subscription belongs to a different LogIt account. Sign in to that account to use it."),
            _ => Error(502, "store_unavailable", "Couldn't reach Google Play. Your purchase is safe; try again in a minute."),
        };
    }

    private static IResult Error(int status, string code, string message) =>
        Results.Json(new { error = message, code }, statusCode: status);

    /// Pub/Sub push endpoint. Pub/Sub has to be set up to push to
    /// /billing/google/notifications?token=<GooglePlay:NotificationToken>. The body is never
    /// trusted for state: it only names a purchase token, which is then read from Google.
    private static async Task<IResult> GoogleNotification(
        HttpRequest request, IConfiguration config, GooglePlayBilling billing, IGooglePlayApi google,
        ILoggerFactory loggerFactory, CancellationToken ct)
    {
        var log = loggerFactory.CreateLogger("Logit.Billing");
        var expected = config["GooglePlay:NotificationToken"];
        if (string.IsNullOrEmpty(expected)) return Results.NotFound();
        var given = request.Query["token"].ToString();
        if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(given), Encoding.UTF8.GetBytes(expected)))
        {
            log.LogWarning("Google Play notification with a wrong token rejected");
            return Results.Unauthorized();
        }

        GoogleNotice? notice;
        try
        {
            using var doc = await JsonDocument.ParseAsync(request.Body, cancellationToken: ct);
            notice = GoogleNotice.FromPubSub(doc.RootElement);
        }
        catch (Exception ex) when (ex is JsonException or FormatException or InvalidOperationException)
        {
            // Malformed: acknowledge so Pub/Sub doesn't redeliver it forever.
            log.LogWarning("Unreadable Google Play notification: {Reason}", ex.Message);
            return Results.Ok();
        }
        if (notice is null) return Results.Ok();

        if (notice.PackageName != google.PackageName)
        {
            log.LogWarning("Google Play notification for another app ({Package}) ignored", notice.PackageName);
            return Results.Ok();
        }
        if (notice.IsTest)
        {
            log.LogInformation("Google Play test notification received");
            return Results.Ok();
        }
        if (notice.PurchaseToken is null) return Results.Ok();

        log.LogInformation("Google Play notification {Type} for token …{Tail}", notice.Type, GooglePlayApi.Tail(notice.PurchaseToken));
        try
        {
            await billing.HandleNotificationAsync(notice.PurchaseToken, notice.Revoked, ct);
        }
        catch (GooglePlayUnavailableException ex)
        {
            // Pub/Sub retries anything that isn't a 2xx.
            log.LogWarning("Google Play notification will be retried: {Reason}", ex.Message);
            return Results.StatusCode(503);
        }
        return Results.Ok();
    }

    // ---- Stripe ----------------------------------------------------------------------------

    private static async Task<IResult> Checkout(
        [Microsoft.AspNetCore.Mvc.FromBody] CheckoutRequest req,
        ClaimsPrincipal caller,
        AppDbContext db,
        IConfiguration config,
        TimeProvider clock)
    {
        if (!WebCheckoutEnabled(config))
            return Error(403, "web_checkout_disabled", "Plans are sold in the LogIt app.");

        var userId = caller.GetUserId();
        var user = await db.Users.FindAsync(userId);
        if (user is null) return Results.NotFound();

        if (req.Plan is not ("pro" or "studio"))
            return Results.BadRequest(new { error = "Plan must be 'pro' or 'studio'." });

        // Don't let someone pay twice for the same thing in two stores.
        var subs = await db.BillingSubscriptions.Where(s => s.UserId == userId).ToListAsync();
        if (Entitlements.Current(subs, clock.GetUtcNow().UtcDateTime) is { } current)
            return Error(409, "already_subscribed",
                $"You already have {current.Plan} through {current.Source}. Change it there.");

        if (user.StripeCustomerId is null)
        {
            var customerService = new CustomerService();
            var customer = await customerService.CreateAsync(new CustomerCreateOptions
            {
                Email = user.Email,
                Metadata = new Dictionary<string, string> { ["userId"] = user.Id.ToString() },
            });
            user.StripeCustomerId = customer.Id;
            await db.SaveChangesAsync();
        }

        var priceConfigKey = req.Plan == "studio" ? "Stripe:StudioPriceId" : "Stripe:ProPriceId";
        var priceId = config[priceConfigKey]
            ?? throw new InvalidOperationException($"{priceConfigKey} must be set.");

        var sessionService = new SessionService();
        var session = await sessionService.CreateAsync(new SessionCreateOptions
        {
            Mode = "subscription",
            Customer = user.StripeCustomerId,
            ClientReferenceId = user.Id.ToString(),
            LineItems = [new SessionLineItemOptions { Price = priceId, Quantity = 1 }],
            SuccessUrl = req.SuccessUrl,
            CancelUrl = req.CancelUrl,
            Metadata = new Dictionary<string, string> { ["plan"] = req.Plan },
        });

        return Results.Ok(new CheckoutResponse(session.Url));
    }

    private static async Task<IResult> Portal(
        [Microsoft.AspNetCore.Mvc.FromBody] PortalRequest req,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var userId = caller.GetUserId();
        var user = await db.Users.FindAsync(userId);
        if (user is null) return Results.NotFound();

        if (user.StripeCustomerId is null)
            return Results.BadRequest(new { error = "No web billing account. Plans bought in the app are managed in the app store." });

        var portalService = new Stripe.BillingPortal.SessionService();
        var session = await portalService.CreateAsync(new Stripe.BillingPortal.SessionCreateOptions
        {
            Customer = user.StripeCustomerId,
            ReturnUrl = req.ReturnUrl,
        });

        return Results.Ok(new PortalResponse(session.Url));
    }

    private static async Task<IResult> Webhook(HttpRequest request, AppDbContext db, IConfiguration config, ILoggerFactory loggerFactory, TimeProvider clock)
    {
        var log = loggerFactory.CreateLogger("Logit.Billing");
        using var reader = new StreamReader(request.Body);
        var json = await reader.ReadToEndAsync();

        var webhookSecret = config["Stripe:WebhookSecret"] ?? "";
        Event stripeEvent;
        try
        {
            stripeEvent = EventUtility.ConstructEvent(
                json,
                request.Headers["Stripe-Signature"],
                webhookSecret);
        }
        catch (Exception ex)
        {
            log.LogWarning("Stripe webhook rejected: {Reason}", ex.Message);
            return Results.BadRequest();
        }

        log.LogInformation("Stripe webhook {EventType} ({EventId})", stripeEvent.Type, stripeEvent.Id);
        var now = clock.GetUtcNow().UtcDateTime;

        switch (stripeEvent.Type)
        {
            case "checkout.session.completed":
                await HandleCheckoutCompleted(stripeEvent, db, log, now);
                break;

            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.deleted":
                if (stripeEvent.Data.Object is Stripe.Subscription sub)
                    await UpsertStripeSubscription(sub, db, config, log, now);
                break;
        }

        return Results.Ok();
    }

    private static async Task HandleCheckoutCompleted(Event stripeEvent, AppDbContext db, ILogger log, DateTime now)
    {
        if (stripeEvent.Data.Object is not Session session || session.SubscriptionId is null) return;

        User? user = null;
        if (session.ClientReferenceId is not null && Guid.TryParse(session.ClientReferenceId, out var userId))
            user = await db.Users.FindAsync(userId);
        user ??= await db.Users.FirstOrDefaultAsync(u => u.StripeCustomerId == session.CustomerId);
        if (user is null)
        {
            // Someone paid and no account was upgraded: needs fixing by hand in the admin page.
            log.LogError("Checkout {SessionId} completed but no user matches (client ref {ClientRef}, customer {CustomerId})",
                session.Id, session.ClientReferenceId, session.CustomerId);
            return;
        }
        if (session.CustomerId is not null) user.StripeCustomerId = session.CustomerId;

        var row = await db.BillingSubscriptions.FirstOrDefaultAsync(s =>
            s.Source == SubscriptionSource.Stripe && s.ExternalId == session.SubscriptionId);
        if (row is null)
        {
            // The subscription.* events normally carry the details; this covers them arriving late.
            db.BillingSubscriptions.Add(new BillingSubscription
            {
                UserId = user.Id,
                Source = SubscriptionSource.Stripe,
                ExternalId = session.SubscriptionId,
                Plan = session.Metadata is not null && session.Metadata.TryGetValue("plan", out var plan) && plan == "studio"
                    ? UserTier.Studio
                    : UserTier.Pro,
                State = SubscriptionState.Active,
                AutoRenewing = true,
                CreatedAt = now,
                UpdatedAt = now,
                CheckedAt = now,
            });
        }
        await Entitlements.RecomputeAsync(db, user, now, log);
        await db.SaveChangesAsync();
        log.LogInformation("Checkout {SessionId} completed for user {UserId} ({Tier})", session.Id, user.Id, user.Tier);
    }

    private static async Task UpsertStripeSubscription(Stripe.Subscription sub, AppDbContext db, IConfiguration config, ILogger log, DateTime now)
    {
        var row = await db.BillingSubscriptions.FirstOrDefaultAsync(s =>
            s.Source == SubscriptionSource.Stripe && s.ExternalId == sub.Id);
        var user = row is not null
            ? await db.Users.FindAsync(row.UserId)
            : await db.Users.FirstOrDefaultAsync(u => u.StripeCustomerId == sub.CustomerId);
        if (user is null)
        {
            log.LogWarning("Stripe subscription {SubscriptionId} ({Status}) matches no user", sub.Id, sub.Status);
            return;
        }

        var plan = PlanForPrice(sub, config);
        if (row is null)
        {
            if (plan is null)
            {
                log.LogWarning("Stripe subscription {SubscriptionId} has a price that matches neither plan; ignored", sub.Id);
                return;
            }
            row = new BillingSubscription
            {
                UserId = user.Id,
                Source = SubscriptionSource.Stripe,
                ExternalId = sub.Id,
                CreatedAt = now,
            };
            db.BillingSubscriptions.Add(row);
        }
        else if (plan is null)
        {
            log.LogWarning("Stripe subscription {SubscriptionId} has a price that matches neither plan; plan left at {Plan}",
                sub.Id, row.Plan);
        }

        // The plan follows the subscription both ways: a card that fails then succeeds on retry
        // (past_due -> active) brings the plan back, and a Pro <-> Studio change in the billing
        // portal lands here.
        if (plan is { } p) row.Plan = p;
        if (StateFor(sub) is { } state) row.State = state;
        row.ProductId = sub.Items?.Data?.FirstOrDefault()?.Price?.Id ?? row.ProductId;
        row.AutoRenewing = sub.Status is "active" or "trialing" && !sub.CancelAtPeriodEnd;
        row.CheckedAt = now;
        row.UpdatedAt = now;

        await Entitlements.RecomputeAsync(db, user, now, log);
        await db.SaveChangesAsync();
    }

    /// Stripe status -> our state. past_due/unpaid lose access (Stripe is retrying the card).
    public static SubscriptionState? StateFor(Stripe.Subscription sub) => sub.Status switch
    {
        "active" or "trialing" => sub.CancelAtPeriodEnd ? SubscriptionState.Canceled : SubscriptionState.Active,
        "past_due" or "unpaid" => SubscriptionState.OnHold,
        "canceled" or "incomplete_expired" => SubscriptionState.Expired,
        "incomplete" => SubscriptionState.Pending,
        "paused" => SubscriptionState.Paused,
        _ => null,
    };

    /// The plan a Stripe price belongs to, or null when it matches neither configured price.
    public static UserTier? PlanForPrice(Stripe.Subscription sub, IConfiguration config)
    {
        var priceId = sub.Items?.Data?.FirstOrDefault()?.Price?.Id;
        if (priceId is null) return null;
        if (priceId == config["Stripe:StudioPriceId"]) return UserTier.Studio;
        if (priceId == config["Stripe:ProPriceId"]) return UserTier.Pro;
        return null;
    }
}

/// A Real-time developer notification, unwrapped from its Pub/Sub envelope.
public record GoogleNotice(string? PackageName, string? PurchaseToken, int? Type, bool Revoked, bool IsTest)
{
    public const int SubscriptionRevoked = 12;

    public static GoogleNotice? FromPubSub(JsonElement envelope)
    {
        var data = envelope.GetProperty("message").GetProperty("data").GetString();
        if (string.IsNullOrEmpty(data)) return null;
        using var doc = JsonDocument.Parse(Convert.FromBase64String(data));
        var root = doc.RootElement;
        var package = root.TryGetProperty("packageName", out var pkg) ? pkg.GetString() : null;

        if (root.TryGetProperty("testNotification", out _))
            return new GoogleNotice(package, null, null, false, IsTest: true);

        if (root.TryGetProperty("subscriptionNotification", out var sn))
        {
            int? type = sn.TryGetProperty("notificationType", out var t) && t.TryGetInt32(out var n) ? n : null;
            return new GoogleNotice(package, sn.GetProperty("purchaseToken").GetString(), type, type == SubscriptionRevoked, false);
        }

        // A refunded or charged-back purchase. productType 1 = subscription.
        if (root.TryGetProperty("voidedPurchaseNotification", out var vn)
            && vn.TryGetProperty("productType", out var pt) && pt.TryGetInt32(out var productType) && productType == 1)
            return new GoogleNotice(package, vn.GetProperty("purchaseToken").GetString(), null, Revoked: true, false);

        // One-time products: we don't sell any.
        return new GoogleNotice(package, null, null, false, false);
    }
}
