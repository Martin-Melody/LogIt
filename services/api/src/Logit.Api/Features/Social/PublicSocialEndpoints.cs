using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Photos;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Social;

/// Social on getlogit.app for people who aren't signed in (design canvas row 20; Martin, 26 Nov:
/// "like what Twitter or Facebook already do"): browse everything public, sign in to take part.
/// Explore is Discover's posts (public accounts in Discover); the Forum is every forum post outside
/// invite-only groups; search finds tags, public accounts, groups anyone can find and forum posts;
/// a group anyone can find has a page. Never private accounts, sample accounts or invite-only groups.
public static class PublicSocialEndpoints
{
    public record PersonDto(string Username, string DisplayName, string? AvatarUrl, string? Bio);
    public record RailDto(List<Hashtags.TagCountDto> Trending, List<PersonDto> People);
    public record GroupCardDto(Guid Id, string Name, string Kind, string? Place, string? PhotoUrl, int Members, string Access, string WebPath);
    public record EventDto(Guid Id, string Title, string Kind, long StartsAtMs, string? Place, int Going);
    public record GroupPageDto(GroupCardDto Group, string? Organiser, List<EventDto> Events, List<GroupPostEndpoints.PostDto> Posts);
    public record SearchDto(List<Hashtags.TagCountDto> Tags, List<PersonDto> People, List<GroupCardDto> Groups,
        List<GroupPostEndpoints.PostDto> Forum, List<Logit.Api.Features.PostDto> Posts);

    public static void MapPublicSocialEndpoints(this IEndpointRouteBuilder app)
    {
        var pub = app.MapGroup("/public").WithTags("Public").AllowAnonymous().RequireRateLimiting("public-read");
        pub.MapGet("/explore", Explore);
        pub.MapGet("/forum-list", ForumList);
        pub.MapGet("/rail", Rail);
        pub.MapGet("/search", Search);
        pub.MapGet("/groups", Groups);
        pub.MapGet("/groups/{groupSlug}", GroupPage);
    }

    private static long Ms(DateTime t) => new DateTimeOffset(DateTime.SpecifyKind(t, DateTimeKind.Utc)).ToUnixTimeMilliseconds();
    public static string GroupWebPath(Group g) => $"/groups/{(g.Slug.Length > 0 ? g.Slug : GroupPostEndpoints.Slugify(g.Name))}-{g.Id.ToString("N")[..8]}";

    /// Public accounts that chose to be in Discover: Explore's posts and People to follow.
    private static IQueryable<User> Discoverable(AppDbContext db) => db.Users.Where(u => !u.IsPrivate && !u.IsSample && u.ShowInDiscover == true);

    private static IQueryable<Group> Findable(AppDbContext db) => db.Groups.Where(g => g.Access != GroupAccess.InviteOnly);

    private static async Task<List<GroupCardDto>> CardsAsync(AppDbContext db, List<Group> groups)
    {
        var ids = groups.Select(g => g.Id).ToList();
        var counts = await db.GroupMembers.Where(m => ids.Contains(m.GroupId)).GroupBy(m => m.GroupId).Select(x => new { x.Key, N = x.Count() }).ToDictionaryAsync(x => x.Key, x => x.N);
        return [.. groups.Select(g => new GroupCardDto(g.Id, g.Name, g.Kind, g.Place, g.PhotoId is { } ph ? PhotoEndpoints.UrlOf(ph) : null,
            counts.GetValueOrDefault(g.Id), g.Access.ToString(), GroupWebPath(g)))];
    }

    /// S1: Discover's posts, newest first.
    private static async Task<IResult> Explore(AppDbContext db, string? cursor = null)
    {
        var query = db.Posts.Include(p => p.Author).Include(p => p.Likes).Include(p => p.Comments)
            .Include(p => p.RepostOf!).ThenInclude(r => r.Author)
            .Include(p => p.RepostOf!).ThenInclude(r => r.Likes)
            .Include(p => p.RepostOf!).ThenInclude(r => r.Comments)
            .Where(p => p.DeletedAt == null && Discoverable(db).Any(u => u.Id == p.AuthorId));
        if (SocialQueryHelpers.DecodeCursor(cursor) is { } before) query = query.Where(p => p.CreatedAt < before);
        return Results.Ok(await SocialEndpoints.PageAsync(db, query, 20, null));
    }

    /// S2: the Forum.
    private static async Task<IResult> ForumList(AppDbContext db, string? sort = null, int skip = 0) =>
        Results.Ok(await GroupPostEndpoints.PublicListAsync(db, sort, skip, 30));

    /// The right column: Trending, and People to follow (most followed of those in Discover).
    private static async Task<IResult> Rail(AppDbContext db, TimeProvider clock)
    {
        var people = await Discoverable(db).Where(u => !u.HideFromSuggestions)
            .OrderByDescending(u => db.Follows.Count(f => f.FollowedId == u.Id)).ThenBy(u => u.Username).Take(3)
            .Select(u => new PersonDto(u.Username, u.DisplayName, u.AvatarUrl, u.Bio)).ToListAsync();
        return Results.Ok(new RailDto(await Hashtags.TrendingAsync(db, clock.GetUtcNow().UtcDateTime, 6), people));
    }

