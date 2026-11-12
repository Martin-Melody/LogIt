using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Diagnostics;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Logit.Api.Tests;

public class DiagnosticsTests
{
    [Theory]
    [InlineData("3f9a0c1b22de", true)]
    [InlineData("abc-DEF_123", true)]
    [InlineData("", false)]
    [InlineData(null, false)]
    [InlineData("has space", false)]
    [InlineData("new\nline", false)]
    [InlineData("<script>", false)]
    public void Only_short_plain_request_ids_are_taken_from_the_client(string? id, bool valid)
    {
        Assert.Equal(valid, RequestLogging.IsValidRequestId(id));
    }

    [Fact]
    public void Overlong_request_ids_are_refused()
    {
        Assert.True(RequestLogging.IsValidRequestId(new string('a', 64)));
        Assert.False(RequestLogging.IsValidRequestId(new string('a', 65)));
    }

    [Fact]
    public void Generated_request_ids_are_valid()
    {
        Assert.True(RequestLogging.IsValidRequestId(RequestLogging.NewRequestId()));
    }

    [Theory]
    [InlineData(200, LogLevel.Information)]
    [InlineData(204, LogLevel.Information)]
    [InlineData(401, LogLevel.Information)]
    [InlineData(404, LogLevel.Information)]
    [InlineData(400, LogLevel.Warning)]
    [InlineData(403, LogLevel.Warning)]
    [InlineData(429, LogLevel.Warning)]
    [InlineData(500, LogLevel.Error)]
    [InlineData(503, LogLevel.Error)]
    public void Request_log_level_follows_the_status(int status, LogLevel expected)
    {
        Assert.Equal(expected, RequestLogging.LevelFor(status));
    }

    [Fact]
    public async Task Pruning_deletes_only_reports_past_the_retention_period()
    {
        using var conn = new SqliteConnection("Data Source=:memory:");
        conn.Open();
        var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(conn).Options;
        await using var db = new AppDbContext(options);
        await db.Database.EnsureCreatedAsync();

        var user = new User { Username = "u", Email = "u@example.com", DisplayName = "U" };
        db.Users.Add(user);
        var now = new DateTime(2026, 11, 12, 12, 0, 0, DateTimeKind.Utc);
        DiagnosticReport Report(int daysAgo) => new() { UserId = user.Id, CreatedAt = now.AddDays(-daysAgo), Log = "x" };
        db.DiagnosticReports.AddRange(Report(0), Report(29), Report(31), Report(90));
        await db.SaveChangesAsync();

        var deleted = await DiagnosticsEndpoints.PruneAsync(db, now);

        Assert.Equal(2, deleted);
        var left = await db.DiagnosticReports.Select(r => r.CreatedAt).ToListAsync();
        Assert.All(left, t => Assert.True(t >= now.AddDays(-DiagnosticsEndpoints.RetentionDays)));
    }

    [Fact]
    public async Task Reports_go_with_the_account()
    {
        using var conn = new SqliteConnection("Data Source=:memory:");
        conn.Open();
        var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(conn).Options;
        await using var db = new AppDbContext(options);
        await db.Database.EnsureCreatedAsync();

        var user = new User { Username = "u", Email = "u@example.com", DisplayName = "U" };
        db.Users.Add(user);
        db.DiagnosticReports.Add(new DiagnosticReport { UserId = user.Id, Log = "x" });
        await db.SaveChangesAsync();

        db.Users.Remove(user);
        await db.SaveChangesAsync();

        Assert.Equal(0, await db.DiagnosticReports.CountAsync());
    }
}
