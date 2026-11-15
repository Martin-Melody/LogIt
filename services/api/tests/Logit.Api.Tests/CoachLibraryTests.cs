using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Coach;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Tests;

public class CoachLibraryTests
{
    [Theory]
    [InlineData(null, "strength")]
    [InlineData("", "strength")]
    [InlineData("{\"id\":\"x\",\"name\":\"Squat\"}", "strength")]
    [InlineData("{\"kind\":\"cardio\",\"id\":\"x\"}", "cardio")]
    [InlineData("{\"kind\":\"mobility\",\"id\":\"x\"}", "mobility")]
    [InlineData("{\"kind\":\"yoga\",\"id\":\"x\"}", "strength")]
    [InlineData("{not json", "strength")]
    [InlineData("[1,2]", "strength")]
    public void Kind_comes_from_the_item_json(string? json, string expected)
    {
        Assert.Equal(expected, LibraryKinds.FromDataJson(json));
    }

    [Fact]
    public async Task Clients_get_shared_items_and_items_in_their_programs()
    {
        var (conn, db) = await NewDb();
        await using var _ = conn;
        var coach = NewUser("alex");
        coach.DisplayName = "Alex";
        var niamh = NewUser("niamh");
        var dara = NewUser("dara");
        var stranger = NewUser("stranger");
        db.Users.AddRange(coach, niamh, dara, stranger);
        db.CoachClientRelationships.AddRange(
            new CoachClientRelationship { CoachId = coach.Id, ClientId = niamh.Id, Status = CoachClientStatus.Active },
            new CoachClientRelationship { CoachId = coach.Id, ClientId = dara.Id, Status = CoachClientStatus.Active },
            new CoachClientRelationship { CoachId = coach.Id, ClientId = stranger.Id, Status = CoachClientStatus.Pending });

        db.SyncedExercises.AddRange(
            Item(coach, "landmine", "{\"id\":\"landmine\",\"name\":\"Landmine press\"}", shared: true),
            Item(coach, "goblet", "{\"id\":\"goblet\",\"name\":\"Tempo goblet squat\"}"),
            Item(coach, "named", "{\"id\":\"named\",\"name\":\"Seal Row\"}"),
            Item(coach, "sled", "{\"kind\":\"cardio\",\"id\":\"sled\",\"name\":\"Sled push intervals\"}", kind: LibraryKinds.Cardio),
            Item(coach, "private", "{\"id\":\"private\",\"name\":\"My warm-up pulls\"}"),
            Item(coach, "gone", "{\"id\":\"gone\",\"name\":\"Old one\"}", shared: true, deleted: true));

        // Niamh's program uses the goblet squat by id, a seal row by name only, and the sled by name.
        db.CoachPrograms.Add(new CoachProgram
        {
            ProgramId = "p1",
            CoachId = coach.Id,
            RecipientUserId = niamh.Id,
            DataJson = """
                {"weeks":[{"days":[{"blocks":[
                  {"type":"strength","exerciseId":"goblet","exerciseName":"Tempo goblet squat"},
                  {"type":"strength","exerciseName":"seal row"},
                  {"type":"cardio","activityName":"SLED PUSH INTERVALS"}
                ]}]}]}
                """,
        });
        // A deleted program doesn't count.
        db.CoachPrograms.Add(new CoachProgram
        {
            ProgramId = "p2", CoachId = coach.Id, RecipientUserId = dara.Id, DeletedAtMs = 1,
            DataJson = """{"weeks":[{"days":[{"blocks":[{"type":"strength","exerciseId":"private"}]}]}]}""",
        });
        await db.SaveChangesAsync();

        var forNiamh = await CoachLibrary.SharedWith(db, niamh.Id);
        Assert.Equal(["goblet", "landmine", "named", "sled"], forNiamh.Select(i => i.Id).Order());
        Assert.All(forNiamh, i => Assert.Equal("Alex", i.CoachName));
        Assert.False(forNiamh.Single(i => i.Id == "landmine").ViaProgram);
        Assert.True(forNiamh.Single(i => i.Id == "goblet").ViaProgram);
        Assert.Equal("cardio", forNiamh.Single(i => i.Id == "sled").Kind);

        var forDara = await CoachLibrary.SharedWith(db, dara.Id);
        Assert.Equal(["landmine"], forDara.Select(i => i.Id));

        Assert.Empty(await CoachLibrary.SharedWith(db, stranger.Id));
    }

    [Fact]
    public async Task A_coach_only_switches_their_own_items()
    {
        var (conn, db) = await NewDb();
        await using var _ = conn;
        var coach = NewUser("coach");
        var other = NewUser("other");
        db.Users.AddRange(coach, other);
        db.SyncedExercises.AddRange(
            Item(coach, "a", "{\"id\":\"a\",\"name\":\"A\"}"),
            Item(coach, "b", "{\"id\":\"b\",\"name\":\"B\"}", shared: true),
            Item(other, "a", "{\"id\":\"a\",\"name\":\"A\"}"));
        await db.SaveChangesAsync();

        Assert.Equal(1, await CoachLibrary.SetShared(db, coach.Id, ["a", "b", "missing"], true));
        Assert.Equal(1, await CoachLibrary.SetShared(db, coach.Id, ["b"], false));
        db.ChangeTracker.Clear();

        var rows = await db.SyncedExercises.AsNoTracking().ToListAsync();
        Assert.True(rows.Single(r => r.UserId == coach.Id && r.ClientId == "a").SharedWithClients);
        Assert.False(rows.Single(r => r.UserId == coach.Id && r.ClientId == "b").SharedWithClients);
        Assert.False(rows.Single(r => r.UserId == other.Id).SharedWithClients);
    }

    private static SyncedExercise Item(User owner, string id, string json, bool shared = false, bool deleted = false, string kind = LibraryKinds.Strength) => new()
    {
        ClientId = id,
        UserId = owner.Id,
        DataJson = deleted ? string.Empty : json,
        DeletedAtMs = deleted ? 1 : null,
        Kind = kind,
        SharedWithClients = shared,
    };

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
