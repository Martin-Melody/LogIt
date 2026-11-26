using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
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
        g.MapPatch("/messages/{id:guid}", Edit);
        g.MapDelete("/messages/{id:guid}", Unsend);
        g.MapPut("/messages/{id:guid}/reaction", React).RequireRateLimiting("social-write");
    }

    public record PersonDto(string Username, string DisplayName, string? AvatarUrl, Guid Id);
    /// A group's chat in the list and its header (Other is null for those).
    public record GroupRef(Guid Id, string Name, string? PhotoUrl, int Members);
    /// LastBy: who sent the last message, in a group ("Conor: Saturday 9:00, who's in?").
    public record ThreadDto(Guid Id, PersonDto? Other, string LastBody, long LastAtMs, bool LastMine, bool Unread, GroupRef? Group = null, string? LastBy = null);
    /// PhotoHidden: a photo in a request you haven't accepted (shown blurred, address withheld).
    public record MessageDto(Guid Id, string ClientId, string Body, long CreatedAtMs, bool Mine, string? CardType = null, string? CardJson = null,
        string? PhotoUrl = null, int PhotoWidth = 0, int PhotoHeight = 0, bool PhotoHidden = false,
        string? VoiceUrl = null, int VoiceMs = 0, string? VoicePeaks = null, bool VoiceHidden = false, bool Edited = false,
        bool Deleted = false, bool RemovedByLogIt = false, PersonDto? From = null, bool RemovedByModerator = false, List<ReactionDto>? Reactions = null);
    /// One emoji on a message: how many people picked it, and whether you did.
    public record ReactionDto(string Emoji, int Count, bool Mine);
    public record ReactRequest(string? Emoji);
    /// The reactions offered (the apps show these six; anything else is refused).
    public static readonly string[] Reactions = ["💪", "🔥", "❤️", "😂", "👏", "😮"];
    /// Other is null for a deleted account. Accepted = it's in my chats (false = my request).
    /// SeenAtMs = when they last read the thread, only with read receipts on for both and once
    /// they've accepted. CanSend false comes with Why.
    /// In a group: CanModerate (you're an organiser or moderator) and MutedUntilMs (you can't send until then).
    public record ChatDto(Guid? ThreadId, PersonDto? Other, bool Accepted, long? SeenAtMs, bool CanSend, string? Why, List<MessageDto> Messages, GroupRef? Group = null,
        bool CanModerate = false, long? MutedUntilMs = null);
    public record SendRequest(string? Username, Guid? ThreadId, string ClientId, string? Body, string? CardType = null, string? CardJson = null, Guid? PhotoId = null,
        Guid? VoiceId = null, string? VoicePeaks = null);

    /// What can be shared into a chat as a card (post payload formats).
    public static readonly string[] CardTypes = ["WorkoutSession", "PersonalRecord"];
    /// A reply to a story: the client sends {"storyId"}, the server stores the story's card and
    /// when it expires, so the quote disappears with the story.
    public const string StoryCard = "Story";
    /// An invite to a group (canvas G16): the client sends {"groupId"}, the server checks you're a
    /// member, records the invite and stores the group's name and look.
    public const string GroupInviteCard = "GroupInvite";
    private const int MaxCardJson = 4000;

    /// `request`: the viewer hasn't accepted this thread, so a photo's address is withheld.
    private static MessageDto Dto(DirectMessage x, Guid me, DateTime now, bool request = false, User? from = null, List<DmReaction>? reactions = null)
    {
        var locked = request && x.SenderId != me; // photos and voice wait for the request to be accepted
        return new(x.Id, x.ClientId, x.Body, Ms(x.CreatedAt), x.SenderId == me, x.CardType,
            x.CardType == StoryCard && QuoteExpired(x.CardJson, now) ? null : x.CardJson,
            x.PhotoId is { } p && !locked ? Photos.PhotoEndpoints.UrlOf(p) : null, x.PhotoWidth, x.PhotoHeight, locked && x.PhotoId is not null,
            x.VoiceId is { } v && !locked ? Voice.VoiceEndpoints.UrlOf(v) : null, x.VoiceMs, x.VoicePeaks, locked && x.VoiceId is not null, x.EditedAt is not null,
            x.DeletedAt is not null, x.RemovedByLogIt, Person(from), x.RemovedByModerator,
            x.DeletedAt is not null || reactions is null || reactions.Count == 0 ? null
                : [.. reactions.GroupBy(r => r.Emoji).OrderBy(gr => gr.Min(r => r.CreatedAt))
                    .Select(gr => new ReactionDto(gr.Key, gr.Count(), gr.Any(r => r.UserId == me)))]);
    }

    /// Reactions on these messages, by message, leaving out people `hide` says to (blocks, in a group).
    private static async Task<Dictionary<Guid, List<DmReaction>>> ReactionsAsync(AppDbContext db, List<Guid> ids, Guid me, bool hideBlocked)
    {
        var q = db.DmReactions.Where(r => ids.Contains(r.MessageId));
        if (hideBlocked) q = q.Where(r => !db.Blocks.Any(bl => (bl.BlockerId == me && bl.BlockedId == r.UserId) || (bl.BlockerId == r.UserId && bl.BlockedId == me)));
        return (await q.ToListAsync()).GroupBy(r => r.MessageId).ToDictionary(gr => gr.Key, gr => gr.ToList());
    }

    /// The sweeper clears a quoted story within minutes of it expiring; this covers the minutes between.
    private static bool QuoteExpired(string? json, DateTime now)
    {
        if (json is null) return true;
        try
        {
            using var doc = JsonDocument.Parse(json);
            return !doc.RootElement.TryGetProperty("expiresAtMs", out var e) || e.GetInt64() <= Ms(now);
        }
        catch (Exception e) when (e is JsonException or InvalidOperationException or FormatException) { return true; }
    }

    /// The list's one-line preview: the text, or what was shared.
    private static string Preview(DirectMessage x) =>
        x.RemovedByLogIt ? "Message removed by LogIt" : x.RemovedByModerator ? "Message removed by a moderator" : x.DeletedAt is not null ? "Unsent a message"
        : x.Body.Length > 0 ? x.Body : x.PhotoId is not null ? "Sent a photo"
        : x.VoiceId is not null ? $"Voice message · {x.VoiceMs / 60000}:{x.VoiceMs / 1000 % 60:00}"
        : x.CardType == "PersonalRecord" ? "Shared a record" : x.CardType == GroupInviteCard ? "Sent a group invite"
            : x.CardType is null ? "" : "Shared a workout";

    private static long Ms(DateTime t) => new DateTimeOffset(DateTime.SpecifyKind(t, DateTimeKind.Utc)).ToUnixTimeMilliseconds();
    private static PersonDto? Person(User? u) => u is null ? null : new(u.Username, u.DisplayName, u.AvatarUrl, u.Id);
    private static string PairKey(Guid a, Guid b) => string.CompareOrdinal(a.ToString(), b.ToString()) < 0 ? $"{a}:{b}" : $"{b}:{a}";

    private static Task<bool> BlockedAsync(AppDbContext db, Guid a, Guid b) =>
        db.Blocks.AnyAsync(x => (x.BlockerId == a && x.BlockedId == b) || (x.BlockerId == b && x.BlockedId == a));

    private static GroupRef GroupOf(Group g, int members) => new(g.Id, g.Name, g.PhotoId is { } p ? Photos.PhotoEndpoints.UrlOf(p) : null, members);

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
                Other = m.Thread.Members.Where(o => o.UserId != me).Select(o => o.User).FirstOrDefault(), // ignored for a group
                m.Thread.Group,
                Count = db.GroupMembers.Count(g => g.GroupId == m.Thread.GroupId),
                // A group's newest message from someone not blocked either way (hidden for you only).
                Last = db.DirectMessages.Where(x => x.ThreadId == m.ThreadId
                        && !db.Blocks.Any(b => (b.BlockerId == me && b.BlockedId == x.SenderId) || (b.BlockerId == x.SenderId && b.BlockedId == me)))
                    .OrderByDescending(x => x.CreatedAt).FirstOrDefault(),
            })
            // A new group shows before its first message; a chat only once there is one.
            .Where(r => (r.Last != null || r.Group != null) && (r.Last == null || r.ClearedAt == null || r.Last.CreatedAt > r.ClearedAt))
            .Where(r => r.Group != null || r.Other == null || !db.Blocks.Any(b => (b.BlockerId == me && b.BlockedId == r.Other.Id) || (b.BlockerId == r.Other.Id && b.BlockedId == me)))
            .ToListAsync();
        var senderIds = rows.Where(r => r.Group != null && r.Last?.SenderId != null).Select(r => r.Last!.SenderId!.Value).Distinct().ToList();
        var senders = await db.Users.Where(u => senderIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.DisplayName);
        return Results.Ok(rows
            .OrderByDescending(r => r.Last?.CreatedAt ?? r.Group!.CreatedAt)
            .Select(r => r.Last is null
                ? new ThreadDto(r.ThreadId, null, "", Ms(r.Group!.CreatedAt), false, false, GroupOf(r.Group, r.Count))
                : new ThreadDto(r.ThreadId, r.Group is null ? Person(r.Other) : null, Preview(r.Last), Ms(r.Last.CreatedAt), r.Last.SenderId == me,
                    r.Last.SenderId != me && (r.LastReadAt == null || r.LastReadAt < r.Last.CreatedAt),
                    r.Group is null ? null : GroupOf(r.Group, r.Count),
                    r.Group is not null && r.Last.SenderId is { } by && by != me ? senders.GetValueOrDefault(by) : null)));
    }

    /// Chats with something unread, and how many requests are waiting (requests get no badge on
    /// Social, only this count inside Messages).
    private static async Task<IResult> Unread(ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var mine = db.DmMembers.Where(m => m.UserId == me && (m.ClearedAt == null || m.Thread.LastMessageAt > m.ClearedAt)
            && (m.Thread.GroupId != null
                || !m.Thread.Members.Any(o => o.UserId != me && db.Blocks.Any(b => (b.BlockerId == me && b.BlockedId == o.UserId) || (b.BlockerId == o.UserId && b.BlockedId == me)))));
        var chats = await mine.CountAsync(m => m.Accepted && db.DirectMessages.Any(x => x.ThreadId == m.ThreadId && x.SenderId != me
            && (m.LastReadAt == null || x.CreatedAt > m.LastReadAt) && (m.ClearedAt == null || x.CreatedAt > m.ClearedAt)
            && !db.Blocks.Any(b => (b.BlockerId == me && b.BlockedId == x.SenderId) || (b.BlockerId == x.SenderId && b.BlockedId == me))));
        var requests = await mine.CountAsync(m => !m.Accepted);
        return Results.Ok(new { chats, requests });
    }

    /// One conversation, by the other person's username (also before any message) or by thread
    /// id (a deleted account has no username). `before` pages back through older messages.
    private static async Task<IResult> Chat(string? username, Guid? threadId, long? before, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        var meId = caller.GetUserId();
        var me = await db.Users.FirstAsync(u => u.Id == meId);
        User? other;
        DmMember? mine = null;
        if (threadId is { } tid)
        {
            mine = await db.DmMembers.Include(m => m.Thread).ThenInclude(t => t.Group).FirstOrDefaultAsync(m => m.ThreadId == tid && m.UserId == meId);
            if (mine is null) return Results.NotFound();
            if (mine.Thread.Group is { } group) return Results.Ok(await GroupChatAsync(db, mine, group, before, clock.GetUtcNow().UtcDateTime));
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
            var reactions = await ReactionsAsync(db, [.. rows.Select(x => x.Id)], meId, false);
            messages = rows.AsEnumerable().Reverse().Select(x => Dto(x, meId, clock.GetUtcNow().UtcDateTime, !mine.Accepted, null, reactions.GetValueOrDefault(x.Id))).ToList();
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

    /// A group's chat: everyone's messages with who sent them, except people you've blocked or
    /// who blocked you (hidden for you only). No read receipts in groups.
    private static async Task<ChatDto> GroupChatAsync(AppDbContext db, DmMember mine, Group group, long? before, DateTime now)
    {
        var me = mine.UserId;
        var cutoff = before is { } b ? DateTimeOffset.FromUnixTimeMilliseconds(b).UtcDateTime : DateTime.MaxValue;
        var rows = await db.DirectMessages.Include(x => x.Sender)
            .Where(x => x.ThreadId == mine.ThreadId && x.CreatedAt < cutoff && (mine.ClearedAt == null || x.CreatedAt > mine.ClearedAt)
                && !db.Blocks.Any(bl => (bl.BlockerId == me && bl.BlockedId == x.SenderId) || (bl.BlockerId == x.SenderId && bl.BlockedId == me)))
            .OrderByDescending(x => x.CreatedAt).Take(Page).ToListAsync();
        var count = await db.GroupMembers.CountAsync(m => m.GroupId == group.Id);
        var member = await db.GroupMembers.FirstAsync(m => m.GroupId == group.Id && m.UserId == me);
        var muted = member.MutedUntil > now ? member.MutedUntil : null;
        var reactions = await ReactionsAsync(db, [.. rows.Select(x => x.Id)], me, true);
        return new ChatDto(mine.ThreadId, null, true, null, muted is null, muted is null ? null : "A moderator muted you in this chat.",
            [.. rows.AsEnumerable().Reverse().Select(x => Dto(x, me, now, false, x.SenderId == me ? null : x.Sender, reactions.GetValueOrDefault(x.Id)))], GroupOf(group, count),
            GroupEndpoints.CanModerate(member), muted is { } mu ? Ms(mu) : null);
    }

    private static async Task<bool> TheyAcceptedAsync(AppDbContext db, DmMember mine, Guid otherId) =>
        await db.DmMembers.AnyAsync(m => m.ThreadId == mine.ThreadId && m.UserId == otherId && m.Accepted);

    private static async Task<IResult> Send(SendRequest req, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        var meId = caller.GetUserId();
        var body = (req.Body ?? "").Trim();
        if (req.CardType == StoryCard)
        {
            if (body.Length == 0) return Results.BadRequest(new { error = "Write something first." });
        }
        else if (req.CardType is not null && req.CardType != GroupInviteCard)
        {
            if (!CardTypes.Contains(req.CardType)) return Results.BadRequest(new { error = "That can't be shared in a message." });
            if (string.IsNullOrEmpty(req.CardJson) || req.CardJson.Length > MaxCardJson) return Results.BadRequest(new { error = "That's too big to share." });
            try { using var _ = System.Text.Json.JsonDocument.Parse(req.CardJson); }
            catch (System.Text.Json.JsonException) { return Results.BadRequest(new { error = "That can't be shared in a message." }); }
        }
        if (body.Length == 0 && req.CardType is null && req.PhotoId is null && req.VoiceId is null) return Results.BadRequest(new { error = "Write something first." });
        if (body.Length > MaxLength) return Results.BadRequest(new { error = $"Keep it under {MaxLength} characters." });
        if (string.IsNullOrWhiteSpace(req.ClientId) || req.ClientId.Length > 64) return Results.BadRequest(new { error = "Missing message id." });

        var dup = await db.DirectMessages.FirstOrDefaultAsync(x => x.SenderId == meId && x.ClientId == req.ClientId);
        if (dup is not null) return Results.Ok(Dto(dup, meId, clock.GetUtcNow().UtcDateTime));

        var me = await db.Users.FirstAsync(u => u.Id == meId);
        User? other = null;
        DmThread? thread = null;
        var inGroup = false;
        if (req.ThreadId is { } tid)
        {
            // A group's members are its thread's members, so this also checks you're still in it.
            thread = await db.DmThreads.Include(t => t.Members).FirstOrDefaultAsync(t => t.Id == tid && t.Members.Any(m => m.UserId == meId));
            if (thread is null) return Results.NotFound(new { error = "You're not in this chat any more." });
            inGroup = thread.GroupId is not null;
            var otherId = inGroup ? null : thread.Members.Where(m => m.UserId != meId).Select(m => (Guid?)m.UserId).FirstOrDefault();
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
        if (inGroup)
        {
            if (req.CardType is StoryCard or GroupInviteCard) return Results.BadRequest(new { error = "That can't be sent to a group." });
            var muted = await db.GroupMembers.Where(m => m.GroupId == thread!.GroupId && m.UserId == meId).Select(m => m.MutedUntil).FirstOrDefaultAsync();
            if (muted > clock.GetUtcNow().UtcDateTime)
                return Results.Json(new { error = "A moderator muted you in this chat for now. You can still read it." }, statusCode: 403);
        }
        else
        {
            if (other is null) return Results.NotFound(new { error = "This account was deleted." });
            if (other.Id == meId) return Results.BadRequest(new { error = "You can't message yourself." });
            if (await BlockedAsync(db, meId, other.Id)) return Results.NotFound();
        }

        var now = clock.GetUtcNow().UtcDateTime;
        Photo? photo = null;
        if (req.PhotoId is { } photoId && (photo = await Photos.PhotoEndpoints.OwnedAsync(db, meId, photoId)) is null)
            return Results.BadRequest(new { error = "That photo didn't upload. Try again." });
        VoiceNote? voice = null;
        if (req.VoiceId is { } voiceId && (voice = await Voice.VoiceEndpoints.OwnedAsync(db, meId, voiceId)) is null)
            return Results.BadRequest(new { error = "That voice message didn't upload. Try again." });
        var cardJson = req.CardType is null ? null : req.CardJson;
        if (req.CardType == StoryCard)
        {
            Guid storyId;
            try
            {
                using var doc = JsonDocument.Parse(req.CardJson ?? "");
                storyId = doc.RootElement.GetProperty("storyId").GetGuid();
            }
            catch (Exception e) when (e is JsonException or InvalidOperationException or FormatException or KeyNotFoundException)
            {
                return Results.BadRequest(new { error = "Missing story." });
            }
            var story = await StoryEndpoints.Visible(db, meId, now).FirstOrDefaultAsync(s => s.Id == storyId && s.AuthorId == other!.Id);
            if (story is null) return Results.NotFound(new { error = "This story has gone." });
            if (!await StoryEndpoints.MayReplyAsync(db, other!, meId))
                return Results.Json(new { error = "They've turned replies off." }, statusCode: 403);
            cardJson = new JsonObject
            {
                ["storyId"] = story.Id,
                ["type"] = story.CardType,
                ["data"] = story.CardJson.Length > 0 ? JsonNode.Parse(story.CardJson) : null,
                ["photoUrl"] = story.PhotoId is { } sp ? Photos.PhotoEndpoints.UrlOf(sp) : null,
                ["photoWidth"] = story.PhotoWidth,
                ["photoHeight"] = story.PhotoHeight,
                ["expiresAtMs"] = Ms(story.ExpiresAt),
            }.ToJsonString();
        }
        else if (req.CardType == GroupInviteCard)
        {
            Guid groupId;
            try
            {
                using var doc = JsonDocument.Parse(req.CardJson ?? "");
                groupId = doc.RootElement.GetProperty("groupId").GetGuid();
            }
            catch (Exception e) when (e is JsonException or InvalidOperationException or FormatException or KeyNotFoundException)
            {
                return Results.BadRequest(new { error = "Missing group." });
            }
            if (await db.GroupMembers.AnyAsync(m => m.GroupId == groupId && m.UserId == other!.Id))
                return Results.BadRequest(new { error = "They're already in the group." });
            cardJson = await GroupEndpoints.InviteCardAsync(db, groupId, meId, other!.Id, now);
            if (cardJson is null) return Results.NotFound(new { error = "You're not in that group any more." });
        }

        var mine = thread?.Members.FirstOrDefault(m => m.UserId == meId);
        var theirs = inGroup ? null : thread?.Members.FirstOrDefault(m => m.UserId == other!.Id);
        if (!inGroup && theirs is not { Accepted: true })
        {
            var route = mine is { Accepted: false } ? Route.Chats : await RouteAsync(db, me, other!); // replying to their request
            if (route == Route.Refused)
                return Results.Json(new { error = "This account only gets messages from people it follows." }, statusCode: 403);
            if (thread is null)
            {
                thread = new DmThread { PairKey = PairKey(meId, other!.Id) };
                db.DmThreads.Add(thread);
                thread.Members.Add(mine = new DmMember { UserId = meId, Accepted = true });
                thread.Members.Add(theirs = new DmMember { UserId = other!.Id, Accepted = route == Route.Chats });
            }
            else
            {
                if (theirs is null) thread.Members.Add(theirs = new DmMember { UserId = other!.Id });
                if (route == Route.Chats) theirs.Accepted = true;
            }
        }
        if (mine is null) thread!.Members.Add(mine = new DmMember { UserId = meId });
        mine.Accepted = true; // replying accepts a request
        mine.LastReadAt = now;
        var message = new DirectMessage
        {
            ClientId = req.ClientId, Thread = thread!, SenderId = meId, Body = body, CreatedAt = now,
            CardType = req.CardType, CardJson = cardJson,
            PhotoId = photo?.Id, PhotoWidth = photo?.Width ?? 0, PhotoHeight = photo?.Height ?? 0,
            VoiceId = voice?.Id, VoiceMs = voice?.DurationMs ?? 0, VoicePeaks = voice is null ? null : Voice.VoiceEndpoints.Peaks(req.VoicePeaks),
        };
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
            var key = PairKey(meId, other!.Id);
            var id = await db.DmThreads.Where(t => t.PairKey == key).Select(t => t.Id).FirstAsync();
            return await Send(req with { Username = null, ThreadId = id }, caller, db, clock);
        }
        return Results.Ok(Dto(message, meId, now));
    }

    /// As on Instagram: your own text, within 15 minutes of sending it.
    public static readonly TimeSpan EditWindow = TimeSpan.FromMinutes(15);
    public record EditRequest(string? Body);

    private static async Task<IResult> Edit(Guid id, EditRequest req, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        var me = caller.GetUserId();
        var message = await db.DirectMessages.FirstOrDefaultAsync(m => m.Id == id && m.SenderId == me && m.DeletedAt == null);
        if (message is null) return Results.NotFound();
        var body = (req.Body ?? "").Trim();
        if (message.Body.Length == 0) return Results.BadRequest(new { error = "Only text can be edited." });
        if (body.Length == 0) return Results.BadRequest(new { error = "Write something, or unsend it instead." });
        if (body.Length > MaxLength) return Results.BadRequest(new { error = $"Keep it under {MaxLength} characters." });
        var now = clock.GetUtcNow().UtcDateTime;
        if (now - message.CreatedAt > EditWindow) return Results.BadRequest(new { error = "Messages can be edited for 15 minutes after they're sent." });
        if (body != message.Body)
        {
            message.Body = body;
            message.EditedAt = now;
            await db.SaveChangesAsync();
        }
        return Results.Ok(Dto(message, me, now));
    }

    /// Unsend (Instagram): the message goes for everyone, with its photo.
    private static async Task<IResult> Unsend(Guid id, ClaimsPrincipal caller, AppDbContext db, Photos.IPhotoStore store, CancellationToken ct)
    {
        var me = caller.GetUserId();
        if (!await db.DirectMessages.AnyAsync(m => m.Id == id && m.SenderId == me && m.DeletedAt == null, ct)) return Results.NotFound();
        await UnsendAsync(db, store, id, ct);
        return Results.NoContent();
    }

    /// Empties a message and deletes the photo or recording sent with it; both people then see where it was
    /// ("unsent a message", or "removed by LogIt" when a report is upheld).
    public static async Task UnsendAsync(AppDbContext db, Photos.IPhotoStore store, Guid id, CancellationToken ct, bool byLogIt = false, bool byModerator = false)
    {
        var message = await db.DirectMessages.FirstOrDefaultAsync(m => m.Id == id, ct);
        if (message is null || message.DeletedAt is not null) return;
        if (message.PhotoId is { } photo && message.SenderId is { } sender)
            await Photos.PhotoEndpoints.DeleteOwnedAsync(db, store, sender, [photo], ct);
        if (message.VoiceId is { } voiceId && await db.VoiceNotes.FirstOrDefaultAsync(v => v.Id == voiceId && v.OwnerId == message.SenderId, ct) is { } voice)
        {
            await store.DeleteAsync(Voice.VoiceEndpoints.KeyOf(voice.Id), ct);
            db.VoiceNotes.Remove(voice);
        }
        message.Body = "";
        message.CardType = null;
        message.CardJson = null;
        message.PhotoId = null;
        message.PhotoWidth = message.PhotoHeight = 0;
        message.DeletedAt = DateTime.UtcNow;
        message.RemovedByLogIt = byLogIt;
        message.RemovedByModerator = byModerator;
        message.VoiceId = null;
        message.VoiceMs = 0;
        message.VoicePeaks = null;
        db.DmReactions.RemoveRange(await db.DmReactions.Where(r => r.MessageId == id).ToListAsync(ct));
        await db.SaveChangesAsync(ct);
    }

    /// React to a message, change your reaction, or take it back (Emoji null). One per person,
    /// like Instagram; only in chats you've accepted, never across a block, not while muted.
    /// Returns the message's reactions as you now see them.
    private static async Task<IResult> React(Guid id, ReactRequest req, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        var me = caller.GetUserId();
        var now = clock.GetUtcNow().UtcDateTime;
        if (req.Emoji is { } pick && !Reactions.Contains(pick)) return Results.BadRequest(new { error = "That reaction isn't available." });
        var msg = await db.DirectMessages.Include(m => m.Thread).FirstOrDefaultAsync(m => m.Id == id && m.DeletedAt == null);
        if (msg is null) return Results.NotFound();
        var member = await db.DmMembers.FirstOrDefaultAsync(m => m.ThreadId == msg.ThreadId && m.UserId == me);
        if (member is null || (member.ClearedAt is { } cleared && msg.CreatedAt <= cleared)) return Results.NotFound();
        if (!member.Accepted) return Results.BadRequest(new { error = "Accept the request first." });
        if (msg.Thread.GroupId is { } groupId)
        {
            if (msg.SenderId is { } sender && sender != me && await BlockedAsync(db, me, sender)) return Results.NotFound();
            var gm = await db.GroupMembers.FirstOrDefaultAsync(m => m.GroupId == groupId && m.UserId == me);
            if (gm is null) return Results.NotFound();
            if (gm.MutedUntil > now) return Results.BadRequest(new { error = "A moderator muted you in this chat." });
        }
        else
        {
            var other = await db.DmMembers.Where(m => m.ThreadId == msg.ThreadId && m.UserId != me).Select(m => (Guid?)m.UserId).FirstOrDefaultAsync();
            if (other is { } o && await BlockedAsync(db, me, o)) return Results.NotFound();
        }

        var mine = await db.DmReactions.FirstOrDefaultAsync(r => r.MessageId == id && r.UserId == me);
        if (req.Emoji is null) { if (mine is not null) db.DmReactions.Remove(mine); }
        else if (mine is null) db.DmReactions.Add(new DmReaction { MessageId = id, UserId = me, Emoji = req.Emoji, CreatedAt = now });
        else { mine.Emoji = req.Emoji; mine.CreatedAt = now; mine.PushedAt = null; }
        await db.SaveChangesAsync();

        var all = (await ReactionsAsync(db, [id], me, msg.Thread.GroupId is not null)).GetValueOrDefault(id);
        return Results.Ok(Dto(msg, me, now, false, null, all).Reactions ?? []);
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
