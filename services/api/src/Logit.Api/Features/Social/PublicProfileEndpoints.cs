using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Social;

/// People's own profiles and posts on the web, signed out (design canvas row 18). Public means
/// public everywhere (Martin, 25 Nov): a public account's profile and posts are readable at
/// getlogit.app/@name, a private one's never are. A private account, a sample account and a name
/// nobody has all get the same 404, so the page never says which. Only name, photo, bio, counts,
/// posts, forum posts and the training cards they chose to show (design canvas PR5): never stories, follow lists or anything else.
public static class PublicProfileEndpoints
{
    public record ProfileDto(string Username, string DisplayName, string? Bio, string? AvatarUrl, int Posts, int Followers, int Following, string? PublicProfileJson = null,
        Coach.CoachProfileEndpoints.CoachingSectionDto? Coaching = null);
    public record ProfilePageDto(ProfileDto Profile, List<PostDto> Posts, List<GroupPostEndpoints.PostDto> Forum);
    public record PostPageDto(ProfileDto Profile, PostDto Post, List<CommentDto> Comments, List<PostDto> More);

    public static void MapPublicProfileEndpoints(this IEndpointRouteBuilder app)
    {
        var pub = app.MapGroup("/public").WithTags("Public").AllowAnonymous().RequireRateLimiting("public-read");
        pub.MapGet("/users/{username}", Profile);
        pub.MapGet("/users/{username}/posts/{id:guid}", Post);
        pub.MapGet("/users", Index);
    }

    private static Task<User?> PublicUserAsync(AppDbContext db, string username) =>
        db.Users.FirstOrDefaultAsync(u => u.Username == username.ToLowerInvariant() && !u.IsPrivate && !u.IsSample);

    private static IQueryable<Post> PostsOf(AppDbContext db, Guid userId) => db.Posts
        .Include(p => p.Author).Include(p => p.Likes).Include(p => p.Comments)
        .Include(p => p.RepostOf!).ThenInclude(r => r.Author)
        .Include(p => p.RepostOf!).ThenInclude(r => r.Likes)
        .Include(p => p.RepostOf!).ThenInclude(r => r.Comments)
        .Where(p => p.AuthorId == userId && p.DeletedAt == null);

    private static async Task<ProfileDto> ProfileOfAsync(AppDbContext db, User u) => new(u.Username, u.DisplayName, u.Bio, u.AvatarUrl,
        await db.Posts.CountAsync(p => p.AuthorId == u.Id && p.DeletedAt == null),
        await db.Follows.CountAsync(f => f.FollowedId == u.Id), await db.Follows.CountAsync(f => f.FollowerId == u.Id),
        u.PublicProfileJson);

    /// Reposts of a private account's post come back Unavailable, as for anyone signed out.
    private static async Task<List<PostDto>> DtosAsync(AppDbContext db, List<Post> rows)
    {
        var hidden = await db.HiddenRepostAuthorsAsync(null, rows);
        return [.. rows.Select(p => p.ToDto(null, hidden))];
    }

    private static async Task<IResult> Profile(string username, AppDbContext db, IConfiguration config)
    {
        var user = await PublicUserAsync(db, username);
        if (user is null) return Results.NotFound();
        var rows = await PostsOf(db, user.Id).OrderByDescending(p => p.CreatedAt).Take(12).ToListAsync();
        var profile = await ProfileOfAsync(db, user) with { Coaching = await Coach.CoachProfileEndpoints.SectionAsync(db, user, config, DateTime.UtcNow) };
        return Results.Ok(new ProfilePageDto(profile, await DtosAsync(db, rows), await GroupPostEndpoints.PublicByAuthorAsync(db, user.Id, 10)));
    }

    private static async Task<IResult> Post(string username, Guid id, AppDbContext db)
    {
        var user = await PublicUserAsync(db, username);
        if (user is null) return Results.NotFound();
        var post = await PostsOf(db, user.Id).FirstOrDefaultAsync(p => p.Id == id);
        if (post is null) return Results.NotFound();
        // A plain repost's comments live on the original; none if that author is private.
        var sharedId = await db.SharedPostIdAsync(post.Id);
        var comments = sharedId != post.Id && post.RepostOf?.Author.IsPrivate == true ? [] : await db.Comments
            .Include(c => c.Author).Include(c => c.Likes)
            .Where(c => c.PostId == sharedId && c.DeletedAt == null)
            .OrderBy(c => c.CreatedAt).Take(300).ToListAsync();
        var more = await PostsOf(db, user.Id).Where(p => p.Id != id).OrderByDescending(p => p.CreatedAt).Take(3).ToListAsync();
        return Results.Ok(new PostPageDto(await ProfileOfAsync(db, user), (await DtosAsync(db, [post]))[0],
            [.. comments.Select(c => c.ToDto(null))], await DtosAsync(db, more)));
    }

    /// For the website's sitemap: public accounts that have posted, latest post first.
    private static async Task<IResult> Index(AppDbContext db)
    {
        var rows = await db.Posts.Where(p => p.DeletedAt == null && !p.Author.IsPrivate && !p.Author.IsSample)
            .GroupBy(p => p.Author.Username).Select(g => new { Username = g.Key, Last = g.Max(p => p.CreatedAt) })
            .OrderByDescending(r => r.Last).Take(5000).ToListAsync();
        return Results.Ok(rows.Select(r => new { path = $"/@{r.Username}", lastModMs = new DateTimeOffset(DateTime.SpecifyKind(r.Last, DateTimeKind.Utc)).ToUnixTimeMilliseconds() }));
    }
}
