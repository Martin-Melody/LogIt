using System.Text;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Social;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Discover;

/// Puts Discover together: who may appear (the rules live here, not in recipes), which arm the
/// viewer is in, mixing that arm's recipes, paging, and recording what was shown.
public sealed class DiscoverService(AppDbContext db, DiscoverExperiment experiment, TimeProvider time)
{
    /// Per recipe, how many candidates to ask for. The merged list is paged by offset.
    private const int PerRecipe = 100;
    /// At most this many of one person's posts in the whole list, so one keen poster can't fill it.
    private const int PerAuthor = 2;

    public sealed record PostItem(Post Post, string Reason, string Recipe);
    public sealed record PersonItem(User User, int FollowerCount, string Reason, string Recipe);

    public async Task<DiscoverContext> ContextAsync(Guid viewerId)
    {
        var following = await db.Follows.Where(f => f.FollowerId == viewerId).Select(f => f.FollowedId).ToListAsync();
        var requested = await db.FollowRequests.Where(r => r.RequesterId == viewerId).Select(r => r.TargetId).ToListAsync();
        var blocked = await db.BlockedUserIdsAsync(viewerId);
        var hidden = await db.DiscoverDismissals.Where(d => d.UserId == viewerId).Select(d => d.HiddenUserId).ToListAsync();
        var excluded = new HashSet<Guid>([viewerId, .. following, .. requested, .. blocked, .. hidden]);
        return new DiscoverContext
        {
            Db = db,
            ViewerId = viewerId,
            Following = following.ToHashSet(),
            Excluded = excluded,
            Now = time.GetUtcNow().UtcDateTime,
        };
    }

    /// Posts Discover may show this viewer: from public accounts that said yes to Discover,
    /// not reposts, not deleted, not from anyone excluded.
    public static IQueryable<Post> EligiblePosts(DiscoverContext ctx)
    {
        var excluded = ctx.Excluded.ToList();
        return ctx.Db.Posts.Where(p =>
            p.DeletedAt == null &&
            p.RepostOfId == null &&
            !p.Author.IsPrivate &&
            p.Author.ShowInDiscover == true &&
            !excluded.Contains(p.AuthorId));
    }

    /// Accounts that may be suggested: not excluded, and not hiding from suggestions. Private
    /// accounts can be suggested (you'd send a request).
    public static IQueryable<User> EligiblePeople(DiscoverContext ctx)
    {
        var excluded = ctx.Excluded.ToList();
        return ctx.Db.Users.Where(u => !u.HideFromSuggestions && u.Origin == null && !excluded.Contains(u.Id));
    }

    /// Takes the recipes' lists in turn: each recipe adds its best item not already in the
    /// list (and not over the per-author cap), then the next recipe, round and round. A recipe
    /// whose pick was already taken moves on to its next one rather than losing its turn.
    public static List<(T Item, string Recipe)> Interleave<T>(
        IReadOnlyList<(string Recipe, IReadOnlyList<T> Items)> lists, Func<T, Guid> key, Func<T, Guid>? group = null, int perGroup = int.MaxValue)
    {
        var seen = new HashSet<Guid>();
        var perGroupCount = new Dictionary<Guid, int>();
        var result = new List<(T, string)>();
        var next = new int[lists.Count];
        var added = true;
        while (added)
        {
            added = false;
            for (var l = 0; l < lists.Count; l++)
            {
                var (recipe, items) = lists[l];
                while (next[l] < items.Count)
                {
                    var item = items[next[l]++];
                    if (seen.Contains(key(item))) continue;
                    if (group is not null && perGroupCount.GetValueOrDefault(group(item)) >= perGroup) continue;
                    seen.Add(key(item));
                    if (group is not null) perGroupCount[group(item)] = perGroupCount.GetValueOrDefault(group(item)) + 1;
                    result.Add((item, recipe));
                    added = true;
                    break;
                }
            }
        }
        return result;
    }

