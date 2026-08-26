using System.Security.Claims;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Stripe;
using Stripe.Checkout;

namespace Logit.Api.Features.Billing;

public static class BillingEndpoints
{
    public static void MapBillingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/billing").WithTags("Billing");

        group.MapPost("/checkout", Checkout).RequireAuthorization();
        group.MapPost("/portal", Portal).RequireAuthorization();
        group.MapGet("/status", Status).RequireAuthorization();
        group.MapPost("/webhook", Webhook);
    }

    private static async Task<IResult> Checkout(
        [Microsoft.AspNetCore.Mvc.FromBody] CheckoutRequest req,
        ClaimsPrincipal caller,
        AppDbContext db,
        IConfiguration config)
    {
        var userId = caller.GetUserId();
        var user = await db.Users.FindAsync(userId);
        if (user is null) return Results.NotFound();

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

        if (req.Plan is not ("pro" or "studio"))
            return Results.BadRequest(new { error = "Plan must be 'pro' or 'studio'." });

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
            return Results.BadRequest(new { error = "No billing account yet — subscribe to a plan first." });

        var portalService = new Stripe.BillingPortal.SessionService();
        var session = await portalService.CreateAsync(new Stripe.BillingPortal.SessionCreateOptions
        {
            Customer = user.StripeCustomerId,
            ReturnUrl = req.ReturnUrl,
        });

        return Results.Ok(new PortalResponse(session.Url));
    }

    private static async Task<IResult> Status(ClaimsPrincipal caller, AppDbContext db)
    {
        var userId = caller.GetUserId();
        var user = await db.Users.FindAsync(userId);
        if (user is null) return Results.NotFound();

        var active = user.Tier != UserTier.Free && user.StripeSubscriptionId is not null;
        return Results.Ok(new BillingStatusResponse(user.Tier.ToString(), active));
    }

    private static async Task<IResult> Webhook(HttpRequest request, AppDbContext db, IConfiguration config)
    {
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
        catch (Exception)
        {
            return Results.BadRequest();
        }

        switch (stripeEvent.Type)
        {
            case "checkout.session.completed":
                await HandleCheckoutCompleted(stripeEvent, db);
                break;

            case "customer.subscription.deleted":
                await HandleSubscriptionDeleted(stripeEvent, db);
                break;

            case "customer.subscription.updated":
                await HandleSubscriptionUpdated(stripeEvent, db);
                break;
        }

        return Results.Ok();
    }

    private static async Task HandleCheckoutCompleted(Event stripeEvent, AppDbContext db)
    {
        if (stripeEvent.Data.Object is not Session session) return;

        User? user = null;
        if (session.ClientReferenceId is not null && Guid.TryParse(session.ClientReferenceId, out var userId))
            user = await db.Users.FindAsync(userId);
        user ??= await db.Users.FirstOrDefaultAsync(u => u.StripeCustomerId == session.CustomerId);
        if (user is null) return;

        user.Tier = session.Metadata is not null && session.Metadata.TryGetValue("plan", out var plan) && plan == "studio"
            ? UserTier.Studio
            : UserTier.Pro;
        user.StripeSubscriptionId = session.SubscriptionId;
        if (session.CustomerId is not null) user.StripeCustomerId = session.CustomerId;
        await db.SaveChangesAsync();
    }

    private static async Task HandleSubscriptionDeleted(Event stripeEvent, AppDbContext db)
    {
        if (stripeEvent.Data.Object is not Subscription sub) return;

        var user = await db.Users.FirstOrDefaultAsync(u => u.StripeSubscriptionId == sub.Id);
        if (user is null) return;

        user.Tier = UserTier.Free;
        user.StripeSubscriptionId = null;
        await db.SaveChangesAsync();
    }

    private static async Task HandleSubscriptionUpdated(Event stripeEvent, AppDbContext db)
    {
        if (stripeEvent.Data.Object is not Subscription sub) return;

        var user = await db.Users.FirstOrDefaultAsync(u => u.StripeSubscriptionId == sub.Id);
        if (user is null) return;

        // Only act on deactivation — we don't reliably know Pro vs Studio from this event
        // alone, and the tier is already correct (set by checkout.session.completed) for
        // any subscription that's still active, so there's nothing to do in that case.
        var active = sub.Status is "active" or "trialing";
        if (!active)
        {
            user.Tier = UserTier.Free;
            await db.SaveChangesAsync();
        }
    }
}
