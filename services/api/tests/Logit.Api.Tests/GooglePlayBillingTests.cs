using System.Text;
using System.Text.Json;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Billing;
using Logit.Api.Features.Billing.GooglePlay;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace Logit.Api.Tests;

public class FakeClock(DateTime now) : TimeProvider
{
    public DateTime Now { get; set; } = now;
    public override DateTimeOffset GetUtcNow() => new(Now, TimeSpan.Zero);
}

/// Stands in for Google: holds purchases by token and records acknowledgements.
public class FakeGooglePlay : IGooglePlayApi
{
    public Dictionary<string, GoogleSubscription> Purchases { get; } = [];
    public List<string> Acknowledged { get; } = [];
    public bool Down { get; set; }
    public bool IsConfigured { get; set; } = true;
    public string PackageName => "ie.logit.app";

    public Task<GoogleSubscription?> GetSubscriptionAsync(string token, CancellationToken ct = default)
    {
        if (Down) throw new GooglePlayUnavailableException("down");
        return Task.FromResult(Purchases.GetValueOrDefault(token));
    }

    public Task AcknowledgeAsync(string productId, string token, CancellationToken ct = default)
    {
        if (Down) throw new GooglePlayUnavailableException("down");
        Acknowledged.Add(token);
        // Google remembers it.
        if (Purchases.TryGetValue(token, out var p)) Purchases[token] = p with { NeedsAcknowledge = false };
        return Task.CompletedTask;
    }
}