    public async Task<(List<PostItem> Items, string? NextCursor, string Arm)> PostsAsync(Guid viewerId, int limit, string? cursor)
    {
        var arm = experiment.ArmFor(viewerId);
        var ctx = await ContextAsync(viewerId);
        var eligible = EligiblePosts(ctx);

        var lists = new List<(string, IReadOnlyList<PostCandidate>)>();
        foreach (var name in arm.PostRecipes)
        {
            var recipe = DiscoverRecipes.Posts.First(r => r.Name == name);
            lists.Add((name, await recipe.PickPostsAsync(ctx, eligible, PerRecipe)));
        }
        var merged = Interleave(lists, c => c.PostId, c => c.AuthorId, PerAuthor);

        var offset = DecodeOffset(cursor);
        var page = merged.Skip(offset).Take(limit).ToList();
        var next = offset + page.Count < merged.Count ? EncodeOffset(offset + page.Count) : null;

        var ids = page.Select(p => p.Item.PostId).ToList();
        var posts = await db.Posts
            .Include(p => p.Author)
            .Include(p => p.Likes)
            .Include(p => p.Comments)
            .Where(p => ids.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id);
        var items = page
            .Where(p => posts.ContainsKey(p.Item.PostId))
            .Select(p => new PostItem(posts[p.Item.PostId], p.Item.Reason, p.Recipe))
            .ToList();

        await RecordAsync(viewerId, arm.Name, DiscoverTargetKind.Post, items.Select(i => (i.Post.Id, i.Recipe)));
        return (items, next, arm.Name);
    }

    public async Task<(List<PersonItem> Items, string Arm)> PeopleAsync(Guid viewerId, int limit)
    {
        var arm = experiment.ArmFor(viewerId);
        var ctx = await ContextAsync(viewerId);
        var eligible = EligiblePeople(ctx);

        var lists = new List<(string, IReadOnlyList<PersonCandidate>)>();
        foreach (var name in arm.PeopleRecipes)
        {
            var recipe = DiscoverRecipes.People.First(r => r.Name == name);
            lists.Add((name, await recipe.PickPeopleAsync(ctx, eligible, limit)));
        }
        var page = Interleave(lists, c => c.UserId).Take(limit).ToList();

        var ids = page.Select(p => p.Item.UserId).ToList();
        var users = await db.Users.Where(u => ids.Contains(u.Id)).ToDictionaryAsync(u => u.Id);
        var followers = await db.Follows.Where(f => ids.Contains(f.FollowedId))
            .GroupBy(f => f.FollowedId).Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.Key, g => g.Count);
        var items = page
            .Where(p => users.ContainsKey(p.Item.UserId))
            .Select(p => new PersonItem(users[p.Item.UserId], followers.GetValueOrDefault(p.Item.UserId), p.Item.Reason, p.Recipe))
            .ToList();

        await RecordAsync(viewerId, arm.Name, DiscoverTargetKind.Person, items.Select(i => (i.User.Id, i.Recipe)));
        return (items, arm.Name);
    }

    /// Keeps the first showing of each post/person per viewer. Best effort: losing a race with
    /// another request for the same page only loses a duplicate row.
    private async Task RecordAsync(Guid viewerId, string arm, DiscoverTargetKind kind, IEnumerable<(Guid Id, string Recipe)> shown)
    {
        var list = shown.ToList();
        if (list.Count == 0) return;
        var ids = list.Select(s => s.Id).ToList();
        var already = await db.DiscoverImpressions
            .Where(i => i.UserId == viewerId && i.Kind == kind && ids.Contains(i.TargetId))
            .Select(i => i.TargetId)
            .ToListAsync();
        var now = time.GetUtcNow().UtcDateTime;
        var added = list.Where(s => !already.Contains(s.Id))
            .Select(s => new DiscoverImpression { UserId = viewerId, Kind = kind, TargetId = s.Id, Arm = arm, Recipe = s.Recipe, ShownAt = now })
            .ToList();
        if (added.Count == 0) return;
        db.DiscoverImpressions.AddRange(added);
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            foreach (var row in added) db.Entry(row).State = EntityState.Detached;
        }
    }

    private static int DecodeOffset(string? cursor)
    {
        if (string.IsNullOrWhiteSpace(cursor)) return 0;
        try
        {
            return Math.Max(0, int.Parse(Encoding.UTF8.GetString(Convert.FromBase64String(cursor))));
        }
        catch
        {
            return 0;
        }
    }

    private static string EncodeOffset(int offset) => Convert.ToBase64String(Encoding.UTF8.GetBytes(offset.ToString()));
}
