using System.Security.Claims;
using System.Text;
using Regex = System.Text.RegularExpressions.Regex;
using GeneratedRegexAttribute = System.Text.RegularExpressions.GeneratedRegexAttribute;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Photos;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Social;

/// Posts in groups (design canvas Q1–Q7; Martin's notes 25 Nov), Reddit-style. Who can read:
/// members; anyone signed in when the group is findable; anyone at all on the web for posts written
/// while the group showed its posts on the web (/public/...). Who can post: members (or only
/// organisers and moderators). Who can comment: anyone signed in, or members only (group setting,
/// which a post can narrow). Upvotes only. Moderators pin, lock and remove; reports reach them.
public static partial class GroupPostEndpoints
{
    public static readonly string[] DefaultKinds = ["Question", "Form check", "Advice", "Gyms and kit", "Event", "Other"];
    public const int MaxComments = 3000;

    public static void MapGroupPostEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/groups/{groupId:guid}/posts", List).WithTags("Social").RequireAuthorization();
        app.MapPost("/groups/{groupId:guid}/posts", Create).WithTags("Social").RequireAuthorization().RequireRateLimiting("social-write");
        app.MapGet("/groups/{groupId:guid}/post-kinds", Kinds).WithTags("Social").RequireAuthorization();
        var p = app.MapGroup("/group-posts").WithTags("Social").RequireAuthorization();
        p.MapGet("/search", Search);
        p.MapGet("/{id:guid}", Thread);
        p.MapPatch("/{id:guid}", Edit);
        p.MapDelete("/{id:guid}", Delete);
        p.MapPut("/{id:guid}/vote", VotePost);
        p.MapPost("/{id:guid}/comments", Comment).RequireRateLimiting("social-write");
        p.MapPut("/{id:guid}/moderation", Moderate);
        var c = app.MapGroup("/group-comments").WithTags("Social").RequireAuthorization();
        c.MapPatch("/{id:guid}", EditComment);
        c.MapDelete("/{id:guid}", DeleteComment);
        c.MapPut("/{id:guid}/vote", VoteComment);
        // The web, signed out (canvas Q6): read only, posts that were written for the web.
        var pub = app.MapGroup("/public").WithTags("Public").AllowAnonymous().RequireRateLimiting("social-write");
        pub.MapGet("/groups/{slug}/posts/{postSlug}", PublicThread);
        pub.MapGet("/group-posts", PublicIndex);
    }

    public record PersonDto(string Username, string DisplayName, string? AvatarUrl, Guid Id);
    public record GroupBriefDto(Guid Id, string Name, string Slug, string Kind, string? Place, string? PhotoUrl, int Members, string Access);
    /// Deleted: removed by its author or (RemovedByModerator) a moderator; its content is gone.
    /// Member: the author is in the group (else "Not a member").
    public record PostDto(Guid Id, GroupBriefDto Group, PersonDto? Author, bool AuthorIsMember, string? AuthorRole, string Title, string Body, string Kind,
        string Slug, string? PhotoUrl, int PhotoWidth, int PhotoHeight, string? CardType, string? CardJson, int Upvotes, bool Upvoted, int CommentCount,
        long CreatedAtMs, long LastActivityAtMs, bool Edited, bool Deleted, bool RemovedByModerator, bool Pinned, bool Locked, bool OnWeb,
        bool MembersOnlyComments, bool Mine, bool CanComment, string? WhyNot, bool CanModerate);
    public record CommentDto(Guid Id, Guid? ParentId, PersonDto? Author, bool AuthorIsMember, string? AuthorRole, string Body, int Upvotes, bool Upvoted,
        long CreatedAtMs, bool Edited, bool Deleted, bool RemovedByModerator, bool Mine);
    public record ThreadDto(PostDto Post, List<CommentDto> Comments);
    public record CreateRequest(string Title, string? Body, string? Kind, Guid? PhotoId, string? CardType, string? CardJson, bool MembersOnlyComments = false);
    public record EditRequest(string? Title, string? Body, string? Kind);
    public record CommentRequest(string Body, Guid? ParentId);
    public record VoteRequest(bool Up);
    public record ModerationRequest(bool? Pinned, bool? Locked, bool? Remove);

    private static long Ms(DateTime t) => new DateTimeOffset(DateTime.SpecifyKind(t, DateTimeKind.Utc)).ToUnixTimeMilliseconds();
    private static PersonDto? Person(User? u) => u is null ? null : new(u.Username, u.DisplayName, u.AvatarUrl, u.Id);
    private static string? Clean(string? s, int max) => string.IsNullOrWhiteSpace(s) ? null : s.Trim()[..Math.Min(s.Trim().Length, max)];
    private static IResult Gone() => Results.NotFound(new { error = "This post doesn't exist, or you can't see it." });

    [GeneratedRegex("[^a-z0-9]+")]
    private static partial Regex NonSlug();

    /// "Best gyms in Sligo?" → "best-gyms-in-sligo" (letters and digits, at most 60).
    public static string Slugify(string text)
    {
        var plain = new string(text.Normalize(NormalizationForm.FormD).Where(ch => System.Globalization.CharUnicodeInfo.GetUnicodeCategory(ch) != System.Globalization.UnicodeCategory.NonSpacingMark).ToArray());
        var s = NonSlug().Replace(plain.ToLowerInvariant(), "-").Trim('-');
        return s.Length > 60 ? s[..60].TrimEnd('-') : s.Length == 0 ? "post" : s;
    }

    /// The group's web name, made the first time it's needed (unique: a short suffix when taken).
    public static async Task<string> GroupSlugAsync(AppDbContext db, Group g)
    {
        if (g.Slug.Length > 0) return g.Slug;
        var slug = Slugify(g.Name);
        if (await db.Groups.AnyAsync(x => x.Slug == slug && x.Id != g.Id)) slug = $"{slug}-{g.Id.ToString("N")[..4]}";
        g.Slug = slug;
        await db.SaveChangesAsync();
        return slug;
    }

    private static async Task<GroupBriefDto> BriefAsync(AppDbContext db, Group g) =>
        new(g.Id, g.Name, await GroupSlugAsync(db, g), g.Kind, g.Place, g.PhotoId is { } ph ? PhotoEndpoints.UrlOf(ph) : null,
            await db.GroupMembers.CountAsync(m => m.GroupId == g.Id), g.Access.ToString());

    /// Can `me` read this group's posts: a member, or the group is findable.
    private static async Task<(Group? Group, GroupMember? Me)> ReaderAsync(AppDbContext db, Guid groupId, Guid me)
    {
        var g = await db.Groups.FirstOrDefaultAsync(x => x.Id == groupId);
        if (g is null || !g.PostsOn) return (null, null);
        var member = await db.GroupMembers.FirstOrDefaultAsync(m => m.GroupId == groupId && m.UserId == me);
        return member is null && g.Access == GroupAccess.InviteOnly ? (null, null) : (g, member);
    }

    private static Task<bool> BlockedAsync(AppDbContext db, Guid me, Guid? other) =>
        other is null ? Task.FromResult(false)
            : db.Blocks.AnyAsync(b => (b.BlockerId == me && b.BlockedId == other) || (b.BlockerId == other && b.BlockedId == me));

    private static (bool Can, string? Why) CanComment(Group g, GroupPost p, GroupMember? me, bool signedIn)
    {
        if (!signedIn) return (false, "Sign in to comment.");
        if (p.DeletedAt is not null) return (false, "This post was removed.");
        if (p.Locked) return (false, "Comments are locked.");
        if (me is null && (g.WhoCanComment == GroupCommenting.Members || p.MembersOnlyComments)) return (false, "Only members can comment on this post.");
        return (true, null);
    }

    private static async Task<List<PostDto>> PostDtosAsync(AppDbContext db, List<GroupPost> posts, Group g, GroupMember? me, Guid? meId)
    {
        var brief = await BriefAsync(db, g);
        var authorIds = posts.Where(p => p.AuthorId is not null).Select(p => p.AuthorId!.Value).Distinct().ToList();
        var roles = await db.GroupMembers.Where(m => m.GroupId == g.Id && authorIds.Contains(m.UserId)).ToDictionaryAsync(m => m.UserId, m => m.Role);
        var ids = posts.Select(p => p.Id).ToList();
        var upvoted = meId is { } uid ? (await db.GroupVotes.Where(v => v.UserId == uid && v.CommentId == null && ids.Contains(v.PostId)).Select(v => v.PostId).ToListAsync()).ToHashSet() : [];
        var moderate = me is not null && GroupEndpoints.CanModerate(me);
        return [.. posts.Select(p =>
        {
            var gone = p.DeletedAt is not null;
            var (can, why) = CanComment(g, p, me, meId is not null);
            var role = p.AuthorId is { } a && roles.TryGetValue(a, out var r) ? r : (GroupRole?)null;
            return new PostDto(p.Id, brief, gone ? null : Person(p.Author), role is not null, role is GroupRole.Member or null ? null : role.ToString(),
                gone ? "" : p.Title, gone ? "" : p.Body, p.Kind, p.Slug, gone || p.PhotoId is null ? null : PhotoEndpoints.UrlOf(p.PhotoId.Value), p.PhotoWidth, p.PhotoHeight,
                gone ? null : p.CardType, gone ? null : p.CardJson, p.Upvotes, upvoted.Contains(p.Id), p.CommentCount, Ms(p.CreatedAt), Ms(p.LastActivityAt),
                p.EditedAt is not null, gone, p.RemovedByModerator, p.Pinned, p.Locked, p.OnWeb, p.MembersOnlyComments, meId is not null && p.AuthorId == meId,
                can, why, moderate);
        })];
    }

    /// Active (latest comments first), New or Top; pinned posts first. `before` pages on.
    private static async Task<IResult> List(Guid groupId, string? sort, int? skip, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var (g, member) = await ReaderAsync(db, groupId, me);
        if (g is null) return Gone();
        var q = db.GroupPosts.Include(p => p.Author).Where(p => p.GroupId == groupId && (p.DeletedAt == null || p.CommentCount > 0)
            && !db.Blocks.Any(b => (b.BlockerId == me && b.BlockedId == p.AuthorId) || (b.BlockerId == p.AuthorId && b.BlockedId == me)));
        q = sort switch
        {
            "new" => q.OrderByDescending(p => p.Pinned).ThenByDescending(p => p.CreatedAt),
            "top" => q.OrderByDescending(p => p.Pinned).ThenByDescending(p => p.Upvotes).ThenByDescending(p => p.CreatedAt),
            _ => q.OrderByDescending(p => p.Pinned).ThenByDescending(p => p.LastActivityAt),
        };
        var posts = await q.Skip(Math.Max(0, skip ?? 0)).Take(30).ToListAsync();
        return Results.Ok(await PostDtosAsync(db, posts, g, member, me));
    }

    /// The kinds to offer: the usual ones and any this group already uses (most used first).
    private static async Task<IResult> Kinds(Guid groupId, ClaimsPrincipal caller, AppDbContext db)
    {
        var (g, _) = await ReaderAsync(db, groupId, caller.GetUserId());
        if (g is null) return Gone();
        var used = await db.GroupPosts.Where(p => p.GroupId == groupId && p.DeletedAt == null).GroupBy(p => p.Kind)
            .OrderByDescending(k => k.Count()).Select(k => k.Key).Take(12).ToListAsync();
        return Results.Ok(DefaultKinds.Take(DefaultKinds.Length - 1).Concat(used).Append("Other").Distinct(StringComparer.OrdinalIgnoreCase).ToList());
    }

    private static async Task<IResult> Create(Guid groupId, CreateRequest req, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        var me = caller.GetUserId();
        var member = await db.GroupMembers.Include(m => m.Group).FirstOrDefaultAsync(m => m.GroupId == groupId && m.UserId == me);
        if (member is null || !member.Group.PostsOn) return Results.NotFound(new { error = "Join the group to post in it." });
        var g = member.Group;
        if (g.WhoCanPost == GroupPosting.Staff && !GroupEndpoints.CanModerate(member))
            return Results.Json(new { error = "In this group only organisers and moderators post. You can comment." }, statusCode: 403);
        if (member.MutedUntil > clock.GetUtcNow().UtcDateTime) return Results.Json(new { error = "A moderator muted you in this group for now." }, statusCode: 403);
        var title = Clean(req.Title, 200);
        if (title is null) return Results.BadRequest(new { error = "Give the post a title." });
        var kind = Clean(req.Kind, 30) ?? "Question";
        Photo? photo = null;
        if (req.PhotoId is { } pid && (photo = await PhotoEndpoints.OwnedAsync(db, me, pid)) is null)
            return Results.BadRequest(new { error = "That photo didn't upload. Try again." });
        if (req.CardType is not null && (!DirectMessageEndpoints.CardTypes.Contains(req.CardType) || req.CardJson is not { Length: > 0 and <= 4000 }))
            return Results.BadRequest(new { error = "That can't be shared in a post." });
        var now = clock.GetUtcNow().UtcDateTime;
        var post = new GroupPost
        {
            GroupId = groupId, AuthorId = me, Title = title, Body = Clean(req.Body, 10000) ?? "", Kind = kind, Slug = Slugify(title),
            PhotoId = photo?.Id, PhotoWidth = photo?.Width ?? 0, PhotoHeight = photo?.Height ?? 0, CardType = req.CardType, CardJson = req.CardType is null ? null : req.CardJson,
            MembersOnlyComments = req.MembersOnlyComments, OnWeb = g.PostsOnWeb && g.Access != GroupAccess.InviteOnly, CreatedAt = now, LastActivityAt = now,
        };
        db.GroupPosts.Add(post);
        await db.SaveChangesAsync();
        await db.Entry(post).Reference(p => p.Author).LoadAsync();
        return Results.Ok((await PostDtosAsync(db, [post], g, member, me))[0]);
    }

    private static async Task<(GroupPost? Post, Group? Group, GroupMember? Me)> PostAsync(AppDbContext db, Guid id, Guid me)
    {
        var post = await db.GroupPosts.Include(p => p.Author).FirstOrDefaultAsync(p => p.Id == id);
        if (post is null) return (null, null, null);
        var (g, member) = await ReaderAsync(db, post.GroupId, me);
        return g is null ? (null, null, null) : (post, g, member);
    }

    /// The post and every comment (flat, each with its parent; the app builds the tree), top first.
    private static async Task<IResult> Thread(Guid id, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var (post, g, member) = await PostAsync(db, id, me);
        if (post is null || g is null || await BlockedAsync(db, me, post.AuthorId)) return Gone();
        return Results.Ok(new ThreadDto((await PostDtosAsync(db, [post], g, member, me))[0], await CommentsAsync(db, post, g, me)));
    }

    private static async Task<List<CommentDto>> CommentsAsync(AppDbContext db, GroupPost post, Group g, Guid? me)
    {
        var rows = await db.GroupComments.Include(c => c.Author).Where(c => c.PostId == post.Id)
            .OrderByDescending(c => c.Upvotes).ThenBy(c => c.CreatedAt).Take(MaxComments).ToListAsync();
        var blocked = me is { } uid
            ? (await db.Blocks.Where(b => b.BlockerId == uid || b.BlockedId == uid).Select(b => b.BlockerId == uid ? b.BlockedId : b.BlockerId).ToListAsync()).ToHashSet()
            : [];
        var authorIds = rows.Where(c => c.AuthorId is not null).Select(c => c.AuthorId!.Value).Distinct().ToList();
        var roles = await db.GroupMembers.Where(m => m.GroupId == g.Id && authorIds.Contains(m.UserId)).ToDictionaryAsync(m => m.UserId, m => m.Role);
        var ids = rows.Select(c => c.Id).ToList();
        var upvoted = me is { } u2 ? (await db.GroupVotes.Where(v => v.UserId == u2 && v.CommentId != null && ids.Contains(v.CommentId.Value)).Select(v => v.CommentId!.Value).ToListAsync()).ToHashSet() : [];
        return [.. rows.Select(c =>
        {
            // Someone blocked either way reads as removed, so the thread keeps its shape.
            var hidden = c.DeletedAt is not null || (c.AuthorId is { } a && blocked.Contains(a));
            var role = c.AuthorId is { } aid && roles.TryGetValue(aid, out var r) ? r : (GroupRole?)null;
            return new CommentDto(c.Id, c.ParentId, hidden ? null : Person(c.Author), role is not null, role is GroupRole.Member or null ? null : role.ToString(),
                hidden ? "" : c.Body, c.Upvotes, upvoted.Contains(c.Id), Ms(c.CreatedAt), c.EditedAt is not null, hidden, c.RemovedByModerator,
                me is not null && c.AuthorId == me);
        })];
    }

    private static async Task<IResult> Edit(Guid id, EditRequest req, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        var me = caller.GetUserId();
        var post = await db.GroupPosts.FirstOrDefaultAsync(p => p.Id == id && p.AuthorId == me && p.DeletedAt == null);
        if (post is null) return Gone();
        if (req.Title is not null) post.Title = Clean(req.Title, 200) ?? post.Title;
        if (req.Body is not null) post.Body = Clean(req.Body, 10000) ?? "";
        if (req.Kind is not null) post.Kind = Clean(req.Kind, 30) ?? post.Kind;
        post.EditedAt = clock.GetUtcNow().UtcDateTime;
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    /// The author deletes it, or a moderator removes it: content and photo go; comments stay.
    public static async Task RemovePostAsync(AppDbContext db, IPhotoStore store, GroupPost post, bool byModerator, DateTime now, CancellationToken ct = default)
    {
        if (post.PhotoId is { } photoId && await db.Photos.FindAsync([photoId], ct) is { } photo)
        {
            await store.DeleteAsync(photoId.ToString("N"), ct);
            db.Photos.Remove(photo);
        }
        (post.Title, post.Body, post.PhotoId, post.CardType, post.CardJson) = ("", "", null, null, null);
        post.DeletedAt = now;
        post.RemovedByModerator = byModerator;
        post.Pinned = false;
        await db.SaveChangesAsync(ct);
        if (post.GroupId != Guid.Empty)
            await db.Reports.Where(r => r.GroupId == post.GroupId && r.TargetId == post.Id && r.GroupResolvedAt == null)
                .ExecuteUpdateAsync(s => s.SetProperty(r => r.GroupResolvedAt, (DateTime?)now), ct);
    }

    private static async Task<IResult> Delete(Guid id, ClaimsPrincipal caller, AppDbContext db, IPhotoStore store, TimeProvider clock, CancellationToken ct)
    {
        var me = caller.GetUserId();
        var post = await db.GroupPosts.FirstOrDefaultAsync(p => p.Id == id && p.AuthorId == me && p.DeletedAt == null, ct);
        if (post is null) return Gone();
        await RemovePostAsync(db, store, post, false, clock.GetUtcNow().UtcDateTime, ct);
        return Results.NoContent();
    }

    private static async Task<IResult> Moderate(Guid id, ModerationRequest req, ClaimsPrincipal caller, AppDbContext db, IPhotoStore store, TimeProvider clock, CancellationToken ct)
    {
        var me = caller.GetUserId();
        var (post, _, member) = await PostAsync(db, id, me);
        if (post is null) return Gone();
        if (member is null || !GroupEndpoints.CanModerate(member)) return Results.Json(new { error = "Only the group's organisers and moderators can do that." }, statusCode: 403);
        if (req.Pinned is { } pin) post.Pinned = pin && post.DeletedAt is null;
        if (req.Locked is { } locked) post.Locked = locked;
        if (req.Remove == true && post.DeletedAt is null) await RemovePostAsync(db, store, post, true, clock.GetUtcNow().UtcDateTime, ct);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> VotePost(Guid id, VoteRequest req, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var (post, _, _) = await PostAsync(db, id, me);
        if (post is null || post.DeletedAt is not null) return Gone();
        var vote = await db.GroupVotes.FirstOrDefaultAsync(v => v.UserId == me && v.PostId == id && v.CommentId == null);
        if (req.Up && vote is null) { db.GroupVotes.Add(new GroupVote { UserId = me, PostId = id }); post.Upvotes++; }
        else if (!req.Up && vote is not null) { db.GroupVotes.Remove(vote); post.Upvotes = Math.Max(0, post.Upvotes - 1); }
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException) { /* voted twice at once */ }
        return Results.Ok(new { upvotes = post.Upvotes, upvoted = req.Up });
    }

    /// A comment, or a reply to one (ParentId). Whoever it answers is told (GroupPostReply).
    private static async Task<IResult> Comment(Guid id, CommentRequest req, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        var me = caller.GetUserId();
        var (post, g, member) = await PostAsync(db, id, me);
        if (post is null || g is null || await BlockedAsync(db, me, post.AuthorId)) return Gone();
        var (can, why) = CanComment(g, post, member, true);
        if (!can) return Results.Json(new { error = why }, statusCode: 403);
        var now = clock.GetUtcNow().UtcDateTime;
        if (member?.MutedUntil > now) return Results.Json(new { error = "A moderator muted you in this group for now." }, statusCode: 403);
        var body = Clean(req.Body, 5000);
        if (body is null) return Results.BadRequest(new { error = "Write something first." });
        GroupComment? parent = null;
        if (req.ParentId is { } pid && (parent = await db.GroupComments.FirstOrDefaultAsync(c => c.Id == pid && c.PostId == id)) is null)
            return Results.NotFound(new { error = "That comment has gone." });
        if (await db.GroupComments.CountAsync(c => c.PostId == id) >= MaxComments) return Results.BadRequest(new { error = "This post has as many comments as it can take." });
        var comment = new GroupComment { PostId = id, ParentId = parent?.Id, AuthorId = me, Body = body, CreatedAt = now };
        db.GroupComments.Add(comment);
        post.CommentCount++;
        post.LastActivityAt = now;
        var answered = parent?.AuthorId ?? post.AuthorId;
        if (answered is { } to && to != me && parent?.DeletedAt is null)
            db.Notifications.Add(new Notification { UserId = to, ActorId = me, Type = NotificationType.GroupPostReply, GroupId = g.Id, GroupPostId = id, GroupCommentId = comment.Id, CreatedAt = now });
        await db.SaveChangesAsync();
        return Results.Ok((await CommentsAsync(db, post, g, me)).First(c => c.Id == comment.Id));
    }

    private static async Task<IResult> EditComment(Guid id, CommentRequest req, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        var me = caller.GetUserId();
        var c = await db.GroupComments.FirstOrDefaultAsync(x => x.Id == id && x.AuthorId == me && x.DeletedAt == null);
        if (c is null) return Gone();
        var body = Clean(req.Body, 5000);
        if (body is null) return Results.BadRequest(new { error = "Write something, or delete it instead." });
        (c.Body, c.EditedAt) = (body, clock.GetUtcNow().UtcDateTime);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    /// The author deletes it, or a moderator removes it; its replies stay under "deleted".
    private static async Task<IResult> DeleteComment(Guid id, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        var me = caller.GetUserId();
        var c = await db.GroupComments.Include(x => x.Post).FirstOrDefaultAsync(x => x.Id == id && x.DeletedAt == null);
        if (c is null) return Gone();
        var mod = c.AuthorId != me;
        if (mod)
        {
            var member = await db.GroupMembers.FirstOrDefaultAsync(m => m.GroupId == c.Post.GroupId && m.UserId == me);
            if (member is null || !GroupEndpoints.CanModerate(member)) return Gone();
        }
        var now = clock.GetUtcNow().UtcDateTime;
        (c.Body, c.DeletedAt, c.RemovedByModerator) = ("", now, mod);
        await db.SaveChangesAsync();
        await db.Reports.Where(r => r.GroupId == c.Post.GroupId && r.TargetId == c.Id && r.GroupResolvedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.GroupResolvedAt, (DateTime?)now));
        return Results.NoContent();
    }

    private static async Task<IResult> VoteComment(Guid id, VoteRequest req, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var c = await db.GroupComments.FirstOrDefaultAsync(x => x.Id == id && x.DeletedAt == null);
        if (c is null) return Gone();
        var (post, _, _) = await PostAsync(db, c.PostId, me);
        if (post is null) return Gone();
        var vote = await db.GroupVotes.FirstOrDefaultAsync(v => v.UserId == me && v.CommentId == id);
        if (req.Up && vote is null) { db.GroupVotes.Add(new GroupVote { UserId = me, PostId = c.PostId, CommentId = id }); c.Upvotes++; }
        else if (!req.Up && vote is not null) { db.GroupVotes.Remove(vote); c.Upvotes = Math.Max(0, c.Upvotes - 1); }
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException) { /* voted twice at once */ }
        return Results.Ok(new { upvotes = c.Upvotes, upvoted = req.Up });
    }

    /// Social › Search › Posts (canvas Q5): posts in findable groups and your own, by title or text.
    private static async Task<IResult> Search(string? q, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var term = (q ?? "").Trim().ToLowerInvariant();
        if (term.Length < 2) return Results.Ok(Array.Empty<PostDto>());
        var words = term.Split(' ', StringSplitOptions.RemoveEmptyEntries).Take(5).ToList();
        var query = db.GroupPosts.Include(p => p.Author).Include(p => p.Group).Where(p => p.DeletedAt == null && p.Group.PostsOn
            && (p.Group.Access != GroupAccess.InviteOnly || db.GroupMembers.Any(m => m.GroupId == p.GroupId && m.UserId == me))
            && !db.Blocks.Any(b => (b.BlockerId == me && b.BlockedId == p.AuthorId) || (b.BlockerId == p.AuthorId && b.BlockedId == me)));
        foreach (var w in words)
            query = query.Where(p => p.Title.ToLower().Contains(w) || p.Body.ToLower().Contains(w) || p.Group.Name.ToLower().Contains(w)
                || (p.Group.Place != null && p.Group.Place.ToLower().Contains(w)) || p.Kind.ToLower().Contains(w));
        var posts = await query.OrderByDescending(p => p.Upvotes + p.CommentCount).ThenByDescending(p => p.LastActivityAt).Take(30).ToListAsync();
        var result = new List<PostDto>();
        foreach (var byGroup in posts.GroupBy(p => p.GroupId))
        {
            var member = await db.GroupMembers.FirstOrDefaultAsync(m => m.GroupId == byGroup.Key && m.UserId == me);
            result.AddRange(await PostDtosAsync(db, [.. byGroup], byGroup.First().Group, member, me));
        }
        return Results.Ok(result.OrderByDescending(p => p.Upvotes + p.CommentCount).ThenByDescending(p => p.LastActivityAtMs));
    }

    /// The public page (canvas Q6): only posts written while the group showed posts on the web,
    /// still on and still findable. {postSlug} ends with the post id's first 8 characters.
    private static async Task<IResult> PublicThread(string slug, string postSlug, AppDbContext db)
    {
        var g = await db.Groups.FirstOrDefaultAsync(x => x.Slug == slug && x.PostsOn && x.PostsOnWeb && x.Access != GroupAccess.InviteOnly);
        if (g is null) return Results.NotFound();
        var shortId = postSlug.Length >= 8 ? postSlug[^8..] : "";
        var candidates = await db.GroupPosts.Include(p => p.Author).Where(p => p.GroupId == g.Id && p.OnWeb && p.DeletedAt == null).ToListAsync();
        var post = candidates.FirstOrDefault(p => p.Id.ToString("N")[..8] == shortId);
        if (post is null) return Results.NotFound();
        return Results.Ok(new ThreadDto((await PostDtosAsync(db, [post], g, null, null))[0], await CommentsAsync(db, post, g, null)));
    }

    /// For the website's sitemap: every post that's on the web, newest activity first.
    private static async Task<IResult> PublicIndex(AppDbContext db)
    {
        var rows = await db.GroupPosts.Where(p => p.OnWeb && p.DeletedAt == null && p.Group.PostsOn && p.Group.PostsOnWeb && p.Group.Access != GroupAccess.InviteOnly && p.Group.Slug != "")
            .OrderByDescending(p => p.LastActivityAt).Take(5000)
            .Select(p => new { GroupSlug = p.Group.Slug, p.Slug, p.Id, p.LastActivityAt }).ToListAsync();
        return Results.Ok(rows.Select(r => new { path = WebPath(r.GroupSlug, r.Slug, r.Id), lastModMs = Ms(r.LastActivityAt) }));
    }

    public static string WebPath(string groupSlug, string postSlug, Guid id) => $"/g/{groupSlug}/{postSlug}-{id.ToString("N")[..8]}";
}
