using System.Security.Claims;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Social;

/// Messages between people (friends overhaul, design canvas M1–M3, P2; journey F3 in
/// docs/testing-friends.md), copied from Instagram: people you follow reach your chats, your
/// followers reach chats or requests (your choice), everyone else requests or nothing. A
/// request makes no push and no badge, and its sender can't see it was read until it's
/// accepted. Read receipts work both ways. Never across a block. Coach threads stay CoachMessage.
public static class DirectMessageEndpoints
{
    public const int MaxLength = 2000;
    private const int Page = 50;

    public static void MapDirectMessageEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/dm").WithTags("Social").RequireAuthorization();
        g.MapGet("/threads", Threads);
        g.MapGet("/unread", Unread);
        g.MapGet("/chat", Chat);
        g.MapPost("/send", Send).RequireRateLimiting("social-write");
        g.MapPost("/threads/{id:guid}/read", Read);
        g.MapPost("/threads/{id:guid}/accept", Accept);
        g.MapDelete("/threads/{id:guid}", Delete);
    }

    public record PersonDto(string Username, string DisplayName, string? AvatarUrl);
    public record ThreadDto(Guid Id, PersonDto? Other, string LastBody, long LastAtMs, bool LastMine, bool Unread);
    public record MessageDto(Guid Id, string ClientId, string Body, long CreatedAtMs, bool Mine);
    /// Other is null for a deleted account. Accepted = it's in my chats (false = my request).
    /// SeenAtMs = when they last read the thread, only with read receipts on for both and once
    /// they've accepted. CanSend false comes with Why.
    public record ChatDto(Guid? ThreadId, PersonDto? Other, bool Accepted, long? SeenAtMs, bool CanSend, string? Why, List<MessageDto> Messages);
    public record SendRequest(string? Username, Guid? ThreadId, string ClientId, string Body);

    private static long Ms(DateTime t) => new DateTimeOffset(DateTime.SpecifyKind(t, DateTimeKind.Utc)).ToUnixTimeMilliseconds();
    private static PersonDto? Person(User? u) => u is null ? null : new(u.Username, u.DisplayName, u.AvatarUrl);
    private static string PairKey(Guid a, Guid b) => string.CompareOrdinal(a.ToString(), b.ToString()) < 0 ? $"{a}:{b}" : $"{b}:{a}";

    private static Task<bool> BlockedAsync(AppDbContext db, Guid a, Guid b) =>
        db.Blocks.AnyAsync(x => (x.BlockerId == a && x.BlockedId == b) || (x.BlockerId == b && x.BlockedId == a));

    private enum Route { Chats, Requests, Refused }

    /// Where a new message from `from` lands for `to`, by `to`'s message controls.
    private static async Task<Route> RouteAsync(AppDbContext db, User from, User to)
    {
        if (await db.Follows.AnyAsync(f => f.FollowerId == to.Id && f.FollowedId == from.Id)) return Route.Chats;
        if (await db.Follows.AnyAsync(f => f.FollowerId == from.Id && f.FollowedId == to.Id))
            return to.DmFromFollowers == DmFromFollowers.Chats ? Route.Chats : Route.Requests;
        return to.DmFromOthers == DmFromOthers.Requests ? Route.Requests : Route.Refused;
    }

    private static async Task<IResult> Threads(string? box, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var requests = box == "requests";
        var rows = await db.DmMembers
            .Where(m => m.UserId == me && m.Accepted == !requests && (m.ClearedAt == null || m.Thread.LastMessageAt > m.ClearedAt))
            .Select(m => new
            {
                m.ThreadId,
                m.LastReadAt,
                m.ClearedAt,
                Other = m.Thread.Members.Where(o => o.UserId != me).Select(o => o.User).FirstOrDefault(),
                Last = db.DirectMessages.Where(x => x.ThreadId == m.ThreadId).OrderByDescending(x => x.CreatedAt).FirstOrDefault(),
            })
            .Where(r => r.Last != null && (r.ClearedAt == null || r.Last.CreatedAt > r.ClearedAt))
            .Where(r => r.Other == null || !db.Blocks.Any(b => (b.BlockerId == me && b.BlockedId == r.Other.Id) || (b.BlockerId == r.Other.Id && b.BlockedId == me)))
            .ToListAsync();
        return Results.Ok(rows
            .OrderByDescending(r => r.Last!.CreatedAt)
            .Select(r => new ThreadDto(r.ThreadId, Person(r.Other), r.Last!.Body, Ms(r.Last.CreatedAt), r.Last.SenderId == me,
                r.Last.SenderId != me && (r.LastReadAt == null || r.LastReadAt < r.Last.CreatedAt))));
    }

    /// Chats with something unread, and how many requests are waiting (requests get no badge on
    /// Social, only this count inside Messages).
    private static async Task<IResult> Unread(ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var mine = db.DmMembers.Where(m => m.UserId == me && (m.ClearedAt == null || m.Thread.LastMessageAt > m.ClearedAt)
            && !m.Thread.Members.Any(o => o.UserId != me && db.Blocks.Any(b => (b.BlockerId == me && b.BlockedId == o.UserId) || (b.BlockerId == o.UserId && b.BlockedId == me))));
        var chats = await mine.CountAsync(m => m.Accepted && db.DirectMessages.Any(x => x.ThreadId == m.ThreadId && x.SenderId != me
            && (m.LastReadAt == null || x.CreatedAt > m.LastReadAt) && (m.ClearedAt == null || x.CreatedAt > m.ClearedAt)));
        var requests = await mine.CountAsync(m => !m.Accepted);
        return Results.Ok(new { chats, requests });
    }

    /// One conversation, by the other person's username (also before any message) or by thread
    /// id (a deleted account has no username). `before` pages back through older messages.
    private static async Task<IResult> Chat(string? username, Guid? threadId, long? before, ClaimsPrincipal caller, AppDbContext db)
    {
        var meId = caller.GetUserId();
        var me = await db.Users.FirstAsync(u => u.Id == meId);
        User? other;
        DmMember? mine = null;
        if (threadId is { } tid)
        {
            mine = await db.DmMembers.Include(m => m.Thread).FirstOrDefaultAsync(m => m.ThreadId == tid && m.UserId == meId);
            if (mine is null) return Results.NotFound();
            other = await db.DmMembers.Where(m => m.ThreadId == tid && m.UserId != meId).Select(m => m.User).FirstOrDefaultAsync();
        }
        else
        {
            other = await db.Users.FirstOrDefaultAsync(u => u.Username == (username ?? "").ToLowerInvariant() && !u.IsSample);
            if (other is null || other.Id == meId) return Results.NotFound();
            var key = PairKey(meId, other.Id);
            mine = await db.DmMembers.Include(m => m.Thread).FirstOrDefaultAsync(m => m.Thread.PairKey == key && m.UserId == meId);
        }
        if (other is not null && await BlockedAsync(db, meId, other.Id)) return Results.NotFound();

        var messages = new List<MessageDto>();
        long? seen = null;
        if (mine is not null)
        {
            var cutoff = before is { } b ? DateTimeOffset.FromUnixTimeMilliseconds(b).UtcDateTime : DateTime.MaxValue;
            var rows = await db.DirectMessages
                .Where(x => x.ThreadId == mine.ThreadId && x.CreatedAt < cutoff && (mine.ClearedAt == null || x.CreatedAt > mine.ClearedAt))
                .OrderByDescending(x => x.CreatedAt).Take(Page).ToListAsync();
            messages = rows.AsEnumerable().Reverse().Select(x => new MessageDto(x.Id, x.ClientId, x.Body, Ms(x.CreatedAt), x.SenderId == meId)).ToList();
            var theirs = other is null ? null : await db.DmMembers.FirstOrDefaultAsync(m => m.ThreadId == mine.ThreadId && m.UserId == other.Id);
            if (theirs is { Accepted: true, LastReadAt: { } read } && me.ShowReadReceipts && other!.ShowReadReceipts) seen = Ms(read);
        }

        var (canSend, why) = (true, (string?)null);
        if (other is null) (canSend, why) = (false, "This account was deleted.");
        // Replying to a request I received accepts it; once they've accepted, anything goes.
        else if (mine is not { Accepted: false } && (mine is null || !await TheyAcceptedAsync(db, mine, other.Id))
                 && await RouteAsync(db, me, other) == Route.Refused)
            (canSend, why) = (false, "This account only gets messages from people it follows.");
        return Results.Ok(new ChatDto(mine?.ThreadId, Person(other), mine?.Accepted ?? true, seen, canSend, why, messages));
    }

    private static async Task<bool> TheyAcceptedAsync(AppDbContext db, DmMember mine, Guid otherId) =>
        await db.DmMembers.AnyAsync(m => m.ThreadId == mine.ThreadId && m.UserId == otherId && m.Accepted);

    private static async Task<IResult> Send(SendRequest req, ClaimsPrincipal caller, AppDbContext db)
    {
        var meId = caller.GetUserId();
        var body = (req.Body ?? "").Trim();
        if (body.Length == 0) return Results.BadRequest(new { error = "Write something first." });
        if (body.Length > MaxLength) return Results.BadRequest(new { error = $"Keep it under {MaxLength} characters." });
        if (string.IsNullOrWhiteSpace(req.ClientId) || req.ClientId.Length > 64) return Results.BadRequest(new { error = "Missing message id." });

        var dup = await db.DirectMessages.FirstOrDefaultAsync(x => x.SenderId == meId && x.ClientId == req.ClientId);
        if (dup is not null) return Results.Ok(new MessageDto(dup.Id, dup.ClientId, dup.Body, Ms(dup.CreatedAt), true));

        var me = await db.Users.FirstAsync(u => u.Id == meId);
        User? other;
        DmThread? thread = null;
        if (req.ThreadId is { } tid)
        {
            thread = await db.DmThreads.Include(t => t.Members).FirstOrDefaultAsync(t => t.Id == tid && t.Members.Any(m => m.UserId == meId));
            if (thread is null) return Results.NotFound();
            var otherId = thread.Members.Where(m => m.UserId != meId).Select(m => (Guid?)m.UserId).FirstOrDefault();
            other = otherId is null ? null : await db.Users.FindAsync(otherId);
        }
        else
        {
            other = await db.Users.FirstOrDefaultAsync(u => u.Username == (req.Username ?? "").ToLowerInvariant() && !u.IsSample);
            if (other is not null)
            {
                var key = PairKey(meId, other.Id);
                thread = await db.DmThreads.Include(t => t.Members).FirstOrDefaultAsync(t => t.PairKey == key);
            }
        }
        if (other is null) return Results.NotFound(new { error = "This account was deleted." });
        if (other.Id == meId) return Results.BadRequest(new { error = "You can't message yourself." });
        if (await BlockedAsync(db, meId, other.Id)) return Results.NotFound();

        var mine = thread?.Members.FirstOrDefault(m => m.UserId == meId);
        var theirs = thread?.Members.FirstOrDefault(m => m.UserId == other.Id);
        if (theirs is not { Accepted: true })
        {
            var route = mine is { Accepted: false } ? Route.Chats : await RouteAsync(db, me, other); // replying to their request
            if (route == Route.Refused)
                return Results.Json(new { error = "This account only gets messages from people it follows." }, statusCode: 403);
            if (thread is null)
            {
                thread = new DmThread { PairKey = PairKey(meId, other.Id) };
                db.DmThreads.Add(thread);
                thread.Members.Add(mine = new DmMember { UserId = meId, Accepted = true });
                thread.Members.Add(theirs = new DmMember { UserId = other.Id, Accepted = route == Route.Chats });
            }
            else
            {
                if (theirs is null) thread.Members.Add(theirs = new DmMember { UserId = other.Id });
                if (route == Route.Chats) theirs.Accepted = true;
            }
        }
        if (mine is null) thread!.Members.Add(mine = new DmMember { UserId = meId });
        mine.Accepted = true; // replying accepts a request
        var now = DateTime.UtcNow;
        mine.LastReadAt = now;
        var message = new DirectMessage { ClientId = req.ClientId, Thread = thread!, SenderId = meId, Body = body, CreatedAt = now };
        db.DirectMessages.Add(message);
        thread!.LastMessageAt = now;
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException) when (req.ThreadId is null)
        {
            // Both started the thread at once (unique pair key): send again into the one that won.
            db.ChangeTracker.Clear();
            var key = PairKey(meId, other.Id);
            var id = await db.DmThreads.Where(t => t.PairKey == key).Select(t => t.Id).FirstAsync();
            return await Send(req with { Username = null, ThreadId = id }, caller, db);
        }
        return Results.Ok(new MessageDto(message.Id, message.ClientId, message.Body, Ms(now), true));
    }

    private static async Task<IResult> Read(Guid id, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var n = await db.DmMembers.Where(m => m.ThreadId == id && m.UserId == me)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.LastReadAt, DateTime.UtcNow));
        return n == 0 ? Results.NotFound() : Results.NoContent();
    }

    private static async Task<IResult> Accept(Guid id, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var n = await db.DmMembers.Where(m => m.ThreadId == id && m.UserId == me)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.Accepted, true));
        return n == 0 ? Results.NotFound() : Results.NoContent();
    }

    /// Delete a chat or a request, for me only; a new message brings it back (as a request again
    /// if it was one).
    private static async Task<IResult> Delete(Guid id, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var n = await db.DmMembers.Where(m => m.ThreadId == id && m.UserId == me)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.ClearedAt, DateTime.UtcNow));
        return n == 0 ? Results.NotFound() : Results.NoContent();
    }
}