public class GooglePlayBillingTests : IAsyncLifetime
{
    private static readonly DateTime Now = new(2026, 11, 14, 12, 0, 0, DateTimeKind.Utc);
    private static readonly IConfiguration Config = new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["GooglePlay:ProProductId"] = "logit_pro",
            ["GooglePlay:StudioProductId"] = "logit_studio",
        })
        .Build();

    private SqliteConnection _conn = null!;
    private AppDbContext _db = null!;
    private readonly FakeGooglePlay _google = new();
    private readonly FakeClock _clock = new(Now);
    private GooglePlayBilling _billing = null!;
    private User _alex = null!;
    private User _niamh = null!;

    public async Task InitializeAsync()
    {
        _conn = new SqliteConnection("Data Source=:memory:");
        _conn.Open();
        _db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_conn).Options);
        await _db.Database.EnsureCreatedAsync();
        _alex = new User { Username = "alex", Email = "alex@example.com", DisplayName = "Alex" };
        _niamh = new User { Username = "niamh", Email = "niamh@example.com", DisplayName = "Niamh" };
        _db.Users.AddRange(_alex, _niamh);
        await _db.SaveChangesAsync();
        _billing = new GooglePlayBilling(_db, _google, Config, NullLogger<GooglePlayBilling>.Instance, _clock);
    }

    public async Task DisposeAsync()
    {
        await _db.DisposeAsync();
        await _conn.DisposeAsync();
    }

    private static GoogleSubscription Purchase(
        string state = "SUBSCRIPTION_STATE_ACTIVE", string product = "logit_pro", User? forUser = null,
        int daysLeft = 30, bool needsAck = true, string? linked = null, bool autoRenew = true) =>
        new(state, [product], Now.AddDays(daysLeft), autoRenew, linked, needsAck,
            forUser?.Id.ToString(), IsTest: false, LatestOrderId: "GPA.1234");

    private async Task<User> Reload(User u)
    {
        await _db.Entry(u).ReloadAsync();
        return u;
    }

    [Fact]
    public async Task A_new_purchase_gives_the_plan_and_is_acknowledged()
    {
        _google.Purchases["tok1"] = Purchase(forUser: _alex);

        Assert.Equal(GoogleVerifyOutcome.Ok, await _billing.VerifyAsync(_alex.Id, "tok1"));

        Assert.Equal(UserTier.Pro, (await Reload(_alex)).Tier);
        var row = await _db.BillingSubscriptions.SingleAsync();
        Assert.Equal(SubscriptionSource.Google, row.Source);
        Assert.Equal(SubscriptionState.Active, row.State);
        Assert.Equal(Now.AddDays(30), row.ExpiresAt);
        Assert.Equal(["tok1"], _google.Acknowledged);
    }

    [Fact]
    public async Task Verifying_again_is_harmless_and_does_not_acknowledge_twice()
    {
        _google.Purchases["tok1"] = Purchase(forUser: _alex);
        await _billing.VerifyAsync(_alex.Id, "tok1");
        await _billing.VerifyAsync(_alex.Id, "tok1");

        Assert.Equal(1, await _db.BillingSubscriptions.CountAsync());
        Assert.Single(_google.Acknowledged);
    }

    [Fact]
    public async Task A_purchase_made_for_another_account_cannot_be_claimed()
    {
        _google.Purchases["tok1"] = Purchase(forUser: _alex);

        Assert.Equal(GoogleVerifyOutcome.OtherAccount, await _billing.VerifyAsync(_niamh.Id, "tok1"));
        Assert.Equal(UserTier.Free, (await Reload(_niamh)).Tier);
        Assert.Empty(_google.Acknowledged);
    }

    [Fact]
    public async Task A_token_already_owned_cannot_move_to_another_account()
    {
        // No account id on the purchase (an old app build), so ownership comes from the first claim.
        _google.Purchases["tok1"] = Purchase(forUser: null);
        Assert.Equal(GoogleVerifyOutcome.Ok, await _billing.VerifyAsync(_alex.Id, "tok1"));
        Assert.Equal(GoogleVerifyOutcome.OtherAccount, await _billing.VerifyAsync(_niamh.Id, "tok1"));
        Assert.Equal(UserTier.Free, (await Reload(_niamh)).Tier);
    }

    [Theory]
    [InlineData("made-up")]
    [InlineData("")]
    public async Task Unknown_tokens_are_rejected(string token)
    {
        Assert.Equal(GoogleVerifyOutcome.InvalidPurchase, await _billing.VerifyAsync(_alex.Id, token));
    }

    [Fact]
    public async Task Another_apps_product_is_rejected()
    {
        _google.Purchases["tok1"] = Purchase(product: "some_other_sub", forUser: _alex);
        Assert.Equal(GoogleVerifyOutcome.InvalidPurchase, await _billing.VerifyAsync(_alex.Id, "tok1"));
        Assert.Equal(UserTier.Free, (await Reload(_alex)).Tier);
    }

    [Fact]
    public async Task Google_down_is_reported_and_nothing_changes()
    {
        _google.Down = true;
        Assert.Equal(GoogleVerifyOutcome.StoreUnavailable, await _billing.VerifyAsync(_alex.Id, "tok1"));
        Assert.Equal(0, await _db.BillingSubscriptions.CountAsync());
    }

    [Fact]
    public async Task Not_configured_is_reported()
    {
        _google.IsConfigured = false;
        Assert.Equal(GoogleVerifyOutcome.NotConfigured, await _billing.VerifyAsync(_alex.Id, "tok1"));
    }

    [Theory]
    [InlineData("SUBSCRIPTION_STATE_CANCELED", UserTier.Pro)]        // cancelled, paid up: keeps it
    [InlineData("SUBSCRIPTION_STATE_IN_GRACE_PERIOD", UserTier.Pro)] // card failed, retrying: keeps it
    [InlineData("SUBSCRIPTION_STATE_ON_HOLD", UserTier.Free)]
    [InlineData("SUBSCRIPTION_STATE_PAUSED", UserTier.Free)]
    [InlineData("SUBSCRIPTION_STATE_EXPIRED", UserTier.Free)]
    [InlineData("SUBSCRIPTION_STATE_PENDING", UserTier.Free)]
    public async Task Notifications_move_the_plan_with_googles_state(string state, UserTier expected)
    {
        _google.Purchases["tok1"] = Purchase(forUser: _alex);
        await _billing.VerifyAsync(_alex.Id, "tok1");

        _google.Purchases["tok1"] = Purchase(state, forUser: _alex, needsAck: false);
        await _billing.HandleNotificationAsync("tok1", revoked: false);

        Assert.Equal(expected, (await Reload(_alex)).Tier);
    }

    [Fact]
    public async Task A_notification_can_create_the_row_before_the_app_reports_it()
    {
        // The app crashed after paying; Google's notice arrives first.
        _google.Purchases["tok1"] = Purchase(product: "logit_studio", forUser: _alex);
        await _billing.HandleNotificationAsync("tok1", revoked: false);

        Assert.Equal(UserTier.Studio, (await Reload(_alex)).Tier);
        Assert.Single(_google.Acknowledged);
    }

    [Fact]
    public async Task A_notification_for_a_purchase_with_no_account_waits_for_the_app()
    {
        _google.Purchases["tok1"] = Purchase(forUser: null);
        await _billing.HandleNotificationAsync("tok1", revoked: false);
        Assert.Equal(0, await _db.BillingSubscriptions.CountAsync());
    }

    [Fact]
    public async Task A_refund_takes_the_plan_away()
    {
        _google.Purchases["tok1"] = Purchase(forUser: _alex);
        await _billing.VerifyAsync(_alex.Id, "tok1");

        _google.Purchases["tok1"] = Purchase("SUBSCRIPTION_STATE_EXPIRED", forUser: _alex, needsAck: false);
        await _billing.HandleNotificationAsync("tok1", revoked: true);

        Assert.Equal(UserTier.Free, (await Reload(_alex)).Tier);
        Assert.Equal(SubscriptionState.Revoked, (await _db.BillingSubscriptions.SingleAsync()).State);
    }

    [Fact]
    public async Task Upgrading_replaces_the_old_subscription()
    {
        _google.Purchases["pro-tok"] = Purchase(forUser: _alex);
        await _billing.VerifyAsync(_alex.Id, "pro-tok");

        // Pro -> Studio: Google issues a new token that links to the old one.
        _google.Purchases["studio-tok"] = Purchase(product: "logit_studio", forUser: _alex, linked: "pro-tok");
        await _billing.VerifyAsync(_alex.Id, "studio-tok");

        Assert.Equal(UserTier.Studio, (await Reload(_alex)).Tier);
        var old = await _db.BillingSubscriptions.SingleAsync(s => s.ExternalId == "pro-tok");
        Assert.Equal(SubscriptionState.Replaced, old.State);
    }

    [Fact]
    public async Task Downgrading_replaces_the_old_subscription()
    {
        _google.Purchases["studio-tok"] = Purchase(product: "logit_studio", forUser: _alex);
        await _billing.VerifyAsync(_alex.Id, "studio-tok");
        _google.Purchases["pro-tok"] = Purchase(product: "logit_pro", forUser: _alex, linked: "studio-tok");
        await _billing.VerifyAsync(_alex.Id, "pro-tok");

        Assert.Equal(UserTier.Pro, (await Reload(_alex)).Tier);
    }

    [Fact]
    public async Task An_admin_grant_and_a_subscription_combine()
    {
        _alex.ManualTier = UserTier.Studio;
        await Entitlements.RecomputeAsync(_db, _alex, Now);
        await _db.SaveChangesAsync();

        _google.Purchases["tok1"] = Purchase(forUser: _alex);
        await _billing.VerifyAsync(_alex.Id, "tok1");
        Assert.Equal(UserTier.Studio, (await Reload(_alex)).Tier);

        // Subscription lapses: the grant still holds.
        _google.Purchases["tok1"] = Purchase("SUBSCRIPTION_STATE_EXPIRED", forUser: _alex, needsAck: false);
        await _billing.HandleNotificationAsync("tok1", false);
        Assert.Equal(UserTier.Studio, (await Reload(_alex)).Tier);
    }

    [Fact]
    public async Task Acknowledging_is_retried_when_it_failed()
    {
        _google.Purchases["tok1"] = Purchase(forUser: _alex);
        await _billing.VerifyAsync(_alex.Id, "tok1");
        _google.Acknowledged.Clear();
        _google.Purchases["tok1"] = Purchase(forUser: _alex, needsAck: true); // Google never got it

        await _billing.RefreshAsync(await _db.BillingSubscriptions.SingleAsync(), default);

        Assert.Equal(["tok1"], _google.Acknowledged);
    }

    // ---- Sweeper ----

    private ServiceProvider Services(params ISubscriptionRefresher[] refreshers)
    {
        var services = new ServiceCollection();
        services.AddSingleton(_db);
        services.AddSingleton<TimeProvider>(_clock);
        services.AddSingleton(typeof(ILogger<>), typeof(NullLogger<>));
        foreach (var r in refreshers) services.AddSingleton<ISubscriptionRefresher>(r);
        return services.BuildServiceProvider();
    }

    [Fact]
    public async Task The_sweeper_catches_a_missed_expiry_notice()
    {
        _google.Purchases["tok1"] = Purchase("SUBSCRIPTION_STATE_CANCELED", forUser: _alex, daysLeft: 3, autoRenew: false);
        await _billing.VerifyAsync(_alex.Id, "tok1");
        Assert.Equal(UserTier.Pro, (await Reload(_alex)).Tier);

        // Four days on, the EXPIRED notice never arrived.
        _clock.Now = Now.AddDays(4);
        _google.Purchases["tok1"] = Purchase("SUBSCRIPTION_STATE_EXPIRED", forUser: _alex, daysLeft: 3, needsAck: false, autoRenew: false);
        Assert.Equal(1, await SubscriptionSweeper.SweepAsync(Services(_billing), default));

        Assert.Equal(UserTier.Free, (await Reload(_alex)).Tier);
        Assert.Equal(SubscriptionState.Expired, (await _db.BillingSubscriptions.SingleAsync()).State);
    }

    [Fact]
    public async Task The_sweeper_leaves_fresh_subscriptions_alone()
    {
        _google.Purchases["tok1"] = Purchase(forUser: _alex);
        await _billing.VerifyAsync(_alex.Id, "tok1");
        _clock.Now = Now.AddHours(2);
        Assert.Equal(0, await SubscriptionSweeper.SweepAsync(Services(_billing), default));
    }

    [Fact]
    public async Task The_sweeper_ends_access_for_a_store_it_cannot_ask()
    {
        // An App Store row before the App Store is wired up: past its end date, no refresher.
        _db.BillingSubscriptions.Add(new BillingSubscription
        {
            UserId = _alex.Id, Source = SubscriptionSource.Apple, ExternalId = "1000001", ProductId = "logit_pro",
            Plan = UserTier.Pro, State = SubscriptionState.Canceled, ExpiresAt = Now.AddDays(-1),
        });
        _alex.Tier = UserTier.Pro;
        await _db.SaveChangesAsync();

        Assert.Equal(1, await SubscriptionSweeper.SweepAsync(Services(_billing), default));
        Assert.Equal(UserTier.Free, (await Reload(_alex)).Tier);
    }

    [Fact]
    public async Task The_sweeper_keeps_going_when_google_is_down()
    {
        _google.Purchases["tok1"] = Purchase(forUser: _alex, daysLeft: 1);
        await _billing.VerifyAsync(_alex.Id, "tok1");
        _clock.Now = Now.AddDays(2);
        _google.Down = true;

        Assert.Equal(0, await SubscriptionSweeper.SweepAsync(Services(_billing), default));
        // Paid period over and Google can't confirm a renewal: no access meanwhile.
        Assert.False(Entitlements.GrantsAccess(await _db.BillingSubscriptions.SingleAsync(), _clock.Now));
    }

    // ---- Status ----

    [Fact]
    public async Task Status_says_where_to_manage_the_plan()
    {
        _google.Purchases["tok1"] = Purchase("SUBSCRIPTION_STATE_IN_GRACE_PERIOD", forUser: _alex);
        await _billing.VerifyAsync(_alex.Id, "tok1");

        var status = await BillingEndpoints.BuildStatusAsync(_db, await Reload(_alex), Config, Now);

        Assert.Equal("Pro", status.Tier);
        Assert.True(status.SubscriptionActive);
        Assert.False(status.WebCheckout);
        Assert.NotNull(status.Subscription);
        Assert.Equal("google", status.Subscription!.Source);
        Assert.Equal("gracePeriod", status.Subscription.State);
        Assert.True(status.Subscription.GrantsAccess);
        Assert.Equal("https://play.google.com/store/account/subscriptions?sku=logit_pro&package=ie.logit.app",
            status.Subscription.ManageUrl);
    }

    [Fact]
    public async Task Status_still_shows_a_plan_on_hold()
    {
        _google.Purchases["tok1"] = Purchase(forUser: _alex);
        await _billing.VerifyAsync(_alex.Id, "tok1");
        _google.Purchases["tok1"] = Purchase("SUBSCRIPTION_STATE_ON_HOLD", forUser: _alex, needsAck: false);
        await _billing.HandleNotificationAsync("tok1", false);

        var status = await BillingEndpoints.BuildStatusAsync(_db, await Reload(_alex), Config, Now);

        Assert.Equal("Free", status.Tier);
        Assert.False(status.SubscriptionActive);
        Assert.Equal("onHold", status.Subscription!.State);
        Assert.False(status.Subscription.GrantsAccess);
    }
}

