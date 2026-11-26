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
        posts.MapPost("/{id:guid}/repost", RepostPost).RequireAuthorization().RequireRateLimiting("social-write");
        posts.MapGet("/{id:guid}/comments", GetComments);
        posts.MapPost("/{id:guid}/comments", AddComment).RequireAuthorization().RequireRateLimiting("social-write");
        posts.MapPatch("/{id:guid}/comments/{commentId:guid}", EditComment).RequireAuthorization();
        posts.MapDelete("/{id:guid}/comments/{commentId:guid}", DeleteComment).RequireAuthorization();
        posts.MapPost("/{id:guid}/comments/{commentId:guid}/like", LikeComment).RequireAuthorization();
        posts.MapDelete("/{id:guid}/comments/{commentId:guid}/like", UnlikeComment).RequireAuthorization();

        follows.MapGet("/{username}/posts", GetUserPosts);
    }

    /// Following a public account follows it straight away; following a private one sends a
    /// request it has to accept. The answer says which: { status: "following" | "requested" }.
    private static async Task<IResult> Follow(string username, ClaimsPrincipal caller, AppDbContext db)
    {
        var followerId = caller.GetUserId();
        var target = await db.Users.FirstOrDefaultAsync(u => u.Username == username.ToLowerInvariant() && !u.IsSample);
        if (target is null) return Results.NotFound();
        if (target.Id == followerId) return Results.BadRequest(new { error = "Cannot follow yourself." });
        if (await db.Blocks.AnyAsync(b =>
                (b.BlockerId == followerId && b.BlockedId == target.Id) ||
                (b.BlockerId == target.Id && b.BlockedId == followerId)))
            return Results.NotFound();

        var exists = await db.Follows.AnyAsync(f => f.FollowerId == followerId && f.FollowedId == target.Id);
        if (exists) return Results.Conflict(new { error = "Already following." });

        if (target.IsPrivate)
        {
            if (!await db.FollowRequests.AnyAsync(r => r.RequesterId == followerId && r.TargetId == target.Id))
            {
                db.FollowRequests.Add(new FollowRequest { RequesterId = followerId, TargetId = target.Id });
                db.Notifications.Add(new Notification
                {
                    UserId = target.Id,
                    ActorId = followerId,
                    Type = NotificationType.FollowRequest,
                });
                await db.SaveChangesAsync();
            }
            return Results.Ok(new { status = "requested" });
        }

        db.Follows.Add(new Follow { FollowerId = followerId, FollowedId = target.Id });
        db.AddFollow(followerId, target.Id);
        await db.SaveChangesAsync();
        return Results.Ok(new { status = "following" });
    }

    /// Unfollows, or cancels a follow request that hasn't been answered yet.
    private static async Task<IResult> Unfollow(string username, ClaimsPrincipal caller, AppDbContext db)
    {
        var followerId = caller.GetUserId();
        var target = await db.Users.FirstOrDefaultAsync(u => u.Username == username.ToLowerInvariant() && !u.IsSample);
        if (target is null) return Results.NotFound();

        var follow = await db.Follows.FindAsync(followerId, target.Id);
        if (follow is not null)
        {
            db.Follows.Remove(follow);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }

        var request = await db.FollowRequests.FindAsync(followerId, target.Id);
        if (request is null) return Results.NotFound();
        db.FollowRequests.Remove(request);
        await db.RemoveFollowRequestNotificationAsync(followerId, target.Id);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> GetFollowers(string username, ClaimsPrincipal caller, AppDbContext db)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Username == username.ToLowerInvariant() && !u.IsSample);
        if (user is null) return Results.NotFound();
        if (!await db.CanSeeAsync(caller.GetUserIdOrNull(), user)) return Privacy.PrivateAccount();

        var follows = await db.Follows
            .Include(f => f.Follower)
            .Where(f => f.FollowedId == user.Id)
            .ToListAsync();
        var dto = await MappingExtensions.ProfilesForCaller(db, caller.GetUserIdOrNull(), follows.Select(f => f.FollowerId).ToList());
        return Results.Ok(follows.Select(f => dto(f.Follower)));
    }

    private static async Task<IResult> GetFollowing(string username, ClaimsPrincipal caller, AppDbContext db)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Username == username.ToLowerInvariant() && !u.IsSample);
        if (user is null) return Results.NotFound();
        if (!await db.CanSeeAsync(caller.GetUserIdOrNull(), user)) return Privacy.PrivateAccount();

        var follows = await db.Follows
            .Include(f => f.Followed)
            .Where(f => f.FollowerId == user.Id)
            .ToListAsync();
        var dto = await MappingExtensions.ProfilesForCaller(db, caller.GetUserIdOrNull(), follows.Select(f => f.FollowedId).ToList());
        return Results.Ok(follows.Select(f => dto(f.Followed)));
    }

    private static async Task<IResult> GetUserPosts(
        string username,
        AppDbContext db,
        ClaimsPrincipal caller,
        [FromQuery] int limit = 20,
        [FromQuery] string? cursor = null)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Username == username.ToLowerInvariant() && !u.IsSample);
        if (user is null) return Results.NotFound();

        Guid? callerId = caller.GetUserIdOrNull();
        if (callerId is not null && await db.Blocks.AnyAsync(b =>
                (b.BlockerId == callerId && b.BlockedId == user.Id) ||
                (b.BlockerId == user.Id && b.BlockedId == callerId)))
            return Results.NotFound();
        if (!await db.CanSeeAsync(callerId, user)) return Privacy.PrivateAccount();

        limit = Math.Clamp(limit, 1, 50);
        var before = SocialQueryHelpers.DecodeCursor(cursor);

        var query = db.Posts
            .Include(p => p.Author)
            .Include(p => p.Likes)
            .Include(p => p.Comments)
            .Include(p => p.RepostOf!).ThenInclude(r => r.Author)
            .Include(p => p.RepostOf!).ThenInclude(r => r.Likes)
            .Include(p => p.RepostOf!).ThenInclude(r => r.Comments)
            .Where(p => p.AuthorId == user.Id && p.DeletedAt == null);

        if (before is not null)
            query = query.Where(p => p.CreatedAt < before);

        return Results.Ok(await PageAsync(db, query, limit, callerId));
    }

    private static async Task<IResult> LikePost(Guid id, ClaimsPrincipal caller, AppDbContext db)
    {
        var userId = caller.GetUserId();
        id = await db.SharedPostIdAsync(id);
        var post = await db.Posts.Include(p => p.Author).FirstOrDefaultAsync(p => p.Id == id);
        if (post is null || post.DeletedAt is not null) return Results.NotFound();
        if (!await db.CanSeeAsync(userId, post.Author)) return Results.NotFound();
        // Matches CommentLike's self-like guard — client already disables the heart for your
        // own post, this is defense in depth.
        if (post.AuthorId == userId) return Results.BadRequest(new { error = "Cannot like your own post." });

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
        // Likes left on a plain repost by older app versions are removed where they are.
        if (await db.Likes.FindAsync(userId, id) is { } onRepost)
        {
            db.Likes.Remove(onRepost);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }
        id = await db.SharedPostIdAsync(id);
        var like = await db.Likes.FindAsync(userId, id);
        if (like is null) return Results.NotFound();

        db.Likes.Remove(like);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    /// Reposts a post — a real new Post row you author, linked to the original via RepostOfId.
    /// Two flavours, both through here (Twitter/X model):
    ///   • plain repost  — no body; the client renders it as the quoted original with a
    ///     "reposted" marker.
    ///   • quote repost  — Body is *your* caption about the original; the original renders as
    ///     a nested quoted card beneath it.
    /// The repost never carries a copy of the original's Type/PayloadJson: that content is
    /// display-only attribution and belongs to the original, reached via RepostOf. The repost
    /// itself is always a Text post whose "attachment" is the quoted card.
    private static async Task<IResult> RepostPost(
        Guid id,
        [FromBody] RepostRequest req,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var userId = caller.GetUserId();
        var target = await db.Posts.Include(p => p.Author).FirstOrDefaultAsync(p => p.Id == id);
        if (target is null || target.DeletedAt is not null) return Results.NotFound();

        // Reposting a *plain* repost (one with no commentary of its own) attributes to what it
        // actually shares — the underlying original — so the quoted card never resolves to an
        // empty intermediate row and quote-chains stay one level deep.
        if (target.RepostOfId is not null && string.IsNullOrEmpty(target.Body))
        {
            target = await db.Posts.Include(p => p.Author).FirstOrDefaultAsync(p => p.Id == target.RepostOfId);
            if (target is null || target.DeletedAt is not null) return Results.NotFound();
        }

        // A private account's posts stay with the followers it accepted, so they can't be
        // passed on (not even by the author: the repost would be public).
        if (target.Author.IsPrivate)
            return Results.BadRequest(new { error = "Posts from private accounts can't be reposted.", code = "private" });

        var body = req.Body?.Trim();
        if (string.IsNullOrEmpty(body)) body = null;

        // You can quote your own post (adding commentary), but a plain repost of it is a no-op.
        if (target.AuthorId == userId && body is null)
            return Results.BadRequest(new { error = "Cannot repost your own post." });

        // One plain repost per post — a second is a no-op (quote reposts are unlimited).
        if (body is null && await db.Posts.AnyAsync(p =>
                p.AuthorId == userId && p.RepostOfId == target.Id && p.Body == null && p.DeletedAt == null))
            return Results.Conflict(new { error = "You've already reposted this." });

        var repost = new Post
        {
            AuthorId = userId,
            Type = PostType.Text,
            Body = body,
            PayloadJson = null,
            RepostOfId = target.Id,
            RepostOf = target,
        };

        db.Posts.Add(repost);
        db.AddRepost(userId, target, body is null ? null : repost);
        await db.AddMentionsAsync(repost.AuthorId, repost.Body, repost.Id);
        await db.SetForPostAsync(repost);
        await db.SaveChangesAsync();

        await db.Entry(repost).Reference(p => p.Author).LoadAsync();
        await db.Entry(repost).Collection(p => p.Likes).LoadAsync();
        await db.Entry(repost).Collection(p => p.Comments).LoadAsync();
        await db.Entry(target).Collection(p => p.Likes).LoadAsync();
        await db.Entry(target).Collection(p => p.Comments).LoadAsync();
        return Results.Created($"/posts/{repost.Id}", repost.ToDto(userId));
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
            .Include(p => p.RepostOf!).ThenInclude(r => r.Author)
            .Include(p => p.RepostOf!).ThenInclude(r => r.Likes)
            .Include(p => p.RepostOf!).ThenInclude(r => r.Comments)
            .Where(p => followedIds.Contains(p.AuthorId) && !blocked.Contains(p.AuthorId) && p.DeletedAt == null);

        if (before is not null)
            query = query.Where(p => p.CreatedAt < before);

        // Forum posts from the same stretch of time come along as title cards (canvas F1); the
        // app slots them in by time.
        var page = await PageAsync(db, query, limit, userId);
        var forum = await GroupPostEndpoints.FeedCardsAsync(db, userId, followedIds, blocked, page.NextCursor is null ? null : page.Oldest, before);
        return Results.Ok(new { page.Posts, page.NextCursor, forum });
    }

    /// Shared: order newest-first, take limit+1 to detect a next page, project to
    /// DTOs, and hand back an opaque cursor.
    public record Page(IEnumerable<PostDto> Posts, string? NextCursor)
    {
        [System.Text.Json.Serialization.JsonIgnore] public DateTime? Oldest { get; init; }
    }

    public static async Task<Page> PageAsync(AppDbContext db, IQueryable<Post> query, int limit, Guid? callerId)
    {
        var rows = await query.OrderByDescending(p => p.CreatedAt).Take(limit + 1).ToListAsync();
        string? nextCursor = null;
        if (rows.Count > limit)
        {
            nextCursor = SocialQueryHelpers.EncodeCursor(rows[limit - 1].CreatedAt);
            rows = rows.Take(limit).ToList();
        }
        var hidden = await db.HiddenRepostAuthorsAsync(callerId, rows);
        return new Page(rows.Select(p => p.ToDto(callerId, hidden)), nextCursor) { Oldest = rows.LastOrDefault()?.CreatedAt };
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
        await db.AddMentionsAsync(post.AuthorId, post.Body, post.Id);
        await db.SetForPostAsync(post);
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
            .Include(p => p.RepostOf!).ThenInclude(r => r.Author)
            .Include(p => p.RepostOf!).ThenInclude(r => r.Likes)
            .Include(p => p.RepostOf!).ThenInclude(r => r.Comments)
            .FirstOrDefaultAsync(p => p.Id == id);
        if (post is null || post.DeletedAt is not null) return Results.NotFound();
        if (post.AuthorId != caller.GetUserId()) return Results.Forbid();
        if (string.IsNullOrWhiteSpace(req.Body)) return Results.BadRequest(new { error = "Body is required." });

        post.Body = req.Body.Trim();
        post.EditedAt = DateTime.UtcNow;
        await db.SetForPostAsync(post);
        await db.SaveChangesAsync();

        var hiddenEdit = await db.HiddenRepostAuthorsAsync(post.AuthorId, [post]);
        return Results.Ok(post.ToDto(post.AuthorId, hiddenEdit));
    }

    private static async Task<IResult> DeletePost(Guid id, ClaimsPrincipal caller, AppDbContext db)
    {
        var post = await db.Posts.FindAsync(id);
        if (post is null || post.DeletedAt is not null) return Results.NotFound();
        if (post.AuthorId != caller.GetUserId()) return Results.Forbid();

        post.DeletedAt = DateTime.UtcNow;
        await db.SetForPostAsync(post);
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
            .Include(p => p.RepostOf!).ThenInclude(r => r.Author)
            .Include(p => p.RepostOf!).ThenInclude(r => r.Likes)
            .Include(p => p.RepostOf!).ThenInclude(r => r.Comments)
            .FirstOrDefaultAsync(p => p.Id == id && p.DeletedAt == null);
        if (post is null) return Results.NotFound();

        if (await db.Blocks.AnyAsync(b =>
                (b.BlockerId == userId && b.BlockedId == post.AuthorId) ||
                (b.BlockerId == post.AuthorId && b.BlockedId == userId)))
            return Results.NotFound();
        if (!await db.CanSeeAsync(userId, post.Author)) return Results.NotFound();

        var hidden = await db.HiddenRepostAuthorsAsync(userId, [post]);
        return Results.Ok(post.ToDto(userId, hidden));
    }

    private static async Task<IResult> GetComments(
        Guid id,
        ClaimsPrincipal caller,
        AppDbContext db,
        [FromQuery] int limit = 50,
        [FromQuery] string? cursor = null)
    {
        id = await db.SharedPostIdAsync(id);
        var post = await db.Posts.Include(p => p.Author).FirstOrDefaultAsync(p => p.Id == id);
        if (post is null || post.DeletedAt is not null) return Results.NotFound();

        limit = Math.Clamp(limit, 1, 100);
        var after = SocialQueryHelpers.DecodeCursor(cursor);

        Guid? callerId = caller.GetUserIdOrNull();
        if (!await db.CanSeeAsync(callerId, post.Author)) return Results.NotFound();

        // Pages are top-level comments, oldest first; each page brings all of its comments'
        // replies along (also oldest first), so a thread is never split across pages.
        var query = db.Comments
            .Include(c => c.Author)
            .Include(c => c.Likes)
            .Where(c => c.PostId == id && c.DeletedAt == null && c.ParentCommentId == null);

        List<Guid> blocked = [];
        if (callerId is not null)
        {
            blocked = await db.BlockedUserIdsAsync(callerId.Value);
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

        var parentIds = rows.Select(c => c.Id).ToList();
        var replies = await db.Comments
            .Include(c => c.Author)
            .Include(c => c.Likes)
            .Where(c => c.ParentCommentId != null && parentIds.Contains(c.ParentCommentId.Value)
                && c.DeletedAt == null && !blocked.Contains(c.AuthorId))
            .OrderBy(c => c.CreatedAt)
            .ToListAsync();

        return Results.Ok(new { comments = rows.Concat(replies).Select(c => c.ToDto(callerId)), nextCursor });
    }

    private static async Task<IResult> AddComment(
        Guid id,
        [FromBody] AddCommentRequest req,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        id = await db.SharedPostIdAsync(id);
        var post = await db.Posts.Include(p => p.Author).FirstOrDefaultAsync(p => p.Id == id);
        if (post is null || post.DeletedAt is not null) return Results.NotFound();
        if (!await db.CanSeeAsync(caller.GetUserId(), post.Author)) return Results.NotFound();

        if (string.IsNullOrWhiteSpace(req.Body)) return Results.BadRequest(new { error = "Comment body is required." });

        // A reply to a reply joins the same top-level comment (one level of threading).
        Comment? parent = null;
        if (req.ParentCommentId is { } parentId)
        {
            parent = await db.Comments.FirstOrDefaultAsync(c => c.Id == parentId && c.PostId == id && c.DeletedAt == null);
            if (parent is null) return Results.NotFound(new { error = "That comment was deleted." });
            if (parent.ParentCommentId is { } topId)
                parent = await db.Comments.FirstOrDefaultAsync(c => c.Id == topId && c.DeletedAt == null);
            if (parent is null) return Results.NotFound(new { error = "That comment was deleted." });
        }

        var comment = new Comment
        {
            PostId = id,
            AuthorId = caller.GetUserId(),
            Body = req.Body.Trim(),
            ParentCommentId = parent?.Id,
        };

        db.Comments.Add(comment);
        db.AddComment(caller.GetUserId(), post, comment.Id);
        // The person replied to hears "replied to your comment": that's the one they replied to
        // directly (it may itself be a reply), not the thread's top comment.
        var repliedTo = req.ParentCommentId is { } directId
            ? await db.Comments.Where(c => c.Id == directId).Select(c => (Guid?)c.AuthorId).FirstOrDefaultAsync()
            : null;
        var skipMention = new List<Guid>();
        if (repliedTo is { } repliedToId && await db.AddReplyAsync(comment.AuthorId, repliedToId, post, comment.Id))
            skipMention.Add(repliedToId);
        await db.AddMentionsAsync(comment.AuthorId, comment.Body, post.Id, comment.Id, skipMention);
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
        id = await db.SharedPostIdAsync(id);
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
        id = await db.SharedPostIdAsync(id);
        if (comment is null || comment.DeletedAt is not null || comment.PostId != id)
            return Results.NotFound();
        var userId = caller.GetUserId();
        if (comment.AuthorId != userId)
        {
            // The post's author may remove comments on their post too (bug hunt 5.12), as on Instagram.
            var postAuthorId = await db.Posts.Where(p => p.Id == id).Select(p => p.AuthorId).FirstOrDefaultAsync();
            if (postAuthorId != userId) return Results.Forbid();
        }

        // Deleting a top-level comment takes its replies with it (as on Instagram).
        var now = DateTime.UtcNow;
        comment.DeletedAt = now;
        var replies = await db.Comments.Where(c => c.ParentCommentId == comment.Id && c.DeletedAt == null).ToListAsync();
        foreach (var reply in replies) reply.DeletedAt = now;
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> LikeComment(Guid id, Guid commentId, ClaimsPrincipal caller, AppDbContext db)
    {
        var userId = caller.GetUserId();
        id = await db.SharedPostIdAsync(id);
        var comment = await db.Comments.Include(c => c.Post).ThenInclude(p => p.Author)
            .FirstOrDefaultAsync(c => c.Id == commentId && c.PostId == id);
        if (comment is null || comment.DeletedAt is not null) return Results.NotFound();
        if (!await db.CanSeeAsync(userId, comment.Post.Author)) return Results.NotFound();
        // Matches the Instagram-style UX this mirrors: you can't like your own comment — the
        // heart doesn't even render client-side for your own comments, this is defense in depth.
        if (comment.AuthorId == userId) return Results.BadRequest(new { error = "Cannot like your own comment." });

        var exists = await db.CommentLikes.AnyAsync(l => l.UserId == userId && l.CommentId == commentId);
        if (exists) return Results.Conflict(new { error = "Already liked." });

        db.CommentLikes.Add(new CommentLike { UserId = userId, CommentId = commentId });
        await db.AddCommentLikeAsync(userId, comment);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> UnlikeComment(Guid id, Guid commentId, ClaimsPrincipal caller, AppDbContext db)
    {
        var userId = caller.GetUserId();
        var like = await db.CommentLikes.FindAsync(userId, commentId);
        if (like is null) return Results.NotFound();

        db.CommentLikes.Remove(like);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }
}

public record CreatePostRequest(PostType Type, string? Body, string? PayloadJson);
public record RepostRequest(string? Body);
public record AddCommentRequest(string Body, Guid? ParentCommentId = null);
public record EditBodyRequest(string Body);
