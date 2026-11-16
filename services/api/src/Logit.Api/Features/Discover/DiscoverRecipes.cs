using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Discover;

/// The recipes Discover knows, by name. Names are stored with every impression, so give a
/// changed recipe a new name (popular-week-v2) rather than editing one that's in use.
public static class DiscoverRecipes
{
    public static readonly IReadOnlyList<IDiscoverPostRecipe> Posts =
        [new FriendsOfFriendsRecipe(), new PopularThisWeekRecipe(), new NewAccountsRecipe()];

    public static readonly IReadOnlyList<IDiscoverPeopleRecipe> People =
        [new FriendsOfFriendsRecipe(), new PopularThisWeekRecipe(), new NewAccountsRecipe()];

    /// Hacker-News-style decay: newer counts more, and a day-old post needs about three
    /// times the interest of a fresh one to rank the same.
    public static double Decay(DateTime createdAt, DateTime now) =>
        1.0 / Math.Pow(Math.Max(0, (now - createdAt).TotalHours) + 2, 1.5);

    public static string Follows(string first, int others, string? who = null)
    {
        var subject = others switch
        {
            0 => first,
            1 => $"{first} and 1 other",
            _ => $"{first} and {others} others",
        };
        return who is null
            ? (others == 0 ? $"{subject} follows" : $"{subject} follow")
            : (others == 0 ? $"{subject} follows {who}" : $"{subject} follow {who}");
    }
}

/// People the viewer's follows follow, and what they posted lately.
public sealed class FriendsOfFriendsRecipe : IDiscoverPostRecipe, IDiscoverPeopleRecipe
{
    public string Name => "friends-of-friends";

    private static async Task<Dictionary<Guid, (int Count, string FirstName)>> SecondDegreeAsync(DiscoverContext ctx)
    {
        if (ctx.Following.Count == 0) return [];
        var following = ctx.Following.ToList();
        var rows = await ctx.Db.Follows
            .Where(f => following.Contains(f.FollowerId))
            .Select(f => new { f.FollowedId, f.Follower.DisplayName, f.CreatedAt })
            .ToListAsync();
        return rows
            .Where(r => !ctx.Excluded.Contains(r.FollowedId))
            .GroupBy(r => r.FollowedId)
            .ToDictionary(g => g.Key, g => (g.Count(), g.OrderByDescending(r => r.CreatedAt).First().DisplayName));
    }

    public async Task<IReadOnlyList<PostCandidate>> PickPostsAsync(DiscoverContext ctx, IQueryable<Post> posts, int max)
    {
        var fof = await SecondDegreeAsync(ctx);
        if (fof.Count == 0) return [];
        var authors = fof.Keys.ToList();
        var since = ctx.Now.AddDays(-14);
        var rows = await posts
            .Where(p => authors.Contains(p.AuthorId) && p.CreatedAt >= since)
            .Select(p => new { p.Id, p.AuthorId, p.CreatedAt, p.Author.DisplayName })
            .OrderByDescending(p => p.CreatedAt)
            .Take(max * 3)
            .ToListAsync();
        return rows
            .Select(p =>
            {
                var (count, first) = fof[p.AuthorId];
                return new PostCandidate(p.Id, p.AuthorId, count * DiscoverRecipes.Decay(p.CreatedAt, ctx.Now),
                    DiscoverRecipes.Follows(first, count - 1, p.DisplayName));
            })
            .OrderByDescending(c => c.Score)
            .Take(max)
            .ToList();
    }

    public async Task<IReadOnlyList<PersonCandidate>> PickPeopleAsync(DiscoverContext ctx, IQueryable<User> people, int max)
    {
        var fof = await SecondDegreeAsync(ctx);
        if (fof.Count == 0) return [];
        var ids = fof.Keys.ToList();
        var allowed = await people.Where(u => ids.Contains(u.Id)).Select(u => u.Id).ToListAsync();
        return allowed
            .Select(id => new PersonCandidate(id, fof[id].Count, DiscoverRecipes.Follows(fof[id].FirstName, fof[id].Count - 1)))
            .OrderByDescending(c => c.Score)
            .Take(max)
            .ToList();
    }
}

