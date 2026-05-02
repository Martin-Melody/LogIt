using System.Security.Claims;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Social;

public static class SocialEndpoints
{
    public static void MapSocialEndpoints(this IEndpointRouteBuilder app)
    {
        var follows = app.MapGroup("/users").WithTags("Social");
        follows.MapPost("/{username}/follow", Follow).RequireAuthorization();
        follows.MapDelete("/{username}/follow", Unfollow).RequireAuthorization();
        follows.MapGet("/{username}/followers", GetFollowers);
        follows.MapGet("/{username}/following", GetFollowing);

        var posts = app.MapGroup("/posts").WithTags("Posts");
        posts.MapGet("/feed", GetFeed).RequireAuthorization();
        posts.MapPost("/", CreatePost).RequireAuthorization();
        posts.MapDelete("/{id:guid}", DeletePost).RequireAuthorization();
    }

    private static async Task<IResult> Follow(string username, ClaimsPrincipal caller, AppDbContext db)
    {
        var followerId = caller.GetUserId();
        var target = await db.Users.FirstOrDefaultAsync(u => u.Username == username.ToLowerInvariant());
        if (target is null) return Results.NotFound();
        if (target.Id == followerId) return Results.BadRequest(new { error = "Cannot follow yourself." });

        var exists = await db.Follows.AnyAsync(f => f.FollowerId == followerId && f.FollowedId == target.Id);
        if (exists) return Results.Conflict(new { error = "Already following." });

        db.Follows.Add(new Follow { FollowerId = followerId, FollowedId = target.Id });
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> Unfollow(string username, ClaimsPrincipal caller, AppDbContext db)
    {
        var followerId = caller.GetUserId();
        var follow = await db.Follows
            .Include(f => f.Followed)
            .FirstOrDefaultAsync(f => f.FollowerId == followerId && f.Followed.Username == username.ToLowerInvariant());

        if (follow is null) return Results.NotFound();
        db.Follows.Remove(follow);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> GetFollowers(string username, AppDbContext db)
    {
        var followers = await db.Follows
            .Where(f => f.Followed.Username == username.ToLowerInvariant())
            .Select(f => f.Follower.ToProfileDto(false))
            .ToListAsync();
        return Results.Ok(followers);
    }

    private static async Task<IResult> GetFollowing(string username, AppDbContext db)
    {
        var following = await db.Follows
            .Where(f => f.Follower.Username == username.ToLowerInvariant())
            .Select(f => f.Followed.ToProfileDto(false))
            .ToListAsync();
        return Results.Ok(following);
    }

    private static async Task<IResult> GetFeed(
        ClaimsPrincipal caller,
        AppDbContext db,
        [FromQuery] int limit = 20,
        [FromQuery] DateTime? before = null)
    {
        var userId = caller.GetUserId();
        var followedIds = await db.Follows
            .Where(f => f.FollowerId == userId)
            .Select(f => f.FollowedId)
            .ToListAsync();

        followedIds.Add(userId); // include own posts in feed

        var query = db.Posts
            .Include(p => p.Author)
            .Where(p => followedIds.Contains(p.AuthorId) && p.DeletedAt == null);

        if (before.HasValue)
            query = query.Where(p => p.CreatedAt < before.Value);

        var posts = await query
            .OrderByDescending(p => p.CreatedAt)
            .Take(Math.Min(limit, 50))
            .Select(p => p.ToDto())
            .ToListAsync();

        return Results.Ok(posts);
    }

    private static async Task<IResult> CreatePost(
        [FromBody] CreatePostRequest req,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var post = new Post
        {
            AuthorId = caller.GetUserId(),
            Type = req.Type,
            Body = req.Body?.Trim(),
            PayloadJson = req.PayloadJson,
        };

        db.Posts.Add(post);
        await db.SaveChangesAsync();

        await db.Entry(post).Reference(p => p.Author).LoadAsync();
        return Results.Created($"/posts/{post.Id}", post.ToDto());
    }

    private static async Task<IResult> DeletePost(Guid id, ClaimsPrincipal caller, AppDbContext db)
    {
        var post = await db.Posts.FindAsync(id);
        if (post is null || post.DeletedAt is not null) return Results.NotFound();
        if (post.AuthorId != caller.GetUserId()) return Results.Forbid();

        post.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Results.NoContent();
    }
}

public record CreatePostRequest(PostType Type, string? Body, string? PayloadJson);