    /// S3: tags, public accounts, groups anyone can find, forum posts and Discover's posts.
    private static async Task<IResult> Search(AppDbContext db, string? q = null)
    {
        var term = (q ?? "").Trim().ToLowerInvariant();
        if (term.Length < 2) return Results.Ok(new SearchDto([], [], [], [], []));
        var words = term.TrimStart('#').Split(' ', StringSplitOptions.RemoveEmptyEntries).Take(5).ToList();
        var first = words.FirstOrDefault() ?? "";
        var tags = Hashtags.Normalize(first) is { } prefix ? await Hashtags.SuggestAsync(db, prefix, 6) : [];
        var people = term.StartsWith('#') ? [] : await db.Users.Where(u => !u.IsPrivate && !u.IsSample
                && (u.Username.Contains(first) || u.DisplayName.ToLower().Contains(first)))
            .OrderByDescending(u => db.Follows.Count(f => f.FollowedId == u.Id)).Take(20)
            .Select(u => new PersonDto(u.Username, u.DisplayName, u.AvatarUrl, u.Bio)).ToListAsync();
        var groupQuery = Findable(db);
        foreach (var w in words) groupQuery = groupQuery.Where(g => g.Name.ToLower().Contains(w) || (g.Place != null && g.Place.ToLower().Contains(w)));
        var groups = term.StartsWith('#') ? [] : await CardsAsync(db, await groupQuery.OrderBy(g => g.Name).Take(20).ToListAsync());
        var postQuery = db.Posts.Include(p => p.Author).Include(p => p.Likes).Include(p => p.Comments)
            .Include(p => p.RepostOf!).ThenInclude(r => r.Author)
            .Include(p => p.RepostOf!).ThenInclude(r => r.Likes)
            .Include(p => p.RepostOf!).ThenInclude(r => r.Comments)
            .Where(p => p.DeletedAt == null && p.Body != null && Discoverable(db).Any(u => u.Id == p.AuthorId));
        if (term.StartsWith('#')) postQuery = postQuery.Where(p => db.Hashtags.Any(h => h.PostId == p.Id && h.Tag == first));
        else foreach (var w in words) postQuery = postQuery.Where(p => p.Body!.ToLower().Contains(w));
        var posts = await postQuery.OrderByDescending(p => p.CreatedAt).Take(20).ToListAsync();
        var hidden = await db.HiddenRepostAuthorsAsync(null, posts);
        return Results.Ok(new SearchDto(tags, people, groups, await GroupPostEndpoints.PublicListAsync(db, "top", 0, 20, search: term),
            [.. posts.Select(p => p.ToDto(null, hidden))]));
    }

    /// The Groups page: groups anyone can find, biggest first, or by name or place.
    private static async Task<IResult> Groups(AppDbContext db, string? q = null)
    {
        var query = Findable(db);
        foreach (var w in (q ?? "").Trim().ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries).Take(5))
            query = query.Where(g => g.Name.ToLower().Contains(w) || (g.Place != null && g.Place.ToLower().Contains(w)));
        var groups = await query.OrderByDescending(g => db.GroupMembers.Count(m => m.GroupId == g.Id)).ThenBy(g => g.Name).Take(40).ToListAsync();
        return Results.Ok(await CardsAsync(db, groups));
    }

    /// S4: getlogit.app/groups/{slug}-{first 8 of id}. What it is, upcoming events and its forum
    /// posts. Never the chat, member names, the board or the invite code.
    private static async Task<IResult> GroupPage(string groupSlug, AppDbContext db, TimeProvider clock)
    {
        if (groupSlug.Length < 10 || groupSlug[^9] != '-') return Results.NotFound();
        var (slug, shortId) = (groupSlug[..^9], groupSlug[^8..]);
        var g = (await Findable(db).Where(x => x.Slug == slug || x.Slug == "").ToListAsync())
            .FirstOrDefault(x => x.Id.ToString("N")[..8] == shortId && (x.Slug == slug || GroupPostEndpoints.Slugify(x.Name) == slug));
        if (g is null) return Results.NotFound();
        if (g.Slug.Length == 0) { g.Slug = slug; await db.SaveChangesAsync(); }
        var now = clock.GetUtcNow().UtcDateTime;
        var events = (await db.GroupEvents.Where(e => e.GroupId == g.Id && e.CancelledAt == null && e.StartsAt >= now).OrderBy(e => e.StartsAt).Take(5)
            .Select(e => new { e.Id, e.Title, e.Kind, e.StartsAt, e.Place, Going = db.EventRsvps.Count(r => r.EventId == e.Id && r.Going == true) })
            .ToListAsync()).Select(e => new EventDto(e.Id, e.Title, e.Kind, Ms(e.StartsAt), e.Place, e.Going)).ToList();
        var organiser = await db.GroupMembers.Where(m => m.GroupId == g.Id && m.Role == GroupRole.Organiser).OrderBy(m => m.JoinedAt)
            .Select(m => m.User.DisplayName).FirstOrDefaultAsync();
        return Results.Ok(new GroupPageDto((await CardsAsync(db, [g]))[0], organiser, events,
            await GroupPostEndpoints.PublicListAsync(db, "active", 0, 30, groupId: g.Id)));
    }
}
