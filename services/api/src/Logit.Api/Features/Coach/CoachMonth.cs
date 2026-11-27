using System.Globalization;
using System.Security.Claims;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Coach;

/// Your month (canvas W5): what was paid to you through LogIt over the last six months, your
/// clients and spots, and who asked to be coached. Sample clients never count (canvas V4: Practice
/// view shows its own example). Clients' wins and Worth a look are worked out on the device from
/// what each client shares.
public static class CoachMonth
{
    public static void MapCoachMonth(this IEndpointRouteBuilder app)
    {
        app.MapGroup("/coach/month").WithTags("Coach").RequireAuthorization().MapGet("", Get).RequireCoaching();
    }

    private static async Task<IResult> Get(string? month, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var now = DateTime.UtcNow;
        var start = month is not null && DateTime.TryParseExact(month + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var m)
            ? new DateTime(m.Year, m.Month, 1, 0, 0, 0, DateTimeKind.Utc)
            : new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        if (start > now) return Results.BadRequest(new { error = "That month hasn't happened yet." });
        var end = start.AddMonths(1);
        var first = start.AddMonths(-5);

        // Paid to you: receipts (refunds are negative ones) by month, in the currency most was paid in.
        var receipts = await db.CoachPaymentReceipts.AsNoTracking()
            .Where(r => r.CoachId == me && r.PaidAt >= first && r.PaidAt < end)
            .Select(r => new { r.AmountCents, r.Currency, r.PaidAt }).ToListAsync();
        var currency = receipts.GroupBy(r => r.Currency).OrderByDescending(g => g.Sum(r => r.AmountCents)).Select(g => g.Key).FirstOrDefault() ?? "eur";
        var months = Enumerable.Range(0, 6).Select(i => first.AddMonths(i)).Select(s => new
        {
            month = s.ToString("yyyy-MM"),
            cents = receipts.Where(r => r.Currency == currency && r.PaidAt >= s && r.PaidAt < s.AddMonths(1)).Sum(r => r.AmountCents),
        }).ToList();
        // "Best month yet" compares with every month before, not only the six shown.
        var bestBefore = (await db.CoachPaymentReceipts.AsNoTracking()
            .Where(r => r.CoachId == me && r.Currency == currency && r.PaidAt < start)
            .Select(r => new { r.AmountCents, r.PaidAt }).ToListAsync())
            .GroupBy(r => new { r.PaidAt.Year, r.PaidAt.Month }).Select(g => g.Sum(r => r.AmountCents)).DefaultIfEmpty(0).Max();

        var rels = await db.CoachClientRelationships.AsNoTracking().Include(r => r.Client).Include(r => r.Payment)
            .Where(r => r.CoachId == me && !r.Client.IsSample).ToListAsync();
        static DateTime Joined(CoachClientRelationship r) => r.AgreedAt ?? r.CreatedAt;
        bool Active(CoachClientRelationship r) => r.Status is CoachClientStatus.Active or CoachClientStatus.Paused;
        var active = rels.Where(Active).ToList();
        var ended = rels.Where(r => r.Status == CoachClientStatus.Revoked && r.RequestStage is not (RequestStages.NotAFit or RequestStages.Withdrawn)).ToList();
        var asked = rels.Where(r => r.RequestedByClient && r.CreatedAt >= start && r.CreatedAt < end).ToList();
        var longest = active.OrderBy(Joined).FirstOrDefault();
        var spots = await db.Users.Where(u => u.Id == me).Select(u => u.CoachSpots).FirstOrDefaultAsync();

        return Results.Ok(new
        {
            month = start.ToString("yyyy-MM"),
            currency,
            income = months,
            bestBeforeCents = bestBefore,
            paidElsewhere = active.Count(r => r.Payment?.Mode == PaymentModes.Elsewhere),
            clients = new
            {
                count = active.Count,
                spots,
                joined = active.Count(r => Joined(r) >= start && Joined(r) < end),
                left = ended.Count(r => r.UpdatedAt >= start && r.UpdatedAt < end),
            },
            asked = new
            {
                count = asked.Count,
                joined = asked.Count(Active),
                waiting = asked.Count(r => r.Status == CoachClientStatus.Pending && r.RequestStage == RequestStages.Waiting),
                notAFit = asked.Count(r => r.RequestStage == RequestStages.NotAFit),
            },
            longest = longest is null ? null : new { name = string.IsNullOrEmpty(longest.Client.DisplayName) ? longest.Client.Username : longest.Client.DisplayName, sinceMs = new DateTimeOffset(Joined(longest), TimeSpan.Zero).ToUnixTimeMilliseconds() },
        });
    }
}
