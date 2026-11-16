namespace Logit.Api.Features.Coach.Payments;

/// Once an hour: one-off packages that ran out, and the coach's rule (pause or end coaching N
/// days after a client stopped being paid up). See CoachPaymentService.SweepAsync.
public class CoachPaymentSweeper(IServiceScopeFactory scopes, ILogger<CoachPaymentSweeper> log, TimeProvider clock) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Let start-up (migrations) finish first.
        try { await Task.Delay(TimeSpan.FromMinutes(2), clock, stoppingToken); }
        catch (OperationCanceledException) { return; }

        using var timer = new PeriodicTimer(TimeSpan.FromHours(1), clock);
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                var payments = scope.ServiceProvider.GetRequiredService<CoachPaymentService>();
                await payments.SweepAsync(clock.GetUtcNow().UtcDateTime, stoppingToken);
            }
            catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
            {
                log.LogError(ex, "Coach payment sweep failed");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
