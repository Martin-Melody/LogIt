using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Billing.GooglePlay;

public enum GoogleVerifyOutcome { Ok, NotConfigured, InvalidPurchase, OtherAccount, StoreUnavailable }

/// Turns Google Play purchases into BillingSubscription rows. Google is always asked for the
/// real state: neither the app nor a notification is trusted to say what was bought.
///
/// Config: GooglePlay:ProProductId (default logit_pro), GooglePlay:StudioProductId (default
/// logit_studio). The app passes the Logit user id as the purchase's obfuscatedAccountId, so a
/// purchase can't be claimed by a different Logit account.
public class GooglePlayBilling(
    AppDbContext db,
    IGooglePlayApi google,
    IConfiguration config,
    ILogger<GooglePlayBilling> log,
    TimeProvider clock) : ISubscriptionRefresher
{
    public SubscriptionSource Source => SubscriptionSource.Google;

    public UserTier? PlanFor(string productId)
    {
        var pro = config["GooglePlay:ProProductId"] is { Length: > 0 } p ? p : "logit_pro";
        var studio = config["GooglePlay:StudioProductId"] is { Length: > 0 } s ? s : "logit_studio";
        if (productId == studio) return UserTier.Studio;
        if (productId == pro) return UserTier.Pro;
        return null;
    }

    /// Null for a state we don't recognise (left as it was).
    public static SubscriptionState? StateFor(string googleState) => googleState switch
    {
        "SUBSCRIPTION_STATE_PENDING" => SubscriptionState.Pending,
        "SUBSCRIPTION_STATE_ACTIVE" => SubscriptionState.Active,
        "SUBSCRIPTION_STATE_PAUSED" => SubscriptionState.Paused,
        "SUBSCRIPTION_STATE_IN_GRACE_PERIOD" => SubscriptionState.GracePeriod,
        "SUBSCRIPTION_STATE_ON_HOLD" => SubscriptionState.OnHold,
        "SUBSCRIPTION_STATE_CANCELED" => SubscriptionState.Canceled,
        "SUBSCRIPTION_STATE_EXPIRED" => SubscriptionState.Expired,
        "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED" => SubscriptionState.Expired,
        _ => null,
    };

    /// The app calls this after a purchase and when restoring purchases on start-up.
    public async Task<GoogleVerifyOutcome> VerifyAsync(Guid userId, string purchaseToken, CancellationToken ct = default)
    {
        if (!google.IsConfigured) return GoogleVerifyOutcome.NotConfigured;
        if (string.IsNullOrWhiteSpace(purchaseToken) || purchaseToken.Length > 512) return GoogleVerifyOutcome.InvalidPurchase;

        GoogleSubscription? sub;
        try { sub = await google.GetSubscriptionAsync(purchaseToken, ct); }
        catch (GooglePlayUnavailableException ex)
        {
            log.LogWarning("Purchase check for user {UserId} failed: {Reason}", userId, ex.Message);
            return GoogleVerifyOutcome.StoreUnavailable;
        }
        if (sub is null) return GoogleVerifyOutcome.InvalidPurchase;

        return await ApplyAsync(purchaseToken, sub, claimedBy: userId, revoked: false, ct);
    }

    /// A Real-time developer notification named this token: read it from Google again.
    /// Throws GooglePlayUnavailableException so the notification is retried.
    public async Task HandleNotificationAsync(string purchaseToken, bool revoked, CancellationToken ct = default)
    {
        if (!google.IsConfigured)
        {
            log.LogWarning("Google Play notification received but Google Play isn't configured");
            return;
        }
        var sub = await google.GetSubscriptionAsync(purchaseToken, ct);
        if (sub is null)
        {
            if (revoked) await MarkRevokedAsync(purchaseToken, ct);
            return;
        }
        await ApplyAsync(purchaseToken, sub, claimedBy: null, revoked, ct);
    }

    public async Task RefreshAsync(BillingSubscription row, CancellationToken ct)
    {
        var sub = await google.GetSubscriptionAsync(row.ExternalId, ct);
        if (sub is null)
        {
            // Google forgets tokens 60 days after they expire.
            var now = clock.GetUtcNow().UtcDateTime;
            row.State = SubscriptionState.Expired;
            row.CheckedAt = now;
            row.UpdatedAt = now;
            var user = await db.Users.FindAsync([row.UserId], ct);
            if (user is not null) await Entitlements.RecomputeAsync(db, user, now, log);
            await db.SaveChangesAsync(ct);
            return;
        }
        await ApplyAsync(row.ExternalId, sub, claimedBy: null, revoked: false, ct);
    }

    private async Task<GoogleVerifyOutcome> ApplyAsync(
        string token, GoogleSubscription sub, Guid? claimedBy, bool revoked, CancellationToken ct)
    {
        var now = clock.GetUtcNow().UtcDateTime;

        var plans = sub.ProductIds.Select(PlanFor).Where(p => p is not null).Select(p => p!.Value).ToList();
        if (plans.Count == 0)
        {
            log.LogWarning("Google Play token …{Tail} is for unknown product(s) {Products}",
                GooglePlayApi.Tail(token), string.Join(",", sub.ProductIds));
            return GoogleVerifyOutcome.InvalidPurchase;
        }
        var plan = plans.Max();
        var productId = sub.ProductIds.First(p => PlanFor(p) == plan);

        var row = await db.BillingSubscriptions
            .FirstOrDefaultAsync(s => s.Source == SubscriptionSource.Google && s.ExternalId == token, ct);

        // Who owns it: whoever already has it, else the account the purchase was made for.
        Guid? accountId = Guid.TryParse(sub.AccountId, out var a) ? a : null;
        if (claimedBy is { } claimant)
        {
            if (row is not null && row.UserId != claimant) return Reject("already belongs to user", row.UserId);
            if (accountId is { } acct && acct != claimant) return Reject("was bought for user", acct);
        }
        var ownerId = row?.UserId ?? claimedBy ?? accountId;
        if (ownerId is null)
        {
            log.LogInformation("Google Play token …{Tail} has no Logit account yet; the app will claim it", GooglePlayApi.Tail(token));
            return GoogleVerifyOutcome.Ok;
        }
        var owner = await db.Users.FindAsync([ownerId.Value], ct);
        if (owner is null)
        {
            log.LogWarning("Google Play token …{Tail} belongs to user {UserId}, who no longer exists", GooglePlayApi.Tail(token), ownerId);
            return GoogleVerifyOutcome.Ok;
        }

        if (row is null)
        {
            row = new BillingSubscription
            {
                UserId = owner.Id,
                Source = SubscriptionSource.Google,
                ExternalId = token,
                CreatedAt = now,
                State = SubscriptionState.Pending,
            };
            db.BillingSubscriptions.Add(row);
        }
        var before = row.State;
        row.ProductId = productId;
        row.Plan = plan;
        row.State = revoked ? SubscriptionState.Revoked : StateFor(sub.State) ?? row.State;
        row.ExpiresAt = sub.ExpiresAt;
        row.AutoRenewing = sub.AutoRenewing;
        row.ReplacesExternalId = sub.LinkedPurchaseToken;
        row.IsTest = sub.IsTest;
        row.CheckedAt = now;
        row.UpdatedAt = now;
        if (before != row.State)
            log.LogInformation("Google subscription …{Tail} ({Plan}) for user {UserId}: {From} -> {To} (order {OrderId})",
                GooglePlayApi.Tail(token), plan, owner.Id, before, row.State, sub.LatestOrderId);

        // An upgrade, downgrade or resubscribe gives a new token; the old one stops counting.
        var touched = new HashSet<Guid> { owner.Id };
        if (sub.LinkedPurchaseToken is { Length: > 0 } linked && linked != token)
        {
            var old = await db.BillingSubscriptions
                .FirstOrDefaultAsync(s => s.Source == SubscriptionSource.Google && s.ExternalId == linked, ct);
            if (old is not null && old.State != SubscriptionState.Replaced)
            {
                old.State = SubscriptionState.Replaced;
                old.UpdatedAt = now;
                touched.Add(old.UserId);
            }
        }

        foreach (var id in touched)
        {
            var user = id == owner.Id ? owner : await db.Users.FindAsync([id], ct);
            if (user is not null) await Entitlements.RecomputeAsync(db, user, now, log);
        }
        await db.SaveChangesAsync(ct);

        // Acknowledge only once access is saved, so a crash in between can't leave someone
        // charged without the plan. Unacknowledged purchases are refunded after 3 days; the next
        // check (app start, notification or the hourly sweep) tries again.
        if (sub.NeedsAcknowledge && row.State is SubscriptionState.Active or SubscriptionState.GracePeriod or SubscriptionState.Canceled)
        {
            try { await google.AcknowledgeAsync(productId, token, ct); }
            catch (GooglePlayUnavailableException ex)
            {
                log.LogWarning("Couldn't acknowledge Google purchase …{Tail} yet: {Reason}", GooglePlayApi.Tail(token), ex.Message);
            }
        }
        return GoogleVerifyOutcome.Ok;

        GoogleVerifyOutcome Reject(string why, Guid other)
        {
            log.LogWarning("User {UserId} tried to claim Google purchase …{Tail}, which {Why} {Other}",
                claimedBy, GooglePlayApi.Tail(token), why, other);
            return GoogleVerifyOutcome.OtherAccount;
        }
    }

    private async Task MarkRevokedAsync(string token, CancellationToken ct)
    {
        var row = await db.BillingSubscriptions
            .FirstOrDefaultAsync(s => s.Source == SubscriptionSource.Google && s.ExternalId == token, ct);
        if (row is null) return;
        var now = clock.GetUtcNow().UtcDateTime;
        row.State = SubscriptionState.Revoked;
        row.UpdatedAt = now;
        var user = await db.Users.FindAsync([row.UserId], ct);
        if (user is not null) await Entitlements.RecomputeAsync(db, user, now, log);
        await db.SaveChangesAsync(ct);
    }
}
