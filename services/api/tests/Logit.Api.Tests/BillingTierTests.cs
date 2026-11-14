using Logit.Api.Data.Entities;
using Logit.Api.Features.Billing;
using Microsoft.Extensions.Configuration;
using Stripe;

namespace Logit.Api.Tests;

/// Stripe subscription -> our state and plan.
public class BillingTierTests
{
    private static readonly IConfiguration Config = new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Stripe:ProPriceId"] = "price_pro",
            ["Stripe:StudioPriceId"] = "price_studio",
        })
        .Build();

    private static Subscription Sub(string status, string? priceId, bool cancelAtPeriodEnd = false) => new()
    {
        Status = status,
        CancelAtPeriodEnd = cancelAtPeriodEnd,
        Items = new StripeList<SubscriptionItem>
        {
            Data = priceId is null ? [] : [new SubscriptionItem { Price = new Price { Id = priceId } }],
        },
    };

    [Theory]
    [InlineData("active", false, SubscriptionState.Active)]
    [InlineData("trialing", false, SubscriptionState.Active)]
    [InlineData("active", true, SubscriptionState.Canceled)] // cancelled, paid up to period end
    // A card that recovers after a failed payment comes back as active: access returns.
    [InlineData("past_due", false, SubscriptionState.OnHold)]
    [InlineData("unpaid", false, SubscriptionState.OnHold)]
    [InlineData("canceled", false, SubscriptionState.Expired)]
    [InlineData("incomplete_expired", false, SubscriptionState.Expired)]
    [InlineData("incomplete", false, SubscriptionState.Pending)]
    public void State_follows_stripe_status(string status, bool cancelAtPeriodEnd, SubscriptionState expected)
    {
        Assert.Equal(expected, BillingEndpoints.StateFor(Sub(status, "price_pro", cancelAtPeriodEnd)));
    }

    [Fact]
    public void Plan_follows_the_price()
    {
        Assert.Equal(UserTier.Pro, BillingEndpoints.PlanForPrice(Sub("active", "price_pro"), Config));
        Assert.Equal(UserTier.Studio, BillingEndpoints.PlanForPrice(Sub("active", "price_studio"), Config));
    }

    [Fact]
    public void Unknown_price_gives_no_plan()
    {
        Assert.Null(BillingEndpoints.PlanForPrice(Sub("active", "price_someone_else"), Config));
        Assert.Null(BillingEndpoints.PlanForPrice(Sub("active", null), Config));
    }
}
