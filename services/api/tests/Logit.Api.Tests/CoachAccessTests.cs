using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Coach;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Tests;

public class CoachAccessTests
{
    private static readonly DateTime Now = new(2026, 11, 14, 12, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Each_switch_controls_its_own_area()
    {
        var r = new CoachClientRelationship();
        r.ApplySharing(new SharingDto(Workouts: true, Nutrition: false, Bodyweight: true, Habits: false, Checkins: true));

        Assert.True(r.Shares(ShareArea.Workouts));
        Assert.False(r.Shares(ShareArea.Nutrition));
        Assert.True(r.Shares(ShareArea.Bodyweight));
        Assert.False(r.Shares(ShareArea.Habits));
        Assert.True(r.Shares(ShareArea.Checkins));
        Assert.Equal(new SharingDto(true, false, true, false, true), r.ToSharingDto());
    }

    [Fact]
    public void New_relationships_share_everything()
    {
        Assert.Equal(SharingDto.All, new CoachClientRelationship().ToSharingDto());
    }

    [Fact]
    public async Task A_switched_off_area_is_stored_as_off()
    {
        // Guards against a database default of true overriding an explicit false on insert.
        var (conn, db) = await NewDb();
        await using var _ = conn;
        var coach = NewUser("coach");
        var client = NewUser("client");
        db.Users.AddRange(coach, client);
        var rel = new CoachClientRelationship { CoachId = coach.Id, ClientId = client.Id, Status = CoachClientStatus.Active };
        rel.ApplySharing(new SharingDto(true, false, false, false, false));
        db.CoachClientRelationships.Add(rel);
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        var stored = await CoachAccess.ActiveRelationship(db, coach.Id, client.Id);
        Assert.NotNull(stored);
        Assert.Equal(new SharingDto(true, false, false, false, false), stored.ToSharingDto());
    }

    [Fact]
    public async Task Only_an_active_relationship_with_this_coach_counts()
    {
        var (conn, db) = await NewDb();
        await using var _ = conn;
        var coach = NewUser("coach");
        var other = NewUser("other");
        var client = NewUser("client");
        db.Users.AddRange(coach, other, client);
        db.CoachClientRelationships.Add(new CoachClientRelationship { CoachId = coach.Id, ClientId = client.Id, Status = CoachClientStatus.Pending });
        db.CoachClientRelationships.Add(new CoachClientRelationship { CoachId = other.Id, ClientId = client.Id, Status = CoachClientStatus.Active });
        await db.SaveChangesAsync();

        Assert.Null(await CoachAccess.ActiveRelationship(db, coach.Id, client.Id));
        Assert.NotNull(await CoachAccess.ActiveRelationship(db, other.Id, client.Id));
    }

    [Theory]
    [InlineData(false, null, null, 0, "active")]
    [InlineData(true, null, null, 0, "off")]
    [InlineData(false, -1, null, 0, "expired")]
    [InlineData(false, 1, 3, 2, "active")]
    [InlineData(false, 1, 3, 3, "full")]
    [InlineData(true, -1, 3, 3, "off")] // turned off wins
    public void Link_state(bool off, int? expiresInDays, int? maxUses, int used, string expected)
    {
        var link = new CoachInviteLink
        {
            RevokedAt = off ? Now.AddDays(-1) : null,
            ExpiresAt = expiresInDays is { } d ? Now.AddDays(d) : null,
            MaxUses = maxUses,
        };
        Assert.Equal(expected, CoachLinkEndpoints.LinkState(link, used, Now));
    }

    [Theory]
    [InlineData("""{"scheduleId":"ckin_1","submittedAtMs":1700000000000}""", "ckin_1", 1700000000000L)]
    [InlineData("""{"scheduleId":"ckin_1"}""", "ckin_1", null)]           // a draft
    [InlineData("""{"submittedAtMs":5}""", null, 5L)]
    [InlineData("not json", null, null)]
    public void Reads_schedule_and_submitted_time(string json, string? scheduleId, long? submitted)
    {
        Assert.Equal((scheduleId, submitted), CheckinReviewEndpoints.ReadSubmission(json));
    }

    private static User NewUser(string name) => new()
    {
        Username = name,
        Email = $"{name}@example.com",
        DisplayName = name,
        PasswordHash = "x",
    };

    private static async Task<(SqliteConnection, AppDbContext)> NewDb()
    {
        var conn = new SqliteConnection("Data Source=:memory:");
        conn.Open();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(conn).Options);
        await db.Database.EnsureCreatedAsync();
        return (conn, db);
    }
}