/// What got the most likes and comments this week, newer counting more.
public sealed class PopularThisWeekRecipe : IDiscoverPostRecipe, IDiscoverPeopleRecipe
{
    public string Name => "popular-week";
    private const string Reason = "Popular this week";

    /// The week's posts with their like and comment counts, ranked in memory (newest 2,000 at
    /// most; plenty for a server this size, and simple enough for SQLite and Postgres alike).
    private static async Task<List<(Guid Id, Guid AuthorId, DateTime CreatedAt, int Likes, int Comments)>> RecentAsync(
        DiscoverContext ctx, IQueryable<Post> posts)
    {
        var since = ctx.Now.AddDays(-7);
        var rows = await posts
            .Where(p => p.CreatedAt >= since)
            .OrderByDescending(p => p.CreatedAt)
            .Take(2000)
            .Select(p => new
            {
                p.Id, p.AuthorId, p.CreatedAt,
                Likes = p.Likes.Count,
                Comments = p.Comments.Count(c => c.DeletedAt == null),
            })
            .ToListAsync();
        return rows.Select(r => (r.Id, r.AuthorId, r.CreatedAt, r.Likes, r.Comments)).ToList();
    }

    public async Task<IReadOnlyList<PostCandidate>> PickPostsAsync(DiscoverContext ctx, IQueryable<Post> posts, int max)
    {
        var rows = await RecentAsync(ctx, posts);
        return rows
            .Select(p => new PostCandidate(p.Id, p.AuthorId,
                (p.Likes + 2 * p.Comments + 1) * DiscoverRecipes.Decay(p.CreatedAt, ctx.Now), Reason))
            .OrderByDescending(c => c.Score)
            .Take(max)
            .ToList();
    }

    public async Task<IReadOnlyList<PersonCandidate>> PickPeopleAsync(DiscoverContext ctx, IQueryable<User> people, int max)
    {
        // Posts don't have to be Discover-eligible here: a private account can still be suggested.
        var ids = people.Select(u => u.Id);
        var posts = ctx.Db.Posts.Where(p => p.DeletedAt == null && ids.Contains(p.AuthorId));
        var rows = await RecentAsync(ctx, posts);
        return rows
            .GroupBy(r => r.AuthorId)
            .Select(g => new PersonCandidate(g.Key, g.Sum(r => r.Likes + 2 * r.Comments), Reason))
            .Where(c => c.Score > 0)
            .OrderByDescending(c => c.Score)
            .Take(max)
            .ToList();
    }
}

/// Accounts from the last 30 days, so new people get a first few followers.
public sealed class NewAccountsRecipe : IDiscoverPostRecipe, IDiscoverPeopleRecipe
{
    public string Name => "new-accounts";
    private const string Reason = "New to LogIt";

    public async Task<IReadOnlyList<PostCandidate>> PickPostsAsync(DiscoverContext ctx, IQueryable<Post> posts, int max)
    {
        var joinedSince = ctx.Now.AddDays(-30);
        var since = ctx.Now.AddDays(-14);
        var rows = await posts
            .Where(p => p.Author.CreatedAt >= joinedSince && p.CreatedAt >= since)
            .OrderByDescending(p => p.CreatedAt)
            .Select(p => new { p.Id, p.AuthorId, p.CreatedAt })
            .Take(max)
            .ToListAsync();
        return rows.Select(p => new PostCandidate(p.Id, p.AuthorId, DiscoverRecipes.Decay(p.CreatedAt, ctx.Now), Reason)).ToList();
    }

    public async Task<IReadOnlyList<PersonCandidate>> PickPeopleAsync(DiscoverContext ctx, IQueryable<User> people, int max)
    {
        var joinedSince = ctx.Now.AddDays(-30);
        var rows = await people
            .Where(u => u.CreatedAt >= joinedSince)
            .OrderByDescending(u => u.CreatedAt)
            .Select(u => new { u.Id, u.CreatedAt })
            .Take(max)
            .ToListAsync();
        return rows.Select(u => new PersonCandidate(u.Id, DiscoverRecipes.Decay(u.CreatedAt, ctx.Now), Reason)).ToList();
    }
}