public class GooglePlayParsingTests
{
    [Fact]
    public void Reads_a_subscriptionsv2_response()
    {
        const string json = """
        {
          "kind": "androidpublisher#subscriptionPurchaseV2",
          "startTime": "2026-11-14T10:00:00.123Z",
          "regionCode": "IE",
          "subscriptionState": "SUBSCRIPTION_STATE_ACTIVE",
          "latestOrderId": "GPA.3333-4444-5555-66666",
          "linkedPurchaseToken": "old-token",
          "acknowledgementState": "ACKNOWLEDGEMENT_STATE_PENDING",
          "externalAccountIdentifiers": { "obfuscatedExternalAccountId": "3f2b1c4e-0000-4000-8000-000000000001" },
          "testPurchase": {},
          "lineItems": [{
            "productId": "logit_pro",
            "expiryTime": "2026-12-14T10:00:00.123456789Z",
            "autoRenewingPlan": { "autoRenewEnabled": true },
            "offerDetails": { "basePlanId": "monthly" }
          }]
        }
        """;
        var sub = GoogleSubscription.Parse(JsonDocument.Parse(json).RootElement);

        Assert.Equal("SUBSCRIPTION_STATE_ACTIVE", sub.State);
        Assert.Equal(["logit_pro"], sub.ProductIds);
        Assert.Equal(new DateTime(2026, 12, 14, 10, 0, 0, 123, DateTimeKind.Utc).AddTicks(4567), sub.ExpiresAt);
        Assert.Equal(DateTimeKind.Utc, sub.ExpiresAt!.Value.Kind);
        Assert.True(sub.AutoRenewing);
        Assert.Equal("old-token", sub.LinkedPurchaseToken);
        Assert.True(sub.NeedsAcknowledge);
        Assert.Equal("3f2b1c4e-0000-4000-8000-000000000001", sub.AccountId);
        Assert.True(sub.IsTest);
    }

