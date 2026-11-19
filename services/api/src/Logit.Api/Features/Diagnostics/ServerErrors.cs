using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Diagnostics;

/// Counts server errors (5xx) per UTC day and route for the admin console's Server page.
public static class ServerErrors
{
    /// Days of counts kept; older rows are dropped as new ones are written.
    public const int KeepDays = 60;

    /// The endpoint's route pattern ("POST /sync/sessions"), or "(no route)". After an exception
    /// the handler has cleared the endpoint, so it's read from the exception feature then.
    public static string RouteOf(HttpContext ctx)
    {
        var endpoint = ctx.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>()?.Endpoint ?? ctx.GetEndpoint();
        return endpoint is RouteEndpoint e ? $"{ctx.Request.Method} /{e.RoutePattern.RawText?.TrimStart('/')}" : "(no route)";
    }

    public static async Task RecordAsync(AppDbContext db, DateOnly day, string route)
    {
        if (route.Length > 200) route = route[..200];
        var updated = await db.ServerErrorCounts.Where(c => c.Date == day && c.Route == route)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.Count, c => c.Count + 1));
        if (updated > 0) return;
        try
        {
            db.ServerErrorCounts.Add(new ServerErrorCount { Date = day, Route = route, Count = 1 });
            await db.SaveChangesAsync();
            var oldest = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-KeepDays);
            await db.ServerErrorCounts.Where(c => c.Date < oldest).ExecuteDeleteAsync();
        }
        catch (DbUpdateException)
        {
            // Another request added today's row first: count on top of it.
            db.ChangeTracker.Clear();
            await db.ServerErrorCounts.Where(c => c.Date == day && c.Route == route)
                .ExecuteUpdateAsync(s => s.SetProperty(c => c.Count, c => c.Count + 1));
        }
    }

    /// Records without holding up the response, in its own scope (the request's DbContext may be
    /// the thing that failed). A failure here is logged and dropped: counting must never add errors.
    public static void RecordInBackground(IServiceScopeFactory scopes, ILogger logger, string route)
    {
        var day = DateOnly.FromDateTime(DateTime.UtcNow);
        _ = Task.Run(async () =>
        {
            try
            {
                using var scope = scopes.CreateScope();
                await RecordAsync(scope.ServiceProvider.GetRequiredService<AppDbContext>(), day, route);
            }
            catch (Exception ex)
            {
                logger.LogWarning("Couldn't count a server error: {Reason}", ex.Message);
            }
        });
    }
}
