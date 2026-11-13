using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Auth;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Logit.Api.Tests;

public class RegistrationTests
{
    private static readonly DateTime Now = new(2026, 11, 13, 12, 0, 0, DateTimeKind.Utc);

    private static IConfiguration Config(string? mode) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(mode is null ? [] : [new("Registration:Mode", mode)])
            .Build();

    [Theory]
    [InlineData(null, RegistrationMode.Open)]
    [InlineData("open", RegistrationMode.Open)]
    [InlineData("invite", RegistrationMode.Invite)]
    [InlineData(" Invite ", RegistrationMode.Invite)]
    [InlineData("something-else", RegistrationMode.Open)]
    public void Mode_comes_from_config_and_defaults_to_open(string? value, RegistrationMode expected)
    {
        Assert.Equal(expected, Registration.GetMode(Config(value)));
    }

    [Fact]
    public void New_codes_are_8_unambiguous_characters()
    {
        for (var i = 0; i < 200; i++)
        {
            var code = Registration.NewCode();
            Assert.Equal(Registration.CodeLength, code.Length);
            Assert.DoesNotContain(code, c => c is 'I' or 'L' or 'O' or 'U');
            Assert.Equal(code, Registration.Normalize(code));
        }
    }

    [Theory]
    [InlineData("K7M2-Q9XH", "K7M2Q9XH")]
    [InlineData("k7m2 q9xh", "K7M2Q9XH")]
    [InlineData("  K7M2Q9XH ", "K7M2Q9XH")]
    [InlineData("O0IL-1234", "00111234")] // look-alikes read as the digits
    [InlineData("K7M2-Q9X", null)]        // too short
    [InlineData("K7M2-Q9XHH", null)]      // too long
    [InlineData("K7M2-Q9X!", null)]
    [InlineData("K7M2-Q9XU", null)]       // U isn't in the alphabet
    [InlineData("", null)]
    [InlineData(null, null)]
    public void Typed_codes_are_normalised(string? typed, string? expected)
    {
        Assert.Equal(expected, Registration.Normalize(typed));
    }

    [Fact]
    public void Codes_are_shown_with_a_dash()
    {
        Assert.Equal("K7M2-Q9XH", Registration.Format("K7M2Q9XH"));
    }

    private static async Task<(SqliteConnection, AppDbContext)> NewDb()
    {
        var conn = new SqliteConnection("Data Source=:memory:");
        conn.Open();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(conn).Options);
        await db.Database.EnsureCreatedAsync();
        return (conn, db);
    }

    [Fact]
    public async Task A_single_use_invite_works_once()
    {
        var (conn, db) = await NewDb();
        using var _ = conn;
        await using var __ = db;
        db.Invites.Add(new Invite { Code = "K7M2Q9XH" });
        await db.SaveChangesAsync();

        Assert.NotNull(await Registration.TryClaimAsync(db, "k7m2-q9xh", Now));
        Assert.Null(await Registration.TryClaimAsync(db, "K7M2-Q9XH", Now));
    }

    [Fact]
    public async Task A_multi_use_invite_stops_at_its_limit()
    {
        var (conn, db) = await NewDb();
        using var _ = conn;
        await using var __ = db;
        db.Invites.Add(new Invite { Code = "AAAA2222", MaxUses = 3 });
        await db.SaveChangesAsync();

        for (var i = 0; i < 3; i++) Assert.NotNull(await Registration.TryClaimAsync(db, "AAAA2222", Now));
        Assert.Null(await Registration.TryClaimAsync(db, "AAAA2222", Now));
        Assert.Equal(3, (await db.Invites.AsNoTracking().SingleAsync()).UseCount);
    }

    [Fact]
    public async Task Expired_revoked_and_unknown_codes_are_refused()
    {
        var (conn, db) = await NewDb();
        using var _ = conn;
        await using var __ = db;
        db.Invites.AddRange(
            new Invite { Code = "EXP11111", ExpiresAt = Now.AddMinutes(-1) },
            new Invite { Code = "REV22222", RevokedAt = Now.AddDays(-1) },
            new Invite { Code = "0K333333", ExpiresAt = Now.AddDays(1) });
        await db.SaveChangesAsync();

        Assert.Null(await Registration.TryClaimAsync(db, "EXP11111", Now));
        Assert.Null(await Registration.TryClaimAsync(db, "REV22222", Now));
        Assert.Null(await Registration.TryClaimAsync(db, "NOPE4444", Now));
        Assert.NotNull(await Registration.TryClaimAsync(db, "0K333333", Now));
    }

    [Fact]
    public async Task Releasing_gives_a_use_back()
    {
        var (conn, db) = await NewDb();
        using var _ = conn;
        await using var __ = db;
        var invite = new Invite { Code = "BBBB3333" };
        db.Invites.Add(invite);
        await db.SaveChangesAsync();

        var id = await Registration.TryClaimAsync(db, "BBBB3333", Now);
        await Registration.ReleaseAsync(db, id!.Value);
        Assert.NotNull(await Registration.TryClaimAsync(db, "BBBB3333", Now));
    }

    [Fact]
    public void Status_reads_revoked_then_expired_then_used()
    {
        Assert.Equal("active", Registration.Status(new Invite { MaxUses = 2, UseCount = 1 }, Now));
        Assert.Equal("used", Registration.Status(new Invite { MaxUses = 1, UseCount = 1 }, Now));
        Assert.Equal("expired", Registration.Status(new Invite { ExpiresAt = Now, UseCount = 1 }, Now));
        Assert.Equal("revoked", Registration.Status(new Invite { RevokedAt = Now, ExpiresAt = Now }, Now));
    }

    [Fact]
    public async Task Deleting_an_invite_keeps_the_accounts_made_with_it()
    {
        var (conn, db) = await NewDb();
        using var _ = conn;
        await using var __ = db;
        var invite = new Invite { Code = "CCCC4444" };
        db.Invites.Add(invite);
        db.Users.Add(new User { Username = "sam", Email = "sam@example.com", DisplayName = "Sam", Invite = invite });
        await db.SaveChangesAsync();

        db.Invites.Remove(invite);
        await db.SaveChangesAsync();

        var user = await db.Users.AsNoTracking().SingleAsync();
        Assert.Null(user.InviteId);
    }
}