    [Fact]
    public void Reads_a_cancelled_acknowledged_purchase_without_extras()
    {
        const string json = """
        {
          "subscriptionState": "SUBSCRIPTION_STATE_CANCELED",
          "acknowledgementState": "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
          "lineItems": [{ "productId": "logit_studio", "expiryTime": "2026-12-01T00:00:00Z", "autoRenewingPlan": { "autoRenewEnabled": false } }]
        }
        """;
        var sub = GoogleSubscription.Parse(JsonDocument.Parse(json).RootElement);

        Assert.False(sub.AutoRenewing);
        Assert.False(sub.NeedsAcknowledge);
        Assert.False(sub.IsTest);
        Assert.Null(sub.AccountId);
        Assert.Null(sub.LinkedPurchaseToken);
        Assert.Equal(new DateTime(2026, 12, 1, 0, 0, 0, DateTimeKind.Utc), sub.ExpiresAt);
    }

    private static JsonElement PubSub(string inner) => JsonDocument.Parse($$"""
        { "message": { "data": "{{Convert.ToBase64String(Encoding.UTF8.GetBytes(inner))}}", "messageId": "1" },
          "subscription": "projects/logit/subscriptions/play-rtdn" }
        """).RootElement;

    [Fact]
    public void Unwraps_a_subscription_notification()
    {
        var n = GoogleNotice.FromPubSub(PubSub("""
            {"version":"1.0","packageName":"ie.logit.app","eventTimeMillis":"1763116800000",
             "subscriptionNotification":{"version":"1.0","notificationType":4,"purchaseToken":"tok1","subscriptionId":"logit_pro"}}
            """))!;
        Assert.Equal("ie.logit.app", n.PackageName);
        Assert.Equal("tok1", n.PurchaseToken);
        Assert.Equal(4, n.Type);
        Assert.False(n.Revoked);
        Assert.False(n.IsTest);
    }

