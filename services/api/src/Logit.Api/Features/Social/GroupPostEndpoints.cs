using System.Security.Claims;
using System.Text;
using Regex = System.Text.RegularExpressions.Regex;
using GeneratedRegexAttribute = System.Text.RegularExpressions.GeneratedRegexAttribute;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Photos;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Social;

/// The Forum (design canvas row 19; Martin, 25 Nov), Reddit-style. Anyone signed in posts, group
/// or no group; a group is an optional label, and a group's Posts tab is the Forum filtered to it.
/// Anyone can read a post, here and on the web (/public/...), except one labelled with an
/// invite-only group: that stays with the group's members, never in the Forum, tags or the web.
/// Upvotes only; comments nest. Moderators (the group's for a labelled post, LogIt's for any) pin,
/// lock, remove posts and comments, and take a tag off a post.
public static partial class GroupPostEndpoints
{
    public const int MaxComments = 3000;

    public static void MapGroupPostEndpoints(this IEndpointRouteBuilder app)
    {
        var f = app.MapGroup("/forum").WithTags("Social").RequireAuthorization();
        f.MapGet("/", List);
        f.MapPost("/", Create).RequireRateLimiting("social-write");
        f.MapGet("/search", Search);
        f.MapGet("/{id:guid}", Thread);
        f.MapPatch("/{id:guid}", Edit);
        f.MapDelete("/{id:guid}", Delete);
        f.MapPut("/{id:guid}/vote", VotePost);
        f.MapPost("/{id:guid}/comments", Comment).RequireRateLimiting("social-write");
        f.MapPut("/{id:guid}/moderation", Moderate);
        var c = app.MapGroup("/forum-comments").WithTags("Social").RequireAuthorization();
        c.MapPatch("/{id:guid}", EditComment);
        c.MapDelete("/{id:guid}", DeleteComment);
        c.MapPut("/{id:guid}/vote", VoteComment);
        // The web, signed out: read only.
        var pub = app.MapGroup("/public").WithTags("Public").AllowAnonymous().RequireRateLimiting("public-read");
        pub.MapGet("/forum/{postSlug}", PublicThread);
        pub.MapGet("/forum", PublicIndex);
        pub.MapGet("/tags/{tag}", PublicTag);
    }

    public record PersonDto(string Username, string DisplayName, string? AvatarUrl, Guid Id);
    public record GroupBriefDto(Guid Id, string Name, string Kind, string? Place, string? PhotoUrl, int Members, string Access);
    /// Deleted: removed by its author or (RemovedByModerator) a moderator; its content is gone.
    /// AuthorIsMember/AuthorRole: in the group it's labelled with. OnWeb: anyone can read it.
    public record PostDto(Guid Id, GroupBriefDto? Group, PersonDto? Author, bool AuthorIsMember, string? AuthorRole, string Title, string Body, List<string> Tags,
        string? PhotoUrl, int PhotoWidth, int PhotoHeight, string? CardType, string? CardJson, int Upvotes, bool Upvoted, int CommentCount,
        long CreatedAtMs, long LastActivityAtMs, bool Edited, bool Deleted, bool RemovedByModerator, bool Pinned, bool Locked, bool OnWeb, string WebPath,
        bool Mine, bool CanComment, string? WhyNot, bool CanModerate);
    public record CommentDto(Guid Id, Guid? ParentId, PersonDto? Author, bool AuthorIsMember, string? AuthorRole, string Body, int Upvotes, bool Upvoted,
        long CreatedAtMs, bool Edited, bool Deleted, bool RemovedByModerator, bool Mine);
    public record ThreadDto(PostDto Post, List<CommentDto> Comments);
    public record CreateRequest(string Title, string? Body, List<string>? Tags, Guid? GroupId, Guid? PhotoId, string? CardType, string? CardJson);
    public record EditRequest(string? Title, string? Body, List<string>? Tags);
    public record CommentRequest(string Body, Guid? ParentId);
    public record VoteRequest(bool Up);
    public record ModerationRequest(bool? Pinned, bool? Locked, bool? Remove, string? RemoveTag);
    public record PublicTagDto(Hashtags.TagDto Tag, List<PostDto> Forum, List<Logit.Api.Features.PostDto> Posts);

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

