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
        follows.MapPost("/{username}/follow", Follow).RequireAuthorization().RequireRateLimiting("social-write");
        follows.MapDelete("/{username}/follow", Unfollow).RequireAuthorization();
        follows.MapGet("/{username}/followers", GetFollowers);
        follows.MapGet("/{username}/following", GetFollowing);

        var posts = app.MapGroup("/posts").WithTags("Posts");
        posts.MapGet("/feed", GetFeed).RequireAuthorization();
        posts.MapGet("/{id:guid}", GetPost).RequireAuthorization();
        posts.MapPost("/", CreatePost).RequireAuthorization().RequireRateLimiting("social-write");
        posts.MapDelete("/{id:guid}", DeletePost).RequireAuthorization();
        posts.MapPatch("/{id:guid}", EditPost).RequireAuthorization();
        posts.MapPost("/{id:guid}/like", LikePost).RequireAuthorization();
        posts.MapDelete("/{id:guid}/like", UnlikePost).RequireAuthorization();
        posts.MapGet("/{id:guid}/comments", GetComments);
        posts.MapPost("/{id:guid}/comments", AddComment).RequireAuthorization().RequireRateLimiting("social-write");
        posts.MapPatch("/{id:guid}/comments/{commentId:guid}", EditComment).RequireAuthorization();
        posts.MapDelete("/{id:guid}/comments/{commentId:guid}", DeleteComment).RequireAuthorization();

        follows.MapGet("/{username}/posts", GetUserPosts);
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
        db.AddFollow(followerId, target.Id);
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
        var follows = await db.Follows
            .Include(f => f.Follower)
            .Where(f => f.Followed.Username == username.ToLowerInvariant())
            .ToListAsync();
        return Results.Ok(follows.Select(f => f.Follower.ToProfileDto(false)));
    }

    private static async Task<IResult> GetFollowing(string username, AppDbContext db)
    {
        var follows = await db.Follows
            .Include(f => f.Followed)
            .Where(f => f.Follower.Username == username.ToLowerInvariant())
            .ToListAsync();
        return Results.Ok(follows.Select(f => f.Followed.ToProfileDto(false)));
    }

    private static async Task<IResult> GetUserPosts(
        string username,
        AppDbContext db,
        ClaimsPrincipal caller,
        [FromQuery] int limit = 20,
        [FromQuery] string? cursor = null)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Username == username.ToLowerInvariant());
        if (user is null) return Results.NotFound();

        Guid? callerId = caller.Identity?.IsAuthenticated == true ? caller.GetUserId() : null;
        if (callerId is not null && await db.Blocks.AnyAsync(b =>
                (b.BlockerId == callerId && b.BlockedId == user.Id) ||
                (b.BlockerId == user.Id && b.BlockedId == callerId)))
            return Results.NotFound();

        limit = Math.Clamp(limit, 1, 50);
        var before = SocialQueryHelpers.DecodeCursor(cursor);

        var query = db.Posts
            .Include(p => p.Author)
            .Include(p => p.Likes)
            .Include(p => p.Comments)
            .Where(p => p.AuthorId == user.Id && p.DeletedAt == null);

        if (before is not null)
            query = query.Where(p => p.CreatedAt < before);

        return Results.Ok(await PageAsync(query, limit, callerId));
    }

    private static async Task<IResult> LikePost(Guid id, ClaimsPrincipal caller, AppDbContext db)
    {
        var userId = caller.GetUserId();
        var post = await db.Posts.FindAsync(id);
        if (post is null || post.DeletedAt is not null) return Results.NotFound();

        var exists = await db.Likes.AnyAsync(l => l.UserId == userId && l.PostId == id);
        if (exists) return Results.Conflict(new { error = "Already liked." });

        db.Likes.Add(new Like { UserId = userId, PostId = id });
        await db.AddLikeAsync(userId, post);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> UnlikePost(Guid id, ClaimsPrincipal caller, AppDbContext db)
    {
        var userId = caller.GetUserId();
        var like = await db.Likes.FindAsync(userId, id);
        if (like is null) return Results.NotFound();

        db.Likes.Remove(like);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> GetFeed(
        ClaimsPrincipal caller,
        AppDbContext db,
        [FromQuery] int limit = 20,
        [FromQuery] string? cursor = null)
    {
        var userId = caller.GetUserId();
        limit = Math.Clamp(limit, 1, 50);
        var before = SocialQueryHelpers.DecodeCursor(cursor);

        var followedIds = await db.Follows
            .Where(f => f.FollowerId == userId)
            .Select(f => f.FollowedId)
            .ToListAsync();
        followedIds.Add(userId); // include own posts in feed

        var blocked = await db.BlockedUserIdsAsync(userId);

        var query = db.Posts
            .Include(p => p.Author)
            .Include(p => p.Likes)
            .Include(p => p.Comments)
            .Where(p => followedIds.Contains(p.AuthorId) && !blocked.Contains(p.AuthorId) && p.DeletedAt == null);

        if (before is not null)
            query = query.Where(p => p.CreatedAt < before);

        return Results.Ok(await PageAsync(query, limit, userId));
    }

    /// Shared: order newest-first, take limit+1 to detect a next page, project to
    /// DTOs, and hand back an opaque cursor.
    private static async Task<object> PageAsync(IQueryable<Post> query, int limit, Guid? callerId)
    {
        var rows = await query.OrderByDescending(p => p.CreatedAt).Take(limit + 1).ToListAsync();
        string? nextCursor = null;
        if (rows.Count > limit)
        {
            nextCursor = SocialQueryHelpers.EncodeCursor(rows[limit - 1].CreatedAt);
            rows = rows.Take(limit).ToList();
        }
        return new { posts = rows.Select(p => p.ToDto(callerId)), nextCursor };
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
        await db.Entry(post).Collection(p => p.Likes).LoadAsync();
        await db.Entry(post).Collection(p => p.Comments).LoadAsync();
        return Results.Created($"/posts/{post.Id}", post.ToDto(post.AuthorId));
    }

    private static async Task<IResult> EditPost(
        Guid id,
        [FromBody] EditBodyRequest req,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var post = await db.Posts
            .Include(p => p.Author)
            .Include(p => p.Likes)
            .Include(p => p.Comments)
            .FirstOrDefaultAsync(p => p.Id == id);
        if (post is null || post.DeletedAt is not null) return Results.NotFound();
        if (post.AuthorId != caller.GetUserId()) return Results.Forbid();
        if (string.IsNullOrWhiteSpace(req.Body)) return Results.BadRequest(new { error = "Body is required." });

        post.Body = req.Body.Trim();
        post.EditedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return Results.Ok(post.ToDto(caller.GetUserId()));
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

    private static async Task<IResult> GetPost(Guid id, ClaimsPrincipal caller, AppDbContext db)
    {
        var userId = caller.GetUserId();
        var post = await db.Posts
            .Include(p => p.Author)
            .Include(p => p.Likes)
            .Include(p => p.Comments)
            .FirstOrDefaultAsync(p => p.Id == id && p.DeletedAt == null);
        if (post is null) return Results.NotFound();

        if (await db.Blocks.AnyAsync(b =>
                (b.BlockerId == userId && b.BlockedId == post.AuthorId) ||
                (b.BlockerId == post.AuthorId && b.BlockedId == userId)))
            return Results.NotFound();

        return Results.Ok(post.ToDto(userId));
    }

    private static async Task<IResult> GetComments(
        Guid id,
        ClaimsPrincipal caller,
        AppDbContext db,
        [FromQuery] int limit = 50,
        [FromQuery] string? cursor = null)
    {
        var post = await db.Posts.FindAsync(id);
        if (post is null || post.DeletedAt is not null) return Results.NotFound();

        limit = Math.Clamp(limit, 1, 100);
        var after = SocialQueryHelpers.DecodeCursor(cursor);

        var query = db.Comments
            .Include(c => c.Author)
            .Where(c => c.PostId == id && c.DeletedAt == null);

        if (caller.Identity?.IsAuthenticated == true)
        {
            var blocked = await db.BlockedUserIdsAsync(caller.GetUserId());
            query = query.Where(c => !blocked.Contains(c.AuthorId));
        }

        if (after is not null)
            query = query.Where(c => c.CreatedAt > after);

        var rows = await query.OrderBy(c => c.CreatedAt).Take(limit + 1).ToListAsync();
        string? nextCursor = null;
        if (rows.Count > limit)
        {
            nextCursor = SocialQueryHelpers.EncodeCursor(rows[limit - 1].CreatedAt);
            rows = rows.Take(limit).ToList();
        }

        return Results.Ok(new { comments = rows.Select(c => c.ToDto()), nextCursor });
    }

    private static async Task<IResult> AddComment(
        Guid id,
        [FromBody] AddCommentRequest req,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var post = await db.Posts.FindAsync(id);
        if (post is null || post.DeletedAt is not null) return Results.NotFound();

        if (string.IsNullOrWhiteSpace(req.Body)) return Results.BadRequest(new { error = "Comment body is required." });

        var comment = new Comment
        {
            PostId = id,
            AuthorId = caller.GetUserId(),
            Body = req.Body.Trim(),
        };

        db.Comments.Add(comment);
        db.AddComment(caller.GetUserId(), post, comment.Id);
        await db.SaveChangesAsync();
        await db.Entry(comment).Reference(c => c.Author).LoadAsync();

        return Results.Created($"/posts/{id}/comments/{comment.Id}", comment.ToDto());
    }

    private static async Task<IResult> EditComment(
        Guid id, Guid commentId,
        [FromBody] EditBodyRequest req,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var comment = await db.Comments
            .Include(c => c.Author)
            .FirstOrDefaultAsync(c => c.Id == commentId);
        if (comment is null || comment.DeletedAt is not null || comment.PostId != id)
            return Results.NotFound();
        if (comment.AuthorId != caller.GetUserId()) return Results.Forbid();
        if (string.IsNullOrWhiteSpace(req.Body)) return Results.BadRequest(new { error = "Body is required." });

        comment.Body = req.Body.Trim();
        comment.EditedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return Results.Ok(comment.ToDto());
    }

    private static async Task<IResult> DeleteComment(
        Guid id, Guid commentId,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var comment = await db.Comments.FindAsync(commentId);
        if (comment is null || comment.DeletedAt is not null || comment.PostId != id)
            return Results.NotFound();
        if (comment.AuthorId != caller.GetUserId()) return Results.Forbid();

        comment.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Results.NoContent();
    }
}

public record CreatePostRequest(PostType Type, string? Body, string? PayloadJson);
public record AddCommentRequest(string Body);
public record EditBodyRequest(string Body);