    [Fact]
    public void A_revoked_notice_is_marked_revoked()
    {
        var n = GoogleNotice.FromPubSub(PubSub("""
            {"packageName":"ie.logit.app","subscriptionNotification":{"notificationType":12,"purchaseToken":"tok1"}}
            """))!;
        Assert.True(n.Revoked);
    }

    [Fact]
    public void A_voided_subscription_counts_as_revoked_but_a_voided_one_time_product_is_ignored()
    {
        var sub = GoogleNotice.FromPubSub(PubSub("""
            {"packageName":"ie.logit.app","voidedPurchaseNotification":{"purchaseToken":"tok1","orderId":"GPA.1","productType":1,"refundType":1}}
            """))!;
        Assert.True(sub.Revoked);
        Assert.Equal("tok1", sub.PurchaseToken);

        var oneTime = GoogleNotice.FromPubSub(PubSub("""
            {"packageName":"ie.logit.app","voidedPurchaseNotification":{"purchaseToken":"tok2","orderId":"GPA.2","productType":2,"refundType":1}}
            """))!;
        Assert.Null(oneTime.PurchaseToken);
    }

    [Fact]
    public void Recognises_the_play_console_test_notification()
    {
        var n = GoogleNotice.FromPubSub(PubSub("""{"version":"1.0","packageName":"ie.logit.app","testNotification":{"version":"1.0"}}"""))!;
        Assert.True(n.IsTest);
        Assert.Null(n.PurchaseToken);
    }
}

