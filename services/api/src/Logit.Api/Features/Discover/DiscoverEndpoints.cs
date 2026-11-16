using System.Security.Claims;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Discover;

public static class DiscoverEndpoints
{
    public static void MapDiscoverEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/discover").WithTags("Discover").RequireAuthorization();
        g.MapGet("/posts", GetPosts);
        g.MapGet("/people", GetPeople);
        g.MapGet("/not-interested", GetNotInterested);
        g.MapPost("/not-interested/{username}", NotInterested);
        g.MapDelete("/not-interested/{username}", Undo);
    }

    /// { items: [{ post, reason, recipe }], nextCursor, arm }
    private static async Task<IResult> GetPosts(
        ClaimsPrincipal caller, DiscoverService discover,
        [FromQuery] int limit = 20, [FromQuery] string? cursor = null)
    {
        var userId = caller.GetUserId();
        var (items, next, arm) = await discover.PostsAsync(userId, Math.Clamp(limit, 1, 50), cursor);
        return Results.Ok(new
        {
            items = items.Select(i => new { post = i.Post.ToDto(userId), i.Reason, i.Recipe }),
            nextCursor = next,
            arm,
        });
    }

    /// { people: [{ user, reason, recipe }], hidden, arm }. `hidden`: the caller closed "People
    /// you might know"; the list is then empty.
    private static async Task<IResult> GetPeople(
        ClaimsPrincipal caller, DiscoverService discover, AppDbContext db, [FromQuery] int limit = 8)
    {
        var userId = caller.GetUserId();
        var me = await db.Users.FindAsync(userId);
        if (me is null) return Results.NotFound();
        if (me.HidePeopleSuggestions)
            return Results.Ok(new { people = Array.Empty<object>(), hidden = true, arm = (string?)null });

        var (items, arm) = await discover.PeopleAsync(userId, Math.Clamp(limit, 1, 30));
        return Results.Ok(new
        {
            people = items.Select(i => new { user = i.User.ToProfileDto(false, i.FollowerCount), i.Reason, i.Recipe }),
            hidden = false,
            arm,
        });
    }

    private static async Task<IResult> GetNotInterested(ClaimsPrincipal caller, AppDbContext db)
    {
        var userId = caller.GetUserId();
        var rows = await db.DiscoverDismissals
            .Include(d => d.HiddenUser)
            .Where(d => d.UserId == userId)
            .OrderByDescending(d => d.CreatedAt)
            .ToListAsync();
        return Results.Ok(rows.Select(d => new { user = d.HiddenUser.ToProfileDto(false), d.CreatedAt }));
    }

    private static async Task<IResult> NotInterested(string username, ClaimsPrincipal caller, AppDbContext db)
    {
        var userId = caller.GetUserId();
        var target = await db.Users.FirstOrDefaultAsync(u => u.Username == username.ToLowerInvariant() && !u.IsSample);
        if (target is null) return Results.NotFound();
        if (target.Id == userId) return Results.BadRequest(new { error = "That's you." });
        if (!await db.DiscoverDismissals.AnyAsync(d => d.UserId == userId && d.HiddenUserId == target.Id))
        {
            db.DiscoverDismissals.Add(new DiscoverDismissal { UserId = userId, HiddenUserId = target.Id });
            await db.SaveChangesAsync();
        }
        return Results.NoContent();
    }

    private static async Task<IResult> Undo(string username, ClaimsPrincipal caller, AppDbContext db)
    {
        var userId = caller.GetUserId();
        var row = await db.DiscoverDismissals
            .FirstOrDefaultAsync(d => d.UserId == userId && d.HiddenUser.Username == username.ToLowerInvariant());
        if (row is null) return Results.NotFound();
        db.DiscoverDismissals.Remove(row);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }
}
