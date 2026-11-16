using System.Reflection;
using System.Security.Claims;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Sync;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Tests;

/// The app's offline queue keeps one entry per edit, so a push after time offline can carry
/// the same id several times. That used to insert one row per copy, after which every push
/// of that id failed with "An item with the same key has already been added".
public class SyncRepeatedIdTests
{
    [Fact]
    public async Task A_split_sent_twice_in_one_push_is_stored_once_with_the_newest_edit()
    {
        var (conn, db, user) = await NewDb();
        await using var _ = conn;

        await Push("PushSplits", new PushSplitsRequest([
            new SplitDto("split_a", 100, "{\"v\":1}"),
            new SplitDto("split_a", 200, "{\"v\":2}"),
            new SplitDto("split_a", 150, "{\"v\":1.5}"),
        ]), db, user);

        var row = Assert.Single(await db.SyncedSplits.ToListAsync());
        Assert.Equal(200, row.UpdatedAtMs);
        Assert.Equal("{\"v\":2}", row.DataJson);

        // And the next push of that id still works.
        await Push("PushSplits", new PushSplitsRequest([new SplitDto("split_a", 300, "{\"v\":3}")]), db, user);
        Assert.Equal("{\"v\":3}", (await db.SyncedSplits.SingleAsync()).DataJson);
    }

    [Fact]
    public async Task A_split_created_then_deleted_in_one_push_ends_up_deleted()
    {
        var (conn, db, user) = await NewDb();
        await using var _ = conn;

        await Push("PushSplits", new PushSplitsRequest([
            new SplitDto("split_a", 100, "{\"v\":1}"),
            new SplitDto("split_a", 200, null, DeletedAtMs: 200),
        ]), db, user);

        var row = Assert.Single(await db.SyncedSplits.ToListAsync());
        Assert.Equal(200, row.DeletedAtMs);
    }

    [Fact]
    public async Task Repeated_ids_work_for_sessions_and_the_shared_row_handler()
    {
        var (conn, db, user) = await NewDb();
        await using var _ = conn;

        await Push("PushSessions", new PushSessionsRequest([
            new SessionDto("s1", 1, "{\"sets\":1}"),
            new SessionDto("s1", 1, "{\"sets\":2}"),
        ]), db, user);
        Assert.Equal("{\"sets\":2}", (await db.SyncedWorkoutSessions.SingleAsync()).DataJson);

        // Recipes have a unique index already, so this used to fail the whole push.
        await Push("PushRecipes", new PushRecipesRequest([
            new SyncRowDto("r1", 1, 10, "{\"v\":1}"),
            new SyncRowDto("r1", 1, 20, "{\"v\":2}"),
        ]), db, user);
        Assert.Equal("{\"v\":2}", (await db.SyncedRecipes.SingleAsync()).DataJson);
    }

    private static async Task Push(string handler, object request, AppDbContext db, ClaimsPrincipal user)
    {
        var method = typeof(SyncEndpoints).GetMethod(handler, BindingFlags.NonPublic | BindingFlags.Static)!;
        var result = await (Task<IResult>)method.Invoke(null, [request, user, db])!;
        Assert.Equal(StatusCodes.Status204NoContent, ((IStatusCodeHttpResult)result).StatusCode);
        db.ChangeTracker.Clear();
    }

    private static async Task<(SqliteConnection, AppDbContext, ClaimsPrincipal)> NewDb()
    {
        var conn = new SqliteConnection("Data Source=:memory:");
        conn.Open();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(conn).Options);
        await db.Database.EnsureCreatedAsync();
        var user = new User { Username = "u", Email = "u@example.com", DisplayName = "u", PasswordHash = "x" };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        var principal = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, user.Id.ToString())]));
        return (conn, db, principal);
    }
}
