using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Coach;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Tests;

public class InsightChartTests
{
    [Theory]
    [InlineData("""{"showOn":{"coach":true}}""", true)]
    [InlineData("""{"showOn":{"coach":false,"overview":true}}""", false)]
    [InlineData("""{"showOn":{"coach":"true"}}""", false)]
    [InlineData("""{"name":"x"}""", false)]
    [InlineData("[1,2]", false)]
    [InlineData("not json", false)]
    [InlineData("", false)]
    public void Shown_to_coach_only_when_ticked(string json, bool expected)
        => Assert.Equal(expected, InsightChartEndpoints.ShownToCoach(json));

    [Fact]
    public async Task Charts_are_stored_per_user_and_go_with_the_account()
    {
        var conn = new SqliteConnection("Data Source=:memory:");
        conn.Open();
        await using var _ = conn;
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(conn).Options);
        await db.Database.EnsureCreatedAsync();

        var coach = new User { Username = "coach", Email = "c@example.com", DisplayName = "c", PasswordHash = "x" };
        var client = new User { Username = "client", Email = "k@example.com", DisplayName = "k", PasswordHash = "x" };
        db.Users.AddRange(coach, client);
        db.SyncedInsightCharts.AddRange(
            new SyncedInsightChart { ClientId = "chart_1", UserId = client.Id, DataJson = "{}", CreatedAtMs = 1, UpdatedAtMs = 1 },
            new SyncedInsightChart { ClientId = "chart_2", UserId = client.Id, DataJson = "{}", CreatedAtMs = 2, UpdatedAtMs = 2, SentByUserId = coach.Id });
        await db.SaveChangesAsync();

        // The same chart id twice for one user is refused.
        db.SyncedInsightCharts.Add(new SyncedInsightChart { ClientId = "chart_1", UserId = client.Id, DataJson = "{}" });
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        db.ChangeTracker.Clear();

        // Deleting the coach leaves the client's charts alone; deleting the client takes them.
        db.Users.Remove(await db.Users.SingleAsync(u => u.Id == coach.Id));
        await db.SaveChangesAsync();
        Assert.Equal(2, await db.SyncedInsightCharts.CountAsync());
        db.Users.Remove(await db.Users.SingleAsync(u => u.Id == client.Id));
        await db.SaveChangesAsync();
        Assert.Equal(0, await db.SyncedInsightCharts.CountAsync());
    }
}
