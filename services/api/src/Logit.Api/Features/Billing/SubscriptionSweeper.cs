using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Billing;

/// A store whose subscriptions can be read again on demand (Google Play now, the App Store
/// later). The sweeper uses it when a notice may have been missed.
public interface ISubscriptionRefresher
{
    SubscriptionSource Source { get; }
    Task RefreshAsync(BillingSubscription sub, CancellationToken ct);
}

/// Store notifications can be lost, so once an hour this:
/// - re-reads from the store any subscription whose paid period has ended, and any not checked
///   in a day that is still live (it also retries acknowledging purchases);
/// - for stores it can't ask, drops access once the paid period has ended.
public class SubscriptionSweeper(IServiceScopeFactory scopes, ILogger<SubscriptionSweeper> log, TimeProvider clock) : BackgroundService
{
    public const int BatchSize = 200;
    private static readonly SubscriptionState[] Live =
    [
        SubscriptionState.Pending, SubscriptionState.Active, SubscriptionState.Canceled,
        SubscriptionState.GracePeriod, SubscriptionState.OnHold, SubscriptionState.Paused,
    ];

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Let start-up (migrations) finish first.
        try { await Task.Delay(TimeSpan.FromMinutes(1), clock, stoppingToken); }
        catch (OperationCanceledException) { return; }

        using var timer = new PeriodicTimer(TimeSpan.FromHours(1), clock);
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                await SweepAsync(scope.ServiceProvider, stoppingToken);
            }
            catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
            {
                log.LogError(ex, "Subscription sweep failed");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    /// One pass. Public so tests can run it.
    public static async Task<int> SweepAsync(IServiceProvider services, CancellationToken ct)
    {
        var db = services.GetRequiredService<AppDbContext>();
        var log = services.GetRequiredService<ILogger<SubscriptionSweeper>>();
        var now = services.GetRequiredService<TimeProvider>().GetUtcNow().UtcDateTime;
        var refreshers = services.GetServices<ISubscriptionRefresher>().ToDictionary(r => r.Source);
        var askable = refreshers.Keys.ToArray();
        var staleBefore = now.AddDays(-1);

        var due = await db.BillingSubscriptions
            .Where(s => Live.Contains(s.State)
                        && ((s.ExpiresAt != null && s.ExpiresAt <= now)
                            || (askable.Contains(s.Source) && (s.CheckedAt == null || s.CheckedAt < staleBefore))))
            .OrderBy(s => s.CheckedAt)
            .Take(BatchSize)
            .ToListAsync(ct);

        var count = 0;
        foreach (var sub in due)
        {
            if (refreshers.TryGetValue(sub.Source, out var refresher))
            {
                try
                {
                    await refresher.RefreshAsync(sub, ct);
                    count++;
                }
                catch (Exception ex) when (!ct.IsCancellationRequested)
                {
                    log.LogWarning("Couldn't refresh {Source} subscription {Id}: {Reason}", sub.Source, sub.Id, ex.Message);
                }
            }
            else if (sub.ExpiresAt is { } end && end <= now)
            {
                // Nobody to ask: the paid period is over, so access ends.
                sub.State = SubscriptionState.Expired;
                sub.UpdatedAt = now;
                var user = await db.Users.FindAsync([sub.UserId], ct);
                if (user is not null) await Entitlements.RecomputeAsync(db, user, now, log);
                await db.SaveChangesAsync(ct);
                count++;
            }
        }
        if (count > 0) log.LogInformation("Subscription sweep updated {Count} subscription(s)", count);
        return count;
    }
}
