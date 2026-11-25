using System.Security.Claims;
using System.Text.Json;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Photos;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Social;

/// Stories (friends overhaul, design canvas S1–S4; journey F4 in docs/testing-friends.md),
/// copied from Instagram. The row above the feed shows the stories of the accounts you follow
/// (following a private account means you were approved), except those that hid their story from
/// you or posted it to Close friends without you on the list. Never across a block. A story is
/// gone 24 hours after it was posted, and so is its card in any reply that quoted it.
public static class StoryEndpoints
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromHours(24);
    public const int MaxCardJson = 3800;

    public static void MapStoryEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/stories").WithTags("Social").RequireAuthorization();
        g.MapGet("", Row);
        g.MapPost("", Create).RequireRateLimiting("social-write");
        g.MapDelete("/{id:guid}", Delete);
        g.MapPost("/{id:guid}/seen", Seen);
        g.MapPost("/{id:guid}/cheer", Cheer).RequireRateLimiting("social-write");
        g.MapGet("/{id:guid}/viewers", Viewers);
        g.MapGet("/lists", Lists);
        g.MapPut("/lists/{list}/{username}", AddToList);
        g.MapDelete("/lists/{list}/{username}", RemoveFromList);
    }

    public record PersonDto(string Username, string DisplayName, string? AvatarUrl);
    public record StoryDto(Guid Id, string CardType, string CardJson, string? PhotoUrl, int PhotoWidth, int PhotoHeight,
        long CreatedAtMs, long ExpiresAtMs, bool CloseFriends, bool Seen, bool Cheered);
    /// One circle in the row: whose, their live stories (oldest first), and whether they can be
    /// cheered and replied to by me.
    public record AuthorDto(PersonDto User, bool Mine, bool CanReply, List<StoryDto> Stories);
    /// A card, a photo (uploaded first, POST /photos), or both (the card sits on the photo).
    public record CreateRequest(string? CardType, string? CardJson, bool CloseFriends, Guid? PhotoId = null);
    public record ViewerDto(PersonDto User, bool Cheered, long ViewedAtMs);
    public record ListsDto(List<PersonDto> CloseFriends, List<PersonDto> Hidden);

    private static long Ms(DateTime t) => new DateTimeOffset(DateTime.SpecifyKind(t, DateTimeKind.Utc)).ToUnixTimeMilliseconds();
    private static PersonDto Person(User u) => new(u.Username, u.DisplayName, u.AvatarUrl);
    private static StoryDto Dto(Story s, long createdAtMs, bool seen, bool cheered) =>
        new(s.Id, s.CardType, s.CardJson, s.PhotoId is { } p ? PhotoEndpoints.UrlOf(p) : null, s.PhotoWidth, s.PhotoHeight,
            createdAtMs, Ms(s.ExpiresAt), s.CloseFriends, seen, cheered);

    /// The live stories `viewerId` may see (their own included).
    public static IQueryable<Story> Visible(AppDbContext db, Guid viewerId, DateTime now) =>
        db.Stories.Where(s => s.ExpiresAt > now && (s.AuthorId == viewerId || (
            db.Follows.Any(f => f.FollowerId == viewerId && f.FollowedId == s.AuthorId)
            && !db.Blocks.Any(b => (b.BlockerId == s.AuthorId && b.BlockedId == viewerId) || (b.BlockerId == viewerId && b.BlockedId == s.AuthorId))
            && !db.StoryHides.Any(h => h.OwnerId == s.AuthorId && h.HiddenId == viewerId)
            && (!s.CloseFriends || db.CloseFriends.Any(c => c.OwnerId == s.AuthorId && c.FriendId == viewerId)))));

    /// "Cheers and replies" (the same setting as cheers while training): Following = only the
    /// accounts the author follows.
    public static async Task<bool> MayReplyAsync(AppDbContext db, User author, Guid viewerId) =>
        author.CheersFrom switch
        {
            CheersFrom.Off => false,
            CheersFrom.Following => await db.Follows.AnyAsync(f => f.FollowerId == author.Id && f.FollowedId == viewerId),
            _ => true,
        };

    private static async Task<IResult> Row(ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        var me = caller.GetUserId();
        var now = clock.GetUtcNow().UtcDateTime;
        var rows = await Visible(db, me, now)
            .OrderBy(s => s.CreatedAt)
            .Select(s => new
            {
                Story = s,
                s.Author,
                View = db.StoryViews.Where(v => v.StoryId == s.Id && v.ViewerId == me).Select(v => new { v.Cheered }).FirstOrDefault(),
                AuthorFollowsMe = db.Follows.Any(f => f.FollowerId == s.AuthorId && f.FollowedId == me),
            })
            .Take(1000)
            .ToListAsync();

        var authors = rows.GroupBy(r => r.Author.Id).Select(g =>
        {
            var a = g.First();
            var mine = a.Author.Id == me;
            var canReply = !mine && a.Author.CheersFrom switch { CheersFrom.Off => false, CheersFrom.Following => a.AuthorFollowsMe, _ => true };
            var stories = g.Select(r => Dto(r.Story, Ms(r.Story.CreatedAt), mine || r.View != null, r.View?.Cheered ?? false)).ToList();
            return new AuthorDto(Person(a.Author), mine, canReply, stories);
        });
        // Yours first, then unwatched ones, newest first (Instagram's order).
        return Results.Ok(authors
            .OrderByDescending(a => a.Mine)
            .ThenBy(a => a.Stories.All(s => s.Seen))
            .ThenByDescending(a => a.Stories.Max(s => s.CreatedAtMs))
            .ToList());
    }

    private static async Task<IResult> Create(CreateRequest req, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        var me = caller.GetUserId();
        if (req.CardType is null && req.PhotoId is null) return Results.BadRequest(new { error = "That can't go in a story." });
        if (req.CardType is not null)
        {
            if (!DirectMessageEndpoints.CardTypes.Contains(req.CardType)) return Results.BadRequest(new { error = "That can't go in a story." });
            if (string.IsNullOrEmpty(req.CardJson) || req.CardJson.Length > MaxCardJson) return Results.BadRequest(new { error = "That's too big for a story." });
            try { using var _ = JsonDocument.Parse(req.CardJson); }
            catch (JsonException) { return Results.BadRequest(new { error = "That can't go in a story." }); }
        }
        Photo? photo = null;
        if (req.PhotoId is { } photoId && (photo = await PhotoEndpoints.OwnedAsync(db, me, photoId)) is null)
            return Results.BadRequest(new { error = "That photo didn't upload. Try again." });

        var now = clock.GetUtcNow().UtcDateTime;
        if (await db.Stories.CountAsync(s => s.AuthorId == me && s.ExpiresAt > now) >= 30)
            return Results.BadRequest(new { error = "That's a lot of stories for one day. Try again later." });
        var story = new Story
        {
            AuthorId = me, CardType = req.CardType ?? "", CardJson = req.CardType is null ? "" : req.CardJson!, CloseFriends = req.CloseFriends,
            PhotoId = photo?.Id, PhotoWidth = photo?.Width ?? 0, PhotoHeight = photo?.Height ?? 0, CreatedAt = now, ExpiresAt = now + Lifetime,
        };
        db.Stories.Add(story);
        await db.SaveChangesAsync();
        return Results.Ok(Dto(story, Ms(now), true, false));
    }

    private static async Task<IResult> Delete(Guid id, ClaimsPrincipal caller, AppDbContext db, IPhotoStore store, CancellationToken ct)
    {
        var me = caller.GetUserId();
        var story = await db.Stories.FirstOrDefaultAsync(s => s.Id == id && s.AuthorId == me, ct);
        if (story is null) return Results.NotFound();
        await RemoveAsync(db, store, [story], ct);
        return Results.NoContent();
    }

    /// Deletes stories with their photos (file and row) and the cards quoted in replies.
    public static async Task RemoveAsync(AppDbContext db, IPhotoStore store, IReadOnlyCollection<Story> stories, CancellationToken ct = default)
    {
        var ids = stories.Select(s => s.Id).ToList();
        var photoIds = stories.Where(s => s.PhotoId is not null).Select(s => s.PhotoId!.Value).ToList();
        await ForgetQuotesAsync(db, ids, ct);
        await db.Stories.Where(s => ids.Contains(s.Id)).ExecuteDeleteAsync(ct);
        if (photoIds.Count == 0) return;
        var photos = await db.Photos.Where(p => photoIds.Contains(p.Id)).ToListAsync(ct);
        foreach (var p in photos) await store.DeleteAsync(p.Id.ToString("N"), ct);
        db.Photos.RemoveRange(photos);
        await db.SaveChangesAsync(ct);
    }

    /// Replies that quoted these stories lose the quoted card ("Story no longer available").
    public static async Task ForgetQuotesAsync(AppDbContext db, IReadOnlyCollection<Guid> storyIds, CancellationToken ct = default)
    {
        foreach (var id in storyIds)
        {
            var key = id.ToString();
            await db.DirectMessages.Where(m => m.CardType == DirectMessageEndpoints.StoryCard && m.CardJson != null && m.CardJson.Contains(key))
                .ExecuteUpdateAsync(s => s.SetProperty(m => m.CardJson, (string?)null), ct);
        }
    }

    private static async Task<StoryView?> ViewAsync(AppDbContext db, Guid storyId, Guid me) =>
        await db.StoryViews.FirstOrDefaultAsync(v => v.StoryId == storyId && v.ViewerId == me);

    private static async Task<IResult> Seen(Guid id, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        var me = caller.GetUserId();
        var now = clock.GetUtcNow().UtcDateTime;
        var story = await Visible(db, me, now).FirstOrDefaultAsync(s => s.Id == id);
        if (story is null) return Results.NotFound();
        if (story.AuthorId != me && await ViewAsync(db, id, me) is null)
        {
            db.StoryViews.Add(new StoryView { StoryId = id, ViewerId = me, ViewedAt = now });
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException) { /* seen twice at once */ }
        }
        return Results.NoContent();
    }

    /// Instagram's story like. The author sees it in the viewers list and gets one notification
    /// (gathered like likes, never pushed on its own).
    private static async Task<IResult> Cheer(Guid id, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        var me = caller.GetUserId();
        var now = clock.GetUtcNow().UtcDateTime;
        var story = await Visible(db, me, now).Include(s => s.Author).FirstOrDefaultAsync(s => s.Id == id);
        if (story is null) return Results.NotFound(new { error = "This story has gone." });
        if (story.AuthorId == me) return Results.BadRequest(new { error = "That's your own story." });
        if (!await MayReplyAsync(db, story.Author, me))
            return Results.Json(new { error = "They've turned cheers off." }, statusCode: StatusCodes.Status403Forbidden);

        var view = await ViewAsync(db, id, me);
        if (view is { Cheered: true }) return Results.NoContent();
        if (view is null) db.StoryViews.Add(view = new StoryView { StoryId = id, ViewerId = me, ViewedAt = now });
        view.Cheered = true;
        db.Notifications.Add(new Notification { UserId = story.AuthorId, ActorId = me, Type = NotificationType.StoryCheer, CreatedAt = now });
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    /// Who watched your story, cheers first (the author only).
    private static async Task<IResult> Viewers(Guid id, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        if (!await db.Stories.AnyAsync(s => s.Id == id && s.AuthorId == me)) return Results.NotFound();
        var rows = await db.StoryViews.Where(v => v.StoryId == id)
            .Where(v => !db.Blocks.Any(b => (b.BlockerId == me && b.BlockedId == v.ViewerId) || (b.BlockerId == v.ViewerId && b.BlockedId == me)))
            .OrderByDescending(v => v.Cheered).ThenByDescending(v => v.ViewedAt)
            .Select(v => new { v.Viewer, v.Cheered, v.ViewedAt })
            .Take(500)
            .ToListAsync();
        return Results.Ok(rows.Select(r => new ViewerDto(Person(r.Viewer), r.Cheered, Ms(r.ViewedAt))));
    }

    private static async Task<IResult> Lists(ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var close = await db.CloseFriends.Where(c => c.OwnerId == me).Select(c => c.Friend).OrderBy(u => u.DisplayName).ToListAsync();
        var hidden = await db.StoryHides.Where(h => h.OwnerId == me).Select(h => h.Hidden).OrderBy(u => u.DisplayName).ToListAsync();
        return Results.Ok(new ListsDto([.. close.Select(Person)], [.. hidden.Select(Person)]));
    }

    private static async Task<IResult> AddToList(string list, string username, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var other = await db.Users.FirstOrDefaultAsync(u => u.Username == username.ToLowerInvariant() && !u.IsSample);
        if (other is null || other.Id == me) return Results.NotFound();
        switch (list)
        {
            case "close-friends":
                if (!await db.CloseFriends.AnyAsync(c => c.OwnerId == me && c.FriendId == other.Id))
                    db.CloseFriends.Add(new CloseFriend { OwnerId = me, FriendId = other.Id });
                break;
            case "hidden":
                if (!await db.StoryHides.AnyAsync(h => h.OwnerId == me && h.HiddenId == other.Id))
                    db.StoryHides.Add(new StoryHide { OwnerId = me, HiddenId = other.Id });
                break;
            default:
                return Results.NotFound();
        }
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException) { /* added twice at once */ }
        return Results.NoContent();
    }

    private static async Task<IResult> RemoveFromList(string list, string username, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var name = username.ToLowerInvariant();
        _ = list switch
        {
            "close-friends" => await db.CloseFriends.Where(c => c.OwnerId == me && c.Friend.Username == name).ExecuteDeleteAsync(),
            "hidden" => await db.StoryHides.Where(h => h.OwnerId == me && h.Hidden.Username == name).ExecuteDeleteAsync(),
            _ => -1,
        };
        return list is "close-friends" or "hidden" ? Results.NoContent() : Results.NotFound();
    }
}

/// Deletes stories 24 hours after they were posted, with their views and the cards quoted in
/// replies and their photos (the stories row already stops showing them at that moment; this removes the data).
public class StorySweeper(IServiceScopeFactory scopes, ILogger<StorySweeper> log, TimeProvider clock) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(10), clock);
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                await SweepAsync(scope.ServiceProvider.GetRequiredService<AppDbContext>(), scope.ServiceProvider.GetRequiredService<IPhotoStore>(),
                    clock.GetUtcNow().UtcDateTime, stoppingToken);
            }
            catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
            {
                log.LogError(ex, "Story sweep failed");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    public static async Task SweepAsync(AppDbContext db, IPhotoStore store, DateTime now, CancellationToken ct = default)
    {
        var gone = await db.Stories.AsNoTracking().Where(s => s.ExpiresAt <= now).Take(500).ToListAsync(ct);
        if (gone.Count > 0) await StoryEndpoints.RemoveAsync(db, store, gone, ct);
    }
}
