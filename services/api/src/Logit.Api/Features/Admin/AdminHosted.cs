using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Billing;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Admin;

/// getlogit.app-only admin pages: subscriptions and growth. Self-hosted servers refuse these
/// (see the "hosted" group in AdminEndpoints).
public static class AdminHosted
{
    /// Every subscription that isn't superseded, newest first, plus the counts at the top of the
    /// page. Test purchases are counted apart. No money: prices and income live in the stores.
    public static async Task<IResult> GetSubscriptions(AppDbContext db)
    {
        var now = DateTime.UtcNow;
        var subs = await db.BillingSubscriptions
            .Where(s => s.State != SubscriptionState.Replaced)
            .OrderByDescending(s => s.CreatedAt)
            .Take(1000)
            .Select(s => new
            {
                s.Id,
                s.Plan,
                s.Source,
                s.State,
                s.ExpiresAt,
                s.AutoRenewing,
                s.IsTest,
                s.ProductId,
                s.CreatedAt,
                User = new { s.User.Id, s.User.Username },
            })
            .ToListAsync();

        bool Paying(SubscriptionState st) => st is SubscriptionState.Active or SubscriptionState.Canceled or SubscriptionState.GracePeriod;
        var real = subs.Where(s => !s.IsTest).ToList();
        var paying = real.Where(s => Paying(s.State) && (s.ExpiresAt is null || s.ExpiresAt > now)).ToList();

        return Results.Ok(new
        {
            Counts = new
            {
                PayingPro = paying.Count(s => s.Plan == UserTier.Pro),
                PayingStudio = paying.Count(s => s.Plan == UserTier.Studio),
                NewLast30Days = real.Count(s => s.CreatedAt >= now.AddDays(-30)),
                Stopping = paying.Count(s => s.State == SubscriptionState.Canceled),
                PaymentProblems = real.Count(s => s.State is SubscriptionState.GracePeriod or SubscriptionState.OnHold),
                GivenByHand = await db.Users.CountAsync(u => u.ManualTier != null && !u.IsSample),
                Test = subs.Count(s => s.IsTest),
            },
            Subscriptions = subs.Select(s => new
            {
                s.Id,
                Plan = s.Plan.ToString(),
                Source = s.Source.ToString(),
                State = s.State.ToString(),
                s.ExpiresAt,
                s.AutoRenewing,
                s.IsTest,
                s.ProductId,
                s.CreatedAt,
                s.User,
            }),
        });
    }

    /// Per week of sign-up (Monday, UTC), the last 8 weeks: what those accounts went on to do.
    /// Only counts, worked out from what the server already stores; nothing is tracked for it.
    /// A week's "back in week 2" is null until all of its accounts have had their second week.
    public static async Task<IResult> GetGrowth(AppDbContext db)
    {
        var now = DateTime.UtcNow;
        var thisMonday = now.Date.AddDays(-(((int)now.DayOfWeek + 6) % 7));
        var firstWeek = thisMonday.AddDays(-7 * 7);

        var people = await db.Users.Where(u => !u.IsSample && u.CreatedAt >= firstWeek)
            .Select(u => new { u.Id, u.CreatedAt }).ToListAsync();
        var ids = people.Select(p => p.Id).ToList();
        var starts = (await db.SyncedWorkoutSessions
                .Where(w => ids.Contains(w.UserId) && w.DeletedAtMs == null)
                .Select(w => new { w.UserId, w.StartedAtMs })
                .ToListAsync())
            .ToLookup(w => w.UserId, w => DateTimeOffset.FromUnixTimeMilliseconds(w.StartedAtMs).UtcDateTime);
        var payingIds = (await db.BillingSubscriptions
                .Where(s => ids.Contains(s.UserId) && !s.IsTest)
                .ToListAsync())
            .Where(s => Entitlements.GrantsAccess(s, now))
            .Select(s => s.UserId)
            .ToHashSet();

        var weeks = Enumerable.Range(0, 8).Select(i =>
        {
            var start = firstWeek.AddDays(7 * i);
            var cohort = people.Where(p => p.CreatedAt >= start && p.CreatedAt < start.AddDays(7)).ToList();
            var weekTwoDone = start.AddDays(7 + 14) <= now;
            return new
            {
                WeekOf = start.ToString("yyyy-MM-dd"),
                SignedUp = cohort.Count,
                LoggedWorkout = cohort.Count(p => starts[p.Id].Any()),
                ThreeInWeekOne = cohort.Count(p => starts[p.Id].Count(t => t >= p.CreatedAt && t < p.CreatedAt.AddDays(7)) >= 3),
                BackInWeekTwo = weekTwoDone
                    ? cohort.Count(p => starts[p.Id].Any(t => t >= p.CreatedAt.AddDays(7) && t < p.CreatedAt.AddDays(14)))
                    : (int?)null,
                PayingNow = cohort.Count(p => payingIds.Contains(p.Id)),
            };
        }).ToList();

        return Results.Ok(new { Weeks = weeks });
    }
}
