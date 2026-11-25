using System.Globalization;
using System.Security.Claims;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Social;

/// Boards (design canvas G4, G1, B1–B2, P1; journey F6): a group's board and the friends board,
/// scored on showing up, never on weight. The phone sends its week's numbers (PUT /boards/me);
/// a board lists those who are on it this week: members with the group's board and "Show me on
/// boards" on, or friends (mutual follows). Order: share of planned done, then weeks kept; a rest
/// week counts as kept, so it isn't at the bottom.
public static class BoardEndpoints
{
    public static void MapBoardEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPut("/boards/me", Mine).WithTags("Social").RequireAuthorization().RequireRateLimiting("social-write");
        app.MapGet("/boards/friends", Friends).WithTags("Social").RequireAuthorization();
        app.MapGet("/groups/{groupId:guid}/board", Group).WithTags("Social").RequireAuthorization();
    }

    public record WeekRequest(string Week, int Done, int Planned, int WeeksKept, int? VolumePct, bool Rest);
    public record PersonDto(string Username, string DisplayName, string? AvatarUrl, Guid Id);
    public record RowDto(PersonDto User, int Done, int Planned, int WeeksKept, int? VolumePct, bool Rest, bool Me);
    /// MeHidden: you're not on this board (your setting), though you see it.
    public record BoardDto(string Week, List<RowDto> Rows, bool MeHidden);

    private static bool IsMonday(string? week, out DateOnly day) =>
        DateOnly.TryParseExact(week, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out day) && day.DayOfWeek == DayOfWeek.Monday;

    private static async Task<IResult> Mine(WeekRequest req, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        if (!IsMonday(req.Week, out var day)) return Results.BadRequest(new { error = "Week must be a Monday, YYYY-MM-DD." });
        var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
        if (day > today.AddDays(1) || day < today.AddDays(-14)) return Results.BadRequest(new { error = "That isn't this week." });
        if (req.Planned is < 0 or > 14 || req.Done is < 0 or > 50 || req.WeeksKept is < 0 or > 1000 || req.VolumePct is < -100 or > 1000)
            return Results.BadRequest(new { error = "Those numbers don't look right." });
        var me = caller.GetUserId();
        var row = await db.BoardWeeks.FirstOrDefaultAsync(b => b.UserId == me && b.WeekStart == req.Week);
        if (row is null) db.BoardWeeks.Add(row = new BoardWeek { UserId = me, WeekStart = req.Week });
        (row.Done, row.Planned, row.WeeksKept, row.VolumePct, row.Rest, row.UpdatedAt) =
            (req.Done, req.Planned, req.WeeksKept, req.VolumePct, req.Rest, clock.GetUtcNow().UtcDateTime);
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException) { /* sent twice at once */ }
        return Results.NoContent();
    }

    /// The board's order: share of planned done (a rest week counts as all done), then weeks kept,
    /// then who got there first in the alphabet.
    public static List<RowDto> Rank(IEnumerable<RowDto> rows) =>
        [.. rows.OrderByDescending(r => r.Rest ? 1.0 : r.Planned == 0 ? (r.Done > 0 ? 1.0 : 0.0) : Math.Min(1.0, (double)r.Done / r.Planned))
            .ThenByDescending(r => r.WeeksKept).ThenBy(r => r.User.DisplayName)];

    private static async Task<BoardDto> BoardAsync(AppDbContext db, IQueryable<Guid> people, Guid me, string week)
    {
        var rows = await db.BoardWeeks.Where(b => b.WeekStart == week && people.Contains(b.UserId) && b.User.ShowOnBoards)
            .Select(b => new { b.User, b.Done, b.Planned, b.WeeksKept, b.VolumePct, b.Rest }).Take(2000).ToListAsync();
        var meHidden = !rows.Any(r => r.User.Id == me) && !await db.Users.AnyAsync(u => u.Id == me && u.ShowOnBoards);
        return new BoardDto(week, Rank(rows.Select(r => new RowDto(new PersonDto(r.User.Username, r.User.DisplayName, r.User.AvatarUrl, r.User.Id),
            r.Done, r.Planned, r.WeeksKept, r.VolumePct, r.Rest, r.User.Id == me))), meHidden);
    }

    private static async Task<IResult> Group(Guid groupId, string week, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var mine = await db.GroupMembers.FirstOrDefaultAsync(m => m.GroupId == groupId && m.UserId == me);
        if (mine is null) return Results.NotFound();
        if (!IsMonday(week, out _)) return Results.BadRequest(new { error = "Week must be a Monday, YYYY-MM-DD." });
        var people = db.GroupMembers.Where(m => m.GroupId == groupId && m.OnBoard
            && !db.Blocks.Any(b => (b.BlockerId == me && b.BlockedId == m.UserId) || (b.BlockerId == m.UserId && b.BlockedId == me)))
            .Select(m => m.UserId);
        var board = await BoardAsync(db, people, me, week);
        return Results.Ok(mine.OnBoard ? board : board with { MeHidden = true });
    }

    /// You and the people you follow who follow you back (friends), across no block.
    private static async Task<IResult> Friends(string week, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        if (!IsMonday(week, out _)) return Results.BadRequest(new { error = "Week must be a Monday, YYYY-MM-DD." });
        var people = db.Users.Where(u => u.Id == me || (db.Follows.Any(f => f.FollowerId == me && f.FollowedId == u.Id)
                && db.Follows.Any(f => f.FollowerId == u.Id && f.FollowedId == me)
                && !db.Blocks.Any(b => (b.BlockerId == me && b.BlockedId == u.Id) || (b.BlockerId == u.Id && b.BlockedId == me))))
            .Select(u => u.Id);
        return Results.Ok(await BoardAsync(db, people, me, week));
    }
}