    public static string WebPath(string postSlug, Guid id) => $"/forum/{postSlug}-{id.ToString("N")[..8]}";

    /// Posts `me` can read: all but those labelled with an invite-only group they're not in.
    private static IQueryable<GroupPost> Readable(AppDbContext db, Guid? me) => db.GroupPosts.Include(p => p.Author).Include(p => p.Group)
        .Where(p => p.GroupId == null || p.Group!.Access != GroupAccess.InviteOnly || (me != null && db.GroupMembers.Any(m => m.GroupId == p.GroupId && m.UserId == me)));

    /// The Forum, tags, search and the web: never posts labelled with an invite-only group.
    private static IQueryable<GroupPost> Open(AppDbContext db) => db.GroupPosts.Include(p => p.Author).Include(p => p.Group)
        .Where(p => p.GroupId == null || p.Group!.Access != GroupAccess.InviteOnly);

    private static IQueryable<GroupPost> NotBlocked(this IQueryable<GroupPost> q, AppDbContext db, Guid me) =>
        q.Where(p => !db.Blocks.Any(b => (b.BlockerId == me && b.BlockedId == p.AuthorId) || (b.BlockerId == p.AuthorId && b.BlockedId == me)));

    /// A group whose posts `me` can read and label: a member, or the group is findable.
    private static async Task<(Group? Group, GroupMember? Me)> ReaderAsync(AppDbContext db, Guid groupId, Guid me)
    {
        var g = await db.Groups.FirstOrDefaultAsync(x => x.Id == groupId);
        if (g is null) return (null, null);
        var member = await db.GroupMembers.FirstOrDefaultAsync(m => m.GroupId == groupId && m.UserId == me);
        return member is null && g.Access == GroupAccess.InviteOnly ? (null, null) : (g, member);
    }

    private static Task<bool> BlockedAsync(AppDbContext db, Guid me, Guid? other) =>
        other is null ? Task.FromResult(false)
            : db.Blocks.AnyAsync(b => (b.BlockerId == me && b.BlockedId == other) || (b.BlockerId == other && b.BlockedId == me));

    private static (bool Can, string? Why) CanComment(GroupPost p, bool signedIn) =>
        !signedIn ? (false, "Sign in to comment.")
        : p.DeletedAt is not null ? (false, "This post was removed.")
        : p.Locked ? (false, "Comments are locked.")
        : (true, null);

    private static Task<bool> IsAdminAsync(AppDbContext db, Guid me) => db.Users.AnyAsync(u => u.Id == me && u.IsAdmin);

    /// The group's organisers and moderators for a labelled post; LogIt's admins for any.
    private static async Task<bool> CanModerateAsync(AppDbContext db, GroupPost post, Guid me)
    {
        if (post.GroupId is { } gid && await db.GroupMembers.FirstOrDefaultAsync(m => m.GroupId == gid && m.UserId == me) is { } m && GroupEndpoints.CanModerate(m)) return true;
        return await IsAdminAsync(db, me);
    }