public class EntitlementTests
{
    private static readonly DateTime Now = new(2026, 11, 14, 12, 0, 0, DateTimeKind.Utc);

    private static BillingSubscription Sub(UserTier plan, SubscriptionState state, int daysLeft = 10) => new()
    {
        Plan = plan, State = state, ExpiresAt = Now.AddDays(daysLeft), UpdatedAt = Now,
    };

    [Fact]
    public void The_best_live_plan_wins()
    {
        var subs = new[] { Sub(UserTier.Pro, SubscriptionState.Active), Sub(UserTier.Studio, SubscriptionState.Canceled) };
        Assert.Equal(UserTier.Studio, Entitlements.TierFor(null, subs, Now));
    }

    [Fact]
    public void A_paid_period_that_ended_gives_nothing_even_before_the_notice()
    {
        Assert.Equal(UserTier.Free, Entitlements.TierFor(null, [Sub(UserTier.Pro, SubscriptionState.Active, daysLeft: -1)], Now));
    }

    [Fact]
    public void A_replaced_subscription_gives_nothing()
    {
        Assert.Equal(UserTier.Free, Entitlements.TierFor(null, [Sub(UserTier.Studio, SubscriptionState.Replaced)], Now));
    }

    [Fact]
    public void The_admin_grant_is_a_floor()
    {
        Assert.Equal(UserTier.Pro, Entitlements.TierFor(UserTier.Pro, [], Now));
        Assert.Equal(UserTier.Studio, Entitlements.TierFor(UserTier.Pro, [Sub(UserTier.Studio, SubscriptionState.Active)], Now));
    }
}

public class GooglePlayConfigTests
{
    private static GooglePlayApi Api(Dictionary<string, string?> values) => new(
        new HttpClient(),
        new ConfigurationBuilder().AddInMemoryCollection(values).Build(),
        NullLogger<GooglePlayApi>.Instance);

    [Fact]
    public void A_service_account_key_switches_google_play_on()
    {
        using var rsa = System.Security.Cryptography.RSA.Create(2048);
        var key = JsonSerializer.Serialize(new Dictionary<string, string>
        {
            ["type"] = "service_account",
            ["project_id"] = "logit-test",
            ["private_key_id"] = "abc123",
            ["private_key"] = rsa.ExportPkcs8PrivateKeyPem(),
            ["client_email"] = "play-billing@logit-test.iam.gserviceaccount.com",
            ["client_id"] = "1",
            ["token_uri"] = "https://oauth2.googleapis.com/token",
        });

        var api = Api(new() { ["GooglePlay:ServiceAccountJson"] = key });
        Assert.True(api.IsConfigured);
        Assert.Equal("ie.logit.app", api.PackageName);
    }

    [Fact]
    public void No_key_or_a_bad_key_leaves_it_off()
    {
        Assert.False(Api(new()).IsConfigured);
        Assert.False(Api(new() { ["GooglePlay:ServiceAccountJson"] = "{not json" }).IsConfigured);
        Assert.False(Api(new() { ["GooglePlay:ServiceAccountKeyFile"] = "/nope/key.json" }).IsConfigured);
    }
}
