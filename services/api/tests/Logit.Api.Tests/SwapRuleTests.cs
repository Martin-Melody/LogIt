using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Coach;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Tests;

public class SwapRuleTests
{
    [Theory]
    [InlineData(null, null, "any")]          // nothing set: swap freely, like before rules
    [InlineData(null, "muscles", "muscles")] // the coach's default
    [InlineData("list", "muscles", "list")]  // this client set differently
    [InlineData("any", "list", "any")]       // "any" on a client overrides a stricter default
    public void Effective_rule(string? clientRule, string? coachDefault, string expected)
    {
        var coach = new User { CoachSwapRule = coachDefault };
        var rel = new CoachClientRelationship { SwapRule = clientRule };
        Assert.Equal(expected, SwapRules.Effective(rel, coach));
    }

    [Theory]
    [InlineData("any", true)]
    [InlineData("muscles", true)]
    [InlineData("list", true)]
    [InlineData("none", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void Valid_rules(string? rule, bool valid) => Assert.Equal(valid, SwapRules.IsValid(rule));

    [Fact]
    public async Task Rules_and_a_review_reply_are_stored()
    {
        var conn = new SqliteConnection("Data Source=:memory:");
        conn.Open();
        await using var _ = conn;
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(conn).Options);
        await db.Database.EnsureCreatedAsync();

        var coach = new User { Username = "coach", Email = "c@example.com", DisplayName = "c", PasswordHash = "x", CoachSwapRule = "muscles" };
        var client = new User { Username = "client", Email = "k@example.com", DisplayName = "k", PasswordHash = "x" };
        db.Users.AddRange(coach, client);
        db.CoachClientRelationships.Add(new CoachClientRelationship
        {
            CoachId = coach.Id, ClientId = client.Id, Status = CoachClientStatus.Active, SwapRule = "list",
        });
        db.CheckinReviews.Add(new CheckinReview
        {
            CoachId = coach.Id, ClientUserId = client.Id, SubmissionId = "sub_1", ReviewedAtMs = 1, Reply = "Solid week.",
        });
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        var rel = await db.CoachClientRelationships.Include(r => r.Coach).SingleAsync();
        Assert.Equal("list", rel.SwapRule);
        Assert.Equal("muscles", rel.Coach.CoachSwapRule);
        Assert.Equal("Solid week.", (await db.CheckinReviews.SingleAsync()).Reply);
    }
}