    /// Posts (with Author and Group loaded) as the app shows them to `meId` (null: the web).
    private static async Task<List<PostDto>> PostDtosAsync(AppDbContext db, List<GroupPost> posts, Guid? meId)
    {
        var groupIds = posts.Where(p => p.GroupId is not null).Select(p => p.GroupId!.Value).Distinct().ToList();
        var authorIds = posts.Where(p => p.AuthorId is not null).Select(p => p.AuthorId!.Value).Distinct().ToList();
        var counts = await db.GroupMembers.Where(m => groupIds.Contains(m.GroupId)).GroupBy(m => m.GroupId).Select(g => new { g.Key, N = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.N);
        var roles = await db.GroupMembers.Where(m => groupIds.Contains(m.GroupId) && authorIds.Contains(m.UserId)).Select(m => new { m.GroupId, m.UserId, m.Role }).ToListAsync();
        var mine = meId is { } me1 ? await db.GroupMembers.Where(m => m.UserId == me1 && groupIds.Contains(m.GroupId)).ToDictionaryAsync(m => m.GroupId) : [];
        var admin = meId is { } me2 && await IsAdminAsync(db, me2);
        var ids = posts.Select(p => p.Id).ToList();
        var upvoted = meId is { } uid ? (await db.GroupVotes.Where(v => v.UserId == uid && v.CommentId == null && ids.Contains(v.PostId)).Select(v => v.PostId).ToListAsync()).ToHashSet() : [];
        return [.. posts.Select(p =>
        {
            var gone = p.DeletedAt is not null;
            var (can, why) = CanComment(p, meId is not null);
            var role = roles.FirstOrDefault(r => r.GroupId == p.GroupId && r.UserId == p.AuthorId)?.Role;
            var g = p.Group;
            var brief = g is null ? null : new GroupBriefDto(g.Id, g.Name, g.Kind, g.Place, g.PhotoId is { } ph ? PhotoEndpoints.UrlOf(ph) : null, counts.GetValueOrDefault(g.Id), g.Access.ToString());
            var moderate = admin || (p.GroupId is { } gid && mine.TryGetValue(gid, out var m) && GroupEndpoints.CanModerate(m));
            return new PostDto(p.Id, brief, gone ? null : Person(p.Author), role is not null, role is GroupRole.Member or null ? null : role.ToString(),
                gone ? "" : p.Title, gone ? "" : p.Body, gone ? [] : Hashtags.Split(p.Tags), gone || p.PhotoId is null ? null : PhotoEndpoints.UrlOf(p.PhotoId.Value), p.PhotoWidth, p.PhotoHeight,
                gone ? null : p.CardType, gone ? null : p.CardJson, p.Upvotes, upvoted.Contains(p.Id), p.CommentCount, Ms(p.CreatedAt), Ms(p.LastActivityAt),
                p.EditedAt is not null, gone, p.RemovedByModerator, p.Pinned, p.Locked, g is null || g.Access != GroupAccess.InviteOnly, WebPath(p.Slug, p.Id),
                meId is not null && p.AuthorId == meId, can, why, moderate);
        })];
    }

    /// Active (latest comments first), New or Top; pinned first on a group's page.
    private static IQueryable<GroupPost> Sorted(IQueryable<GroupPost> q, string? sort, bool pinnedFirst)
    {
        var o = q.OrderByDescending(p => pinnedFirst && p.Pinned);
        return sort switch
        {
            "new" => o.ThenByDescending(p => p.CreatedAt),
            "top" => o.ThenByDescending(p => p.Upvotes).ThenByDescending(p => p.CommentCount).ThenByDescending(p => p.CreatedAt),
            _ => o.ThenByDescending(p => p.LastActivityAt),
        };
    }

    /// The Forum (F2), or one group's posts (F6), one tag's (F4) or one person's (F5). `skip` pages on.
    private static async Task<IResult> List(string? sort, int? skip, Guid? group, string? tag, string? user, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        IQueryable<GroupPost> q;
        if (group is { } gid)
        {
            if ((await ReaderAsync(db, gid, me)).Group is null) return Gone();
            // A removed post with replies keeps its place, so the replies aren't lost.
            q = db.GroupPosts.Include(p => p.Author).Include(p => p.Group).Where(p => p.GroupId == gid && (p.DeletedAt == null || p.CommentCount > 0));
        }
        else if (user is not null)
            q = Readable(db, me).Where(p => p.Author!.Username == user.ToLowerInvariant() && p.DeletedAt == null);
        else
            q = Open(db).Where(p => p.DeletedAt == null);
        if (tag is not null)
        {
            var t = Hashtags.Normalize(tag);
            q = q.Where(p => db.Hashtags.Any(h => h.ForumPostId == p.Id && h.Tag == t));
        }
        var posts = await Sorted(q.NotBlocked(db, me), sort, group is not null).Skip(Math.Max(0, skip ?? 0)).Take(30).ToListAsync();
        return Results.Ok(await PostDtosAsync(db, posts, me));
    }

    /// Title cards for the feed (canvas F1): forum posts by people you follow and in your groups,
    /// written in [after, before).
    public static async Task<List<PostDto>> FeedCardsAsync(AppDbContext db, Guid me, List<Guid> followed, List<Guid> blocked, DateTime? after, DateTime? before)
    {
        var q = Readable(db, me).Where(p => p.DeletedAt == null && p.AuthorId != null && !blocked.Contains(p.AuthorId.Value)
            && (followed.Contains(p.AuthorId.Value) || (p.GroupId != null && db.GroupMembers.Any(m => m.GroupId == p.GroupId && m.UserId == me))));
        if (after is not null) q = q.Where(p => p.CreatedAt >= after);
        if (before is not null) q = q.Where(p => p.CreatedAt < before);
        return await PostDtosAsync(db, await q.OrderByDescending(p => p.CreatedAt).Take(10).ToListAsync(), me);
    }

    private static async Task<IResult> Create(CreateRequest req, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        var me = caller.GetUserId();
        var now = clock.GetUtcNow().UtcDateTime;
        if (req.GroupId is { } gid)
        {
            var (g, member) = await ReaderAsync(db, gid, me);
            if (g is null) return Results.NotFound(new { error = "That group doesn't exist, or you can't post in it." });
            if (member?.MutedUntil > now) return Results.Json(new { error = "A moderator muted you in this group for now." }, statusCode: 403);
        }
        var title = Clean(req.Title, 200);
        if (title is null) return Results.BadRequest(new { error = "Give the post a title." });
        Photo? photo = null;
        if (req.PhotoId is { } pid && (photo = await PhotoEndpoints.OwnedAsync(db, me, pid)) is null)
            return Results.BadRequest(new { error = "That photo didn't upload. Try again." });
        if (req.CardType is not null && (!DirectMessageEndpoints.CardTypes.Contains(req.CardType) || req.CardJson is not { Length: > 0 and <= 4000 }))
            return Results.BadRequest(new { error = "That can't be shared in a post." });
        var post = new GroupPost
        {
            GroupId = req.GroupId, AuthorId = me, Title = title, Body = Clean(req.Body, 10000) ?? "", Slug = Slugify(title),
            PhotoId = photo?.Id, PhotoWidth = photo?.Width ?? 0, PhotoHeight = photo?.Height ?? 0, CardType = req.CardType, CardJson = req.CardType is null ? null : req.CardJson,
            CreatedAt = now, LastActivityAt = now,
        };
        db.GroupPosts.Add(post);
        await db.SetForForumAsync(post, Hashtags.Clean(req.Tags));
        await db.SaveChangesAsync();
        await db.Entry(post).Reference(p => p.Author).LoadAsync();
        await db.Entry(post).Reference(p => p.Group).LoadAsync();
        return Results.Ok((await PostDtosAsync(db, [post], me))[0]);
    }

    private static Task<GroupPost?> PostAsync(AppDbContext db, Guid id, Guid me) => Readable(db, me).FirstOrDefaultAsync(p => p.Id == id);

    /// The post and every comment (flat, each with its parent; the app builds the tree), top first.
    private static async Task<IResult> Thread(Guid id, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var post = await PostAsync(db, id, me);
        if (post is null || await BlockedAsync(db, me, post.AuthorId)) return Gone();
        return Results.Ok(new ThreadDto((await PostDtosAsync(db, [post], me))[0], await CommentsAsync(db, post, me)));
    }

    private static async Task<List<CommentDto>> CommentsAsync(AppDbContext db, GroupPost post, Guid? me)
    {
        var rows = await db.GroupComments.Include(c => c.Author).Where(c => c.PostId == post.Id)
            .OrderByDescending(c => c.Upvotes).ThenBy(c => c.CreatedAt).Take(MaxComments).ToListAsync();
        var blocked = me is { } uid
            ? (await db.Blocks.Where(b => b.BlockerId == uid || b.BlockedId == uid).Select(b => b.BlockerId == uid ? b.BlockedId : b.BlockerId).ToListAsync()).ToHashSet()
            : [];
        var authorIds = rows.Where(c => c.AuthorId is not null).Select(c => c.AuthorId!.Value).Distinct().ToList();
        var roles = post.GroupId is { } gid
            ? await db.GroupMembers.Where(m => m.GroupId == gid && authorIds.Contains(m.UserId)).ToDictionaryAsync(m => m.UserId, m => m.Role)
            : [];
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
        if (req.Tags is not null) await db.SetForForumAsync(post, Hashtags.Clean(req.Tags));
        post.EditedAt = clock.GetUtcNow().UtcDateTime;
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    /// The author deletes it, or a moderator removes it: content, tags and photo go; comments stay.
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
        await db.SetForForumAsync(post, []);
        await db.SaveChangesAsync(ct);
        if (post.GroupId is { } gid)
            await db.Reports.Where(r => r.GroupId == gid && r.TargetId == post.Id && r.GroupResolvedAt == null)
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
        var post = await PostAsync(db, id, me);
        if (post is null) return Gone();
        if (!await CanModerateAsync(db, post, me)) return Results.Json(new { error = "Only moderators can do that." }, statusCode: 403);
        // Pinning only means something on a group's page.
        if (req.Pinned is { } pin) post.Pinned = pin && post.DeletedAt is null && post.GroupId is not null;
        if (req.Locked is { } locked) post.Locked = locked;
        if (Hashtags.Normalize(req.RemoveTag) is { } tag && post.DeletedAt is null)
            await db.SetForForumAsync(post, [.. Hashtags.Split(post.Tags).Where(t => t != tag)]);
        if (req.Remove == true && post.DeletedAt is null) await RemovePostAsync(db, store, post, true, clock.GetUtcNow().UtcDateTime, ct);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> VotePost(Guid id, VoteRequest req, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var post = await PostAsync(db, id, me);
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
        var post = await PostAsync(db, id, me);
        if (post is null || await BlockedAsync(db, me, post.AuthorId)) return Gone();
        var (can, why) = CanComment(post, true);
        if (!can) return Results.Json(new { error = why }, statusCode: 403);
        var now = clock.GetUtcNow().UtcDateTime;
        if (post.GroupId is { } gid && await db.GroupMembers.AnyAsync(m => m.GroupId == gid && m.UserId == me && m.MutedUntil > now))
            return Results.Json(new { error = "A moderator muted you in this group for now." }, statusCode: 403);
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
            db.Notifications.Add(new Notification { UserId = to, ActorId = me, Type = NotificationType.GroupPostReply, GroupId = post.GroupId, GroupPostId = id, GroupCommentId = comment.Id, CreatedAt = now });
        await db.SaveChangesAsync();
        return Results.Ok((await CommentsAsync(db, post, me)).First(c => c.Id == comment.Id));
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
        if (mod && !await CanModerateAsync(db, c.Post, me)) return Gone();
        var now = clock.GetUtcNow().UtcDateTime;
        (c.Body, c.DeletedAt, c.RemovedByModerator) = ("", now, mod);
        await db.SaveChangesAsync();
        if (c.Post.GroupId is { } gid)
            await db.Reports.Where(r => r.GroupId == gid && r.TargetId == c.Id && r.GroupResolvedAt == null)
                .ExecuteUpdateAsync(s => s.SetProperty(r => r.GroupResolvedAt, (DateTime?)now));
        return Results.NoContent();
    }

    private static async Task<IResult> VoteComment(Guid id, VoteRequest req, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var c = await db.GroupComments.FirstOrDefaultAsync(x => x.Id == id && x.DeletedAt == null);
        if (c is null || await PostAsync(db, c.PostId, me) is null) return Gone();
        var vote = await db.GroupVotes.FirstOrDefaultAsync(v => v.UserId == me && v.CommentId == id);
        if (req.Up && vote is null) { db.GroupVotes.Add(new GroupVote { UserId = me, PostId = c.PostId, CommentId = id }); c.Upvotes++; }
        else if (!req.Up && vote is not null) { db.GroupVotes.Remove(vote); c.Upvotes = Math.Max(0, c.Upvotes - 1); }
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException) { /* voted twice at once */ }
        return Results.Ok(new { upvotes = c.Upvotes, upvoted = req.Up });
    }

    /// Social › Search › Forum: by title, text, tag or group; "#sligo" is that tag.
    private static async Task<IResult> Search(string? q, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var term = (q ?? "").Trim().ToLowerInvariant();
        if (term.Length < 2) return Results.Ok(Array.Empty<PostDto>());
        var query = Open(db).Where(p => p.DeletedAt == null).NotBlocked(db, me);
        if (term.StartsWith('#'))
        {
            var t = Hashtags.Normalize(term);
            query = query.Where(p => db.Hashtags.Any(h => h.ForumPostId == p.Id && h.Tag == t));
        }
        else
            foreach (var w in term.Split(' ', StringSplitOptions.RemoveEmptyEntries).Take(5))
                query = query.Where(p => p.Title.ToLower().Contains(w) || p.Body.ToLower().Contains(w) || p.Tags.Contains(w)
                    || (p.Group != null && p.Group.Name.ToLower().Contains(w)));
        var posts = await query.OrderByDescending(p => p.Upvotes + p.CommentCount).ThenByDescending(p => p.LastActivityAt).Take(30).ToListAsync();
        return Results.Ok(await PostDtosAsync(db, posts, me));
    }

    /// The public page. {postSlug} is the title's slug, a dash, and the post id's first 8 characters.
    private static async Task<IResult> PublicThread(string postSlug, AppDbContext db)
    {
        if (postSlug.Length < 10 || postSlug[^9] != '-') return Results.NotFound();
        var (slug, shortId) = (postSlug[..^9], postSlug[^8..]);
        var candidates = await Open(db).Where(p => p.Slug == slug && p.DeletedAt == null).ToListAsync();
        var post = candidates.FirstOrDefault(p => p.Id.ToString("N")[..8] == shortId);
        if (post is null) return Results.NotFound();
        return Results.Ok(new ThreadDto((await PostDtosAsync(db, [post], null))[0], await CommentsAsync(db, post, null)));
    }

    /// For the website's sitemap: every post on the web, newest activity first.
    private static async Task<IResult> PublicIndex(AppDbContext db)
    {
        var rows = await db.GroupPosts.Where(p => p.DeletedAt == null && (p.GroupId == null || p.Group!.Access != GroupAccess.InviteOnly))
            .OrderByDescending(p => p.LastActivityAt).Take(5000).Select(p => new { p.Slug, p.Id, p.LastActivityAt }).ToListAsync();
        return Results.Ok(rows.Select(r => new { path = WebPath(r.Slug, r.Id), lastModMs = Ms(r.LastActivityAt) }));
    }

    /// getlogit.app/t/{tag} (F4): its top forum posts, and the latest posts from public accounts.
    private static async Task<IResult> PublicTag(string tag, AppDbContext db)
    {
        var t = Hashtags.Normalize(tag);
        if (t is null) return Results.NotFound();
        var forum = await Sorted(Open(db).Where(p => p.DeletedAt == null && db.Hashtags.Any(h => h.ForumPostId == p.Id && h.Tag == t)), "top", false).Take(30).ToListAsync();
        var posts = await Hashtags.TaggedPosts(db, t).Where(p => !p.Author.IsPrivate).OrderByDescending(p => p.CreatedAt).Take(12).ToListAsync();
        if (forum.Count == 0 && posts.Count == 0) return Results.NotFound();
        var hidden = await db.HiddenRepostAuthorsAsync(null, posts);
        return Results.Ok(new PublicTagDto(await Hashtags.AboutAsync(db, t),
            await PostDtosAsync(db, forum, null), [.. posts.Select(p => p.ToDto(null, hidden))]));
    }

    /// A public profile's Forum section on the web (F5).
    public static async Task<List<PostDto>> PublicByAuthorAsync(AppDbContext db, Guid authorId, int take) =>
        await PostDtosAsync(db, await Open(db).Where(p => p.AuthorId == authorId && p.DeletedAt == null).OrderByDescending(p => p.CreatedAt).Take(take).ToListAsync(), null);
}
