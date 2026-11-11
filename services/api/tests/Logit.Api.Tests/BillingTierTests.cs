using Logit.Api.Data.Entities;
using Logit.Api.Features.Billing;
using Microsoft.Extensions.Configuration;
using Stripe;

namespace Logit.Api.Tests;

public class BillingTierTests
{
    private static readonly IConfiguration Config = new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Stripe:ProPriceId"] = "price_pro",
            ["Stripe:StudioPriceId"] = "price_studio",
        })
        .Build();

    private static Subscription Sub(string status, string? priceId) => new()
    {
        Status = status,
        Items = new StripeList<SubscriptionItem>
        {
            Data = priceId is null ? [] : [new SubscriptionItem { Price = new Price { Id = priceId } }],
        },
    };

    [Theory]
    [InlineData("active", "price_pro", UserTier.Pro)]
    [InlineData("active", "price_studio", UserTier.Studio)]
    [InlineData("trialing", "price_studio", UserTier.Studio)]
    // A card that recovers after a failed payment comes back as active: the paid tier returns.
    [InlineData("past_due", "price_pro", UserTier.Free)]
    [InlineData("unpaid", "price_studio", UserTier.Free)]
    [InlineData("canceled", "price_pro", UserTier.Free)]
    [InlineData("incomplete_expired", "price_pro", UserTier.Free)]
    public void Tier_follows_status_and_price(string status, string priceId, UserTier expected)
    {
        Assert.Equal(expected, BillingEndpoints.TierFor(Sub(status, priceId), Config));
    }

    [Fact]
    public void Unknown_price_leaves_the_tier_alone()
    {
        Assert.Null(BillingEndpoints.TierFor(Sub("active", "price_someone_else"), Config));
        Assert.Null(BillingEndpoints.TierFor(Sub("active", null), Config));
    }
}
