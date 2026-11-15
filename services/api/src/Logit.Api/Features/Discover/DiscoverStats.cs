using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Discover;

/// How each arm and recipe is doing: of the posts and people it showed (since `days` ago),
/// how many the viewer then liked, commented on, or followed. Admin only.
public static class DiscoverStats
{
    public sealed record Row(
        string Arm, string Recipe, string Kind, int Shown,
        int Liked, int Commented, int Followed, double FollowRate);

    public static async Task<List<Row>> ComputeAsync(AppDbContext db, DateTime since)
    {
        var shown = await db.DiscoverImpressions.Where(i => i.ShownAt >= since).ToListAsync();
        if (shown.Count == 0) return [];
        var viewers = shown.Select(i => i.UserId).Distinct().ToList();

        var likes = (await db.Likes.Where(l => viewers.Contains(l.UserId)).Select(l => new { l.UserId, l.PostId, l.CreatedAt }).ToListAsync())
            .ToLookup(l => (l.UserId, l.PostId));
        var comments = (await db.Comments.Where(c => viewers.Contains(c.AuthorId)).Select(c => new { c.AuthorId, c.PostId, c.CreatedAt }).ToListAsync())
            .ToLookup(c => (c.AuthorId, c.PostId));
        var follows = (await db.Follows.Where(f => viewers.Contains(f.FollowerId)).Select(f => new { f.FollowerId, f.FollowedId, f.CreatedAt }).ToListAsync())
            .ToLookup(f => (f.FollowerId, f.FollowedId));
        var requests = (await db.FollowRequests.Where(f => viewers.Contains(f.RequesterId)).Select(f => new { f.RequesterId, f.TargetId, f.CreatedAt }).ToListAsync())
            .ToLookup(f => (f.RequesterId, f.TargetId));
        var postIds = shown.Where(i => i.Kind == DiscoverTargetKind.Post).Select(i => i.TargetId).Distinct().ToList();
        var authorOf = await db.Posts.Where(p => postIds.Contains(p.Id)).ToDictionaryAsync(p => p.Id, p => p.AuthorId);

        bool FollowedAfter(Guid viewer, Guid target, DateTime at) =>
            follows[(viewer, target)].Any(f => f.CreatedAt >= at) || requests[(viewer, target)].Any(r => r.CreatedAt >= at);

        return shown
            .GroupBy(i => (i.Arm, i.Recipe, i.Kind))
            .Select(g =>
            {
                int liked = 0, commented = 0, followed = 0;
                foreach (var i in g)
                {
                    if (i.Kind == DiscoverTargetKind.Post)
                    {
                        if (likes[(i.UserId, i.TargetId)].Any(l => l.CreatedAt >= i.ShownAt)) liked++;
                        if (comments[(i.UserId, i.TargetId)].Any(c => c.CreatedAt >= i.ShownAt)) commented++;
                        if (authorOf.TryGetValue(i.TargetId, out var author) && FollowedAfter(i.UserId, author, i.ShownAt)) followed++;
                    }
                    else if (FollowedAfter(i.UserId, i.TargetId, i.ShownAt)) followed++;
                }
                var n = g.Count();
                return new Row(g.Key.Arm, g.Key.Recipe, g.Key.Kind == DiscoverTargetKind.Post ? "post" : "person",
                    n, liked, commented, followed, Math.Round((double)followed / n, 4));
            })
            .OrderBy(r => r.Kind).ThenBy(r => r.Arm).ThenByDescending(r => r.FollowRate)
            .ToList();
    }
}
