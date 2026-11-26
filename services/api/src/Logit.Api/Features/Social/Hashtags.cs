using System.Security.Claims;
using Regex = System.Text.RegularExpressions.Regex;
using GeneratedRegexAttribute = System.Text.RegularExpressions.GeneratedRegexAttribute;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Social;

/// #tags (design canvas F3, F4; Martin, 25 Nov: tags instead of place and topic chips). Forum
/// posts carry a list; regular posts carry whatever #words their text has. #Sligo = #sligo; at
/// most 10 a post. Tag pages, suggestions and trending read the Hashtags table.
public static partial class Hashtags
{
    public const int Max = 10;

    [GeneratedRegex(@"(?<![\p{L}\p{N}_&/])#([\p{L}\p{N}_]{1,40})")]
    private static partial Regex InText();

    [GeneratedRegex(@"^[\p{L}\p{N}_]{1,40}$")]
    private static partial Regex Valid();

    /// "#Sligo" or "Sligo" → "sligo"; null when it isn't a tag.
    public static string? Normalize(string? raw)
    {
        var t = (raw ?? "").Trim().TrimStart('#').ToLowerInvariant();
        return Valid().IsMatch(t) ? t : null;
    }

    public static List<string> Clean(IEnumerable<string>? raw) =>
        [.. (raw ?? []).Select(Normalize).OfType<string>().Distinct().Take(Max)];

    public static List<string> FromText(string? text) =>
        text is null ? [] : Clean(InText().Matches(text).Select(m => m.Groups[1].Value));

    /// Replaces a regular post's tags with the ones in its text. Caller saves.
    public static async Task SetForPostAsync(this AppDbContext db, Post post)
    {
        await db.Hashtags.Where(h => h.PostId == post.Id).ExecuteDeleteAsync();
        if (post.DeletedAt is not null) return;
        foreach (var t in FromText(post.Body)) db.Hashtags.Add(new Hashtag { Tag = t, PostId = post.Id, CreatedAt = post.CreatedAt });
    }

    /// Replaces a forum post's tags (and its Tags column). Caller saves.
    public static async Task SetForForumAsync(this AppDbContext db, GroupPost post, List<string> tags)
    {
        post.Tags = string.Join(' ', tags);
        if (db.Entry(post).State != EntityState.Added) await db.Hashtags.Where(h => h.ForumPostId == post.Id).ExecuteDeleteAsync();
        if (post.DeletedAt is not null) return;
        foreach (var t in tags) db.Hashtags.Add(new Hashtag { Tag = t, ForumPostId = post.Id, CreatedAt = post.CreatedAt });
    }

    public static List<string> Split(string tags) => [.. tags.Split(' ', StringSplitOptions.RemoveEmptyEntries)];

    public record TagCountDto(string Tag, int Count);

    /// Tags anyone may know about: not on a forum post in an invite-only group, nor on a private
    /// account's post. Counts, suggestions and trending read only these.
    public static IQueryable<Hashtag> Public(AppDbContext db) => db.Hashtags.Where(h =>
        (h.ForumPostId == null || db.GroupPosts.Any(p => p.Id == h.ForumPostId && (p.GroupId == null || p.Group!.Access != GroupAccess.InviteOnly)))
        && (h.PostId == null || db.Posts.Any(p => p.Id == h.PostId && !p.Author.IsPrivate)));
    public record TagDto(string Tag, int ForumPosts, int Posts);

    public static void MapTagEndpoints(this IEndpointRouteBuilder app)
    {
        var t = app.MapGroup("/tags").WithTags("Social").RequireAuthorization();
        t.MapGet("/", Suggest);
        t.MapGet("/trending", Trending);
        t.MapGet("/{tag}", About);
        t.MapGet("/{tag}/posts", Posts);
    }

    /// While typing "#sl": tags already in use that start with it, most-used first (so #sligo
    /// doesn't become ten spellings).
    private static async Task<IResult> Suggest(string? q, AppDbContext db)
    {
        var prefix = Normalize(q);
        if (prefix is null) return Results.Ok(Array.Empty<TagCountDto>());
        return Results.Ok(await SuggestAsync(db, prefix));
    }

    public static Task<List<TagCountDto>> SuggestAsync(AppDbContext db, string prefix, int take = 8) => Counted(Public(db).Where(h => h.Tag.StartsWith(prefix)), take);

    /// The Forum tab's row (F2): the most-used tags this week, topped up with all-time ones.
    private static async Task<IResult> Trending(AppDbContext db, TimeProvider clock) => Results.Ok(await TrendingAsync(db, clock.GetUtcNow().UtcDateTime));

    public static async Task<List<TagCountDto>> TrendingAsync(AppDbContext db, DateTime now, int take = 10)
    {
        var week = await Counted(Public(db).Where(h => h.CreatedAt >= now.AddDays(-7)), take);
        if (week.Count < take) week.AddRange((await Counted(Public(db), take * 2)).Where(x => week.All(w => w.Tag != x.Tag)).Take(take - week.Count));
        return week;
    }

    /// The most-used tags in `rows`, most first.
    private static async Task<List<TagCountDto>> Counted(IQueryable<Hashtag> rows, int take) =>
        [.. (await rows.GroupBy(h => h.Tag).Select(g => new { g.Key, N = g.Count() }).OrderByDescending(x => x.N).ThenBy(x => x.Key).Take(take).ToListAsync())
            .Select(x => new TagCountDto(x.Key, x.N))];

    private static async Task<IResult> About(string tag, AppDbContext db)
    {
        var t = Normalize(tag);
        if (t is null) return Results.NotFound();
        return Results.Ok(await AboutAsync(db, t));
    }

    public static async Task<TagDto> AboutAsync(AppDbContext db, string tag)
    {
        var rows = Public(db).Where(h => h.Tag == tag);
        return new TagDto(tag, await rows.CountAsync(h => h.ForumPostId != null), await rows.CountAsync(h => h.PostId != null));
    }

    /// Regular posts with the tag that the caller can see (F4's Posts tab), newest first.
    private static async Task<IResult> Posts(string tag, ClaimsPrincipal caller, AppDbContext db, [FromQuery] string? cursor = null)
    {
        var t = Normalize(tag);
        if (t is null) return Results.NotFound();
        var me = caller.GetUserId();
        var blocked = await db.BlockedUserIdsAsync(me);
        var query = TaggedPosts(db, t).Where(p => !blocked.Contains(p.AuthorId)
            && (!p.Author.IsPrivate || p.AuthorId == me || db.Follows.Any(f => f.FollowerId == me && f.FollowedId == p.AuthorId)));
        if (SocialQueryHelpers.DecodeCursor(cursor) is { } before) query = query.Where(p => p.CreatedAt < before);
        return Results.Ok(await SocialEndpoints.PageAsync(db, query, 20, me));
    }

    /// Posts with the tag, with what a post card needs loaded.
    public static IQueryable<Post> TaggedPosts(AppDbContext db, string tag) =>
        db.Posts.Include(p => p.Author).Include(p => p.Likes).Include(p => p.Comments)
            .Include(p => p.RepostOf!).ThenInclude(r => r.Author)
            .Include(p => p.RepostOf!).ThenInclude(r => r.Likes)
            .Include(p => p.RepostOf!).ThenInclude(r => r.Comments)
            .Where(p => p.DeletedAt == null && !p.Author.IsSample && db.Hashtags.Any(h => h.PostId == p.Id && h.Tag == tag));
}
