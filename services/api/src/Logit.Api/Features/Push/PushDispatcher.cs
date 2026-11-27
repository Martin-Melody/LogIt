using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Push;

/// Turns new in-app notifications into pushes, once a minute, the way the 2026-11-23 decision set out:
/// - coach messages and coaching go out straight away;
/// - likes, comments and follows are gathered: at most one push per <see cref="BundleGap"/>,
///   which covers everything waiting;
/// - in quiet mode everything waits, and one summary goes out when it ends;
/// - "Pause all" and the per-type choices drop pushes (the Inbox still has them), and so does
///   reading the notification in the app first.
/// Workout reminders and rest alerts are local to the phone and never come through here.
public class PushDispatcher(IServiceScopeFactory scopes, ILogger<PushDispatcher> log, TimeProvider clock) : BackgroundService
{
    public static readonly TimeSpan BundleGap = TimeSpan.FromHours(4);
    /// Older than this and a push would only confuse.
    public static readonly TimeSpan MaxAge = TimeSpan.FromDays(2);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(TimeSpan.FromMinutes(1), clock, stoppingToken); }
        catch (OperationCanceledException) { return; }

        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1), clock);
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                await DispatchAsync(scope.ServiceProvider, stoppingToken);
            }
            catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
            {
                log.LogError(ex, "Push dispatch failed");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    /// One pass; returns how many pushes went out. Public so tests can run it.
    public static async Task<int> DispatchAsync(IServiceProvider services, CancellationToken ct)
    {
        var sender = services.GetRequiredService<IPushSender>();
        if (!sender.IsConfigured) return 0;
        var db = services.GetRequiredService<AppDbContext>();
        var now = services.GetRequiredService<TimeProvider>().GetUtcNow().UtcDateTime;

        // Nobody to push to, or too old: done with them.
        var tooOld = now - MaxAge;
        await db.Notifications
            .Where(n => n.PushedAt == null && (n.CreatedAt < tooOld || !db.PushDevices.Any(d => d.UserId == n.UserId)))
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.PushedAt, now), ct);

        var pending = await db.Notifications.Include(n => n.Actor).Include(n => n.Group).Include(n => n.Event)
            .Where(n => n.PushedAt == null)
            .OrderBy(n => n.CreatedAt)
            .Take(2000)
            .ToListAsync(ct);

        var sent = 0;
        foreach (var group in pending.GroupBy(n => n.UserId))
        {
            var userId = group.Key;
            var settings = await SettingsFor(db, userId, ct);

            var following = settings.Likes == PushAudience.Following || settings.Comments == PushAudience.Following
                ? (await db.Follows.Where(f => f.FollowerId == userId).Select(f => f.FollowedId).ToListAsync(ct)).ToHashSet()
                : [];
            var paused = settings.PausedUntil > now;
            // A cheer is only worth a push mid-workout; afterwards it stays in the Inbox only.
            var stillTraining = !group.Any(n => n.Type == NotificationType.Cheer)
                || await db.Users.AnyAsync(u => u.Id == userId && u.TrainingUntil > now, ct);
            var wanted = new List<Notification>();
            foreach (var n in group)
            {
                if (!paused && n.ReadAt is null && Wanted(settings, n, following)
                    && (n.Type != NotificationType.Cheer || stillTraining)) wanted.Add(n);
                else n.PushedAt = now;
            }
            if (wanted.Count == 0 || InQuiet(settings, now)) continue;

            // Coaching and cheers go straight away; a cheer is no use an hour after the workout.
            var instant = wanted.Where(n => Of(n.Type) is Kind.Coaching or Kind.Cheers or Kind.Groups).ToList();
            List<Notification> batch;
            if (instant.Count < wanted.Count && (settings.LastBundleAt is null || now - settings.LastBundleAt >= BundleGap))
            {
                batch = wanted;
                settings.LastBundleAt = now;
            }
            else batch = instant;
            if (batch.Count == 0) continue;

            sent += await SendAsync(db, sender, userId, Compose(batch), ct);
            // Marked even when sending failed: the Inbox has them, and a retry storm helps nobody.
            foreach (var n in batch) n.PushedAt = now;
        }

        sent += await DispatchMessagesAsync(db, sender, now, ct);
        sent += await DispatchDirectMessagesAsync(db, sender, now, ct);
        sent += await DispatchReactionsAsync(db, sender, now, ct);
        await db.SaveChangesAsync(ct);
        return sent;
    }

    /// Coach messages, straight away on their own channel ("Sam" / "sent you a message"). Pause,
    /// the Messages switch and reading them first drop them; quiet mode holds them.
    private static async Task<int> DispatchMessagesAsync(AppDbContext db, IPushSender sender, DateTime now, CancellationToken ct)
    {
        var tooOld = now - MaxAge;
        await db.CoachMessages.Where(m => m.PushedAt == null && m.SyncedAt < tooOld)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.PushedAt, now), ct);
        var pending = await db.CoachMessages.Include(m => m.Sender).Include(m => m.Relationship)
            .Where(m => m.PushedAt == null)
            .OrderBy(m => m.SyncedAt)
            .Take(2000)
            .ToListAsync(ct);

        var sent = 0;
        var toRecipient = pending.GroupBy(m => m.SenderUserId == m.Relationship.CoachId ? m.Relationship.ClientId : m.Relationship.CoachId);
        foreach (var group in toRecipient)
        {
            if (!await db.PushDevices.AnyAsync(d => d.UserId == group.Key, ct))
            {
                foreach (var m in group) m.PushedAt = now;
                continue;
            }
            var settings = await SettingsFor(db, group.Key, ct);
            var wanted = new List<CoachMessage>();
            foreach (var m in group)
            {
                if (settings.Messages && !(settings.PausedUntil > now) && m.ReadAtMs is null) wanted.Add(m);
                else m.PushedAt = now;
            }
            if (wanted.Count == 0 || InQuiet(settings, now)) continue;

            var names = wanted.AsEnumerable().Reverse().Select(m => m.Sender).DistinctBy(u => u.Id).Select(NameOf).ToList();
            var message = new PushMessage(
                names.Count == 1 ? names[0] : names.Count == 2 ? $"{names[0]} and {names[1]}" : $"{names[0]} and {names.Count - 1} others",
                names.Count > 1 ? $"{wanted.Count} messages"
                    : wanted.Count == 1 ? StepText(wanted[0].Kind) ?? "sent you a message"
                    : StepText(wanted[^1].Kind) is { } step ? step : $"sent you {wanted.Count} messages",
                "messages",
                wanted.Select(m => m.RelationshipId).Distinct().Count() == 1
                    ? new Dictionary<string, string> { ["type"] = "Message", ["relationshipId"] = wanted[0].RelationshipId.ToString() }
                    : new Dictionary<string, string> { ["type"] = "Message" });
            sent += await SendAsync(db, sender, group.Key, message, ct);
            foreach (var m in wanted) m.PushedAt = now;
        }
        return sent;
    }

    /// A request step said the way a push says it (who, then what; never the words).
    private static string? StepText(string? kind) => kind switch
    {
        "offer" => "offered you a spot",
        "offer-changed" => "changed their offer",
        "offer-withdrawn" => "withdrew their offer",
        "waitlist" => "put you on their waiting list",
        "closed" => "answered your request",
        "reopened" => "reopened your request",
        "withdrawn" => "withdrew their request",
        "joined" => "took the spot",
        _ => null,
    };

    /// Messages between people, like coach messages: straight away, who and never what. A message
    /// that lands in someone's requests makes no push (Instagram); reading it first drops it.
    private static async Task<int> DispatchDirectMessagesAsync(AppDbContext db, IPushSender sender, DateTime now, CancellationToken ct)
    {
        var tooOld = now - MaxAge;
        // Too old, or unsent before its push went out: done with them.
        await db.DirectMessages.Where(m => m.PushedAt == null && (m.CreatedAt < tooOld || m.DeletedAt != null))
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.PushedAt, now), ct);
        var pending = await db.DirectMessages.Include(m => m.Sender)
            .Where(m => m.PushedAt == null)
            .OrderBy(m => m.CreatedAt)
            .Take(2000)
            .ToListAsync(ct);

        var sent = 0;
        var recipients = await db.DmMembers
            .Where(r => pending.Select(m => m.ThreadId).Contains(r.ThreadId))
            .ToListAsync(ct);
        var toRecipient = pending
            .SelectMany(m => recipients.Where(r => r.ThreadId == m.ThreadId && r.UserId != m.SenderId).Select(r => (r, m)))
            .GroupBy(x => x.r.UserId);
        // Group chats: the group's name, and each member's choice (every message; mentions only; off).
        var threadIds = pending.Select(m => m.ThreadId).Distinct().ToList();
        var groups = await db.DmThreads.Where(t => threadIds.Contains(t.Id) && t.GroupId != null)
            .Select(t => new { t.Id, GroupId = t.GroupId!.Value, t.Group!.Name }).ToDictionaryAsync(t => t.Id, ct);
        var groupIds = groups.Values.Select(g => g.GroupId).ToList();
        var levels = await db.GroupMembers.Where(m => groupIds.Contains(m.GroupId))
            .Select(m => new { m.GroupId, m.UserId, m.Notify, m.User.Username }).ToListAsync(ct);
        foreach (var m in pending) m.PushedAt = now;
        foreach (var group in toRecipient)
        {
            if (!await db.PushDevices.AnyAsync(d => d.UserId == group.Key, ct)) continue;
            var settings = await SettingsFor(db, group.Key, ct);
            if (!settings.Messages || settings.PausedUntil > now) continue;
            var blocked = await db.Blocks.Where(b => b.BlockerId == group.Key || b.BlockedId == group.Key)
                .Select(b => b.BlockerId == group.Key ? b.BlockedId : b.BlockerId).ToListAsync(ct);
            var wanted = group.Where(x => x.r.Accepted && !(x.r.LastReadAt >= x.m.CreatedAt) && x.m.Sender is not null && !blocked.Contains(x.m.Sender.Id))
                .Select(x => x.m).ToList();
            if (wanted.Count == 0) continue;
            if (InQuiet(settings, now))
            {
                foreach (var m in wanted) m.PushedAt = null; // held until quiet time ends
                continue;
            }
            var direct = wanted.Where(m => !groups.ContainsKey(m.ThreadId)).ToList();
            if (direct.Count > 0)
            {
                var names = direct.AsEnumerable().Reverse().Select(m => m.Sender!).DistinctBy(u => u.Id).Select(NameOf).ToList();
                var message = new PushMessage(
                    names.Count == 1 ? names[0] : names.Count == 2 ? $"{names[0]} and {names[1]}" : $"{names[0]} and {names.Count - 1} others",
                    names.Count > 1 ? $"{direct.Count} messages" : direct.Count == 1 ? "sent you a message" : $"sent you {direct.Count} messages",
                    "messages",
                    direct.Select(m => m.ThreadId).Distinct().Count() == 1
                        ? new Dictionary<string, string> { ["type"] = "DirectMessage", ["threadId"] = direct[0].ThreadId.ToString() }
                        : new Dictionary<string, string> { ["type"] = "DirectMessage" });
                sent += await SendAsync(db, sender, group.Key, message, ct);
            }
            foreach (var chat in wanted.Where(m => groups.ContainsKey(m.ThreadId)).GroupBy(m => m.ThreadId))
            {
                var g = groups[chat.Key];
                var me = levels.FirstOrDefault(l => l.GroupId == g.GroupId && l.UserId == group.Key);
                if (me is null || me.Notify == GroupNotify.Off) continue;
                var mentions = chat.Where(m => Mentions(m.Body, me.Username)).ToList();
                var messages = me.Notify == GroupNotify.All ? chat.ToList() : mentions;
                if (messages.Count == 0) continue;
                var who = NameOf(messages[^1].Sender!);
                var body = mentions.Count > 0 && messages.Count == 1 ? $"{who} mentioned you"
                    : messages.Count == 1 ? $"{who} sent a message" : $"{messages.Count} new messages";
                sent += await SendAsync(db, sender, group.Key, new PushMessage(g.Name, body, "messages",
                    new Dictionary<string, string> { ["type"] = "DirectMessage", ["threadId"] = chat.Key.ToString() }), ct);
            }
        }
        return sent;
    }

    /// Reactions to your messages (Instagram: "Sam reacted 💪 to your message"), in chats between
    /// people and coach threads. Only to the message's sender, never for your own, never across a
    /// block; the Messages switch, pause and a group's Off drop them; quiet mode holds them.
    private static async Task<int> DispatchReactionsAsync(AppDbContext db, IPushSender sender, DateTime now, CancellationToken ct)
    {
        var tooOld = now - MaxAge;
        await db.DmReactions.Where(r => r.PushedAt == null && r.CreatedAt < tooOld).ExecuteUpdateAsync(s => s.SetProperty(r => r.PushedAt, now), ct);
        await db.CoachMessages.Where(m => m.Reaction != null && m.ReactionPushedAt == null && m.ReactedAt < tooOld)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.ReactionPushedAt, now), ct);

        // (recipient, who reacted, emoji, chat title or null, push data)
        var items = new List<(Guid To, User From, string Emoji, string? Title, Dictionary<string, string> Data, Action Hold)>();
        var dm = await db.DmReactions.Include(r => r.User).Include(r => r.Message).ThenInclude(m => m.Thread).ThenInclude(t => t!.Group)
            .Where(r => r.PushedAt == null).OrderBy(r => r.CreatedAt).Take(2000).ToListAsync(ct);
        foreach (var r in dm)
        {
            r.PushedAt = now;
            var m = r.Message;
            if (m.SenderId is not { } to || to == r.UserId || m.DeletedAt is not null) continue;
            var thread = m.Thread;
            if (thread.GroupId is { } gid
                && await db.GroupMembers.AnyAsync(g => g.GroupId == gid && g.UserId == to && g.Notify == GroupNotify.Off, ct)) continue;
            items.Add((to, r.User, r.Emoji, thread.Group?.Name, new Dictionary<string, string> { ["type"] = "DirectMessage", ["threadId"] = thread.Id.ToString() },
                () => r.PushedAt = null));
        }
        var coach = await db.CoachMessages.Include(m => m.Relationship)
            .Where(m => m.Reaction != null && m.ReactionPushedAt == null).Take(2000).ToListAsync(ct);
        foreach (var m in coach)
        {
            m.ReactionPushedAt = now;
            var reactorId = m.SenderUserId == m.Relationship.CoachId ? m.Relationship.ClientId : m.Relationship.CoachId;
            var reactor = await db.Users.FirstOrDefaultAsync(u => u.Id == reactorId, ct);
            if (reactor is null) continue;
            items.Add((m.SenderUserId, reactor, m.Reaction!, null,
                new Dictionary<string, string> { ["type"] = "Message", ["relationshipId"] = m.RelationshipId.ToString() },
                () => m.ReactionPushedAt = null));
        }

        var sent = 0;
        foreach (var group in items.GroupBy(i => i.To))
        {
            if (!await db.PushDevices.AnyAsync(d => d.UserId == group.Key, ct)) continue;
            var settings = await SettingsFor(db, group.Key, ct);
            if (!settings.Messages || settings.PausedUntil > now) continue;
            var blocked = await db.Blocks.Where(b => b.BlockerId == group.Key || b.BlockedId == group.Key)
                .Select(b => b.BlockerId == group.Key ? b.BlockedId : b.BlockerId).ToListAsync(ct);
            var wanted = group.Where(i => !blocked.Contains(i.From.Id)).ToList();
            if (wanted.Count == 0) continue;
            if (InQuiet(settings, now))
            {
                foreach (var i in wanted) i.Hold(); // held until quiet time ends
                continue;
            }
            var last = wanted[^1];
            var who = NameOf(last.From);
            var message = wanted.Count == 1
                ? new PushMessage(last.Title ?? who, last.Title is null ? $"reacted {last.Emoji} to your message" : $"{who} reacted {last.Emoji} to your message", "messages", last.Data)
                : new PushMessage(wanted.Select(i => i.From.Id).Distinct().Count() == 1 ? who : "Reactions", $"{wanted.Count} reactions to your messages", "messages",
                    wanted.Select(i => string.Join(",", i.Data.Values)).Distinct().Count() == 1 ? last.Data : new Dictionary<string, string> { ["type"] = last.Data["type"] });
            sent += await SendAsync(db, sender, group.Key, message, ct);
        }
        return sent;
    }

    /// "@ava" in a group message (not "email@ava.ie" or "@avalanche").
    public static bool Mentions(string body, string username) =>
        System.Text.RegularExpressions.Regex.IsMatch(body, $@"(?<![\w@.])@{System.Text.RegularExpressions.Regex.Escape(username)}(?![\w])",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);

    /// A user's choices; a row with the defaults is made the first time (it also keeps LastBundleAt).
    private static async Task<PushSettings> SettingsFor(AppDbContext db, Guid userId, CancellationToken ct)
    {
        var settings = await db.PushSettings.FindAsync([userId], ct);
        if (settings is null) db.PushSettings.Add(settings = new PushSettings { UserId = userId });
        return settings;
    }

    /// To each of the user's phones; tokens Firebase says are dead are deleted.
    private static async Task<int> SendAsync(AppDbContext db, IPushSender sender, Guid userId, PushMessage message, CancellationToken ct)
    {
        var sent = 0;
        foreach (var device in await db.PushDevices.Where(d => d.UserId == userId).ToListAsync(ct))
        {
            var result = await sender.SendAsync(device.Token, message, ct);
            if (result == PushResult.BadToken) db.PushDevices.Remove(device);
            if (result == PushResult.Sent) sent++;
        }
        return sent;
    }

    private static string NameOf(User u) => string.IsNullOrWhiteSpace(u.DisplayName) ? u.Username : u.DisplayName;

    public enum Kind { Likes, Comments, Follows, Coaching, Cheers, Groups }

    public static Kind Of(NotificationType type) => type switch
    {
        NotificationType.Like or NotificationType.Repost or NotificationType.StoryCheer => Kind.Likes,
        NotificationType.Comment or NotificationType.Reply or NotificationType.Mention or NotificationType.Quote or NotificationType.GroupPostReply => Kind.Comments,
        NotificationType.Follow or NotificationType.FollowRequest or NotificationType.FollowAccepted => Kind.Follows,
        NotificationType.Cheer => Kind.Cheers,
        NotificationType.GroupNote or NotificationType.GroupRequest or NotificationType.GroupApproved or NotificationType.GroupEvent
            or NotificationType.GroupEventChanged or NotificationType.GroupEventCancelled or NotificationType.GroupEventReminder
            or NotificationType.GroupReport or NotificationType.GroupDeclined => Kind.Groups,
        _ => Kind.Coaching,
    };

    private static bool Wanted(PushSettings s, Notification n, HashSet<Guid> following)
    {
        bool From(PushAudience a) => a == PushAudience.Everyone || (a == PushAudience.Following && following.Contains(n.ActorId));
        return Of(n.Type) switch
        {
            Kind.Likes => From(s.Likes),
            Kind.Comments => From(s.Comments),
            Kind.Follows => s.Follows,
            Kind.Cheers => s.Cheers,
            // The group's own notification choice was applied when the notification was made.
            Kind.Groups => s.Messages,
            _ => s.Coaching,
        };
    }

    /// Whether quiet mode is on at this moment in the user's own time zone. A window that crosses
    /// midnight belongs to the day it starts on.
    public static bool InQuiet(PushSettings s, DateTime utcNow)
    {
        if (!s.QuietOn || s.QuietFromMinute == s.QuietToMinute) return false;
        var zone = TimeZoneInfo.TryFindSystemTimeZoneById(s.TimeZone, out var z) ? z : TimeZoneInfo.Utc;
        var local = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc), zone);
        var minute = local.Hour * 60 + local.Minute;
        bool On(DateTime d) => (s.QuietDays & (1 << (((int)d.DayOfWeek + 6) % 7))) != 0;
        return s.QuietFromMinute < s.QuietToMinute
            ? On(local) && minute >= s.QuietFromMinute && minute < s.QuietToMinute
            : (minute >= s.QuietFromMinute && On(local)) || (minute < s.QuietToMinute && On(local.AddDays(-1)));
    }

    /// Same wording as the app's Inbox.
    private static string What(Notification n) => n.Type switch
    {
        NotificationType.Like => n.CommentId is null ? "liked your post" : "liked your comment",
        NotificationType.Mention => n.CommentId is null ? "mentioned you in a post" : "mentioned you in a comment",
        NotificationType.Reply => "replied to your comment",
        NotificationType.Repost => "reposted your post",
        NotificationType.Quote => "quoted your post",
        NotificationType.Comment => "commented on your post",
        NotificationType.Follow => "followed you",
        NotificationType.FollowRequest => "asked to follow you",
        NotificationType.FollowAccepted => "accepted your follow request",
        NotificationType.CoachInvite => "wants to coach you",
        NotificationType.CoachProgram => "sent you a program",
        NotificationType.CoachPaymentFailed => "couldn't take your coaching payment",
        NotificationType.Cheer => "is cheering you on",
        NotificationType.StoryCheer => "cheered your story",
        NotificationType.GroupNote => n.Group is null ? "pinned a note" : $"pinned a note in {n.Group.Name}",
        NotificationType.GroupRequest => n.Group is null ? "asked to join your group" : $"asked to join {n.Group.Name}",
        NotificationType.GroupApproved => n.Group is null ? "let you into the group" : $"let you into {n.Group.Name}",
        NotificationType.GroupEvent => $"added {n.Event?.Title ?? "an event"}",
        NotificationType.GroupEventChanged => $"changed the time or place of {n.Event?.Title ?? "an event"}",
        NotificationType.GroupEventCancelled => $"cancelled {n.Event?.Title ?? "an event"}",
        NotificationType.GroupEventReminder => $"{n.Event?.Title ?? "Your event"} is tomorrow",
        NotificationType.GroupReport => n.Group is null ? "Something in your group was reported" : $"Something in {n.Group.Name} was reported",
        NotificationType.GroupDeclined => "The organisers didn't approve your request",
        NotificationType.GroupPostReply => n.Group is null ? "replied to you in a group" : $"replied to you in {n.Group.Name}",
        _ => "sent you something",
    };

    private static (string One, string Many) Noun(NotificationType t) => t switch
    {
        NotificationType.Like => ("like", "likes"),
        NotificationType.Comment or NotificationType.Reply => ("comment", "comments"),
        NotificationType.Mention => ("mention", "mentions"),
        NotificationType.Repost or NotificationType.Quote => ("repost", "reposts"),
        NotificationType.Follow => ("new follower", "new followers"),
        NotificationType.FollowRequest => ("follow request", "follow requests"),
        NotificationType.FollowAccepted => ("accepted request", "accepted requests"),
        NotificationType.Cheer => ("cheer", "cheers"),
        NotificationType.GroupNote => ("group note", "group notes"),
        NotificationType.GroupRequest => ("request to join", "requests to join"),
        NotificationType.GroupApproved => ("group joined", "groups joined"),
        NotificationType.GroupEvent => ("new event", "new events"),
        NotificationType.GroupEventChanged => ("event change", "event changes"),
        NotificationType.GroupEventCancelled => ("cancelled event", "cancelled events"),
        NotificationType.GroupEventReminder => ("event tomorrow", "events tomorrow"),
        NotificationType.GroupReport => ("report", "reports"),
        NotificationType.GroupDeclined => ("request not approved", "requests not approved"),
        NotificationType.GroupPostReply => ("reply", "replies"),
        _ => ("coaching update", "coaching updates"),
    };

    /// Title says who, body says what: "Ava and 3 others" / "liked your post", or for a mix
    /// "Ava and 2 others" / "4 likes, 2 comments and 1 new follower" (always in that order).
    public static PushMessage Compose(IReadOnlyList<Notification> batch)
    {
        // One group event on its own: the group's name, then who did what ("Conor added Deadlift
        // day"), or just "Deadlift day is tomorrow" for the reminder.
        // A report in a group: the group's name, never who reported it.
        if (batch.Count == 1 && batch[0] is { Type: NotificationType.GroupReport, Group: not null } report)
            return new PushMessage(report.Group.Name, "Something was reported. Open Reports in the group's ⋯", "social",
                new Dictionary<string, string> { ["type"] = "GroupReport", ["count"] = "1", ["notificationId"] = report.Id.ToString() });
        // Not approved: the group's name, never which organiser (canvas K8).
        if (batch.Count == 1 && batch[0] is { Type: NotificationType.GroupDeclined, Group: not null } declined)
            return new PushMessage(declined.Group.Name, What(declined), "social",
                new Dictionary<string, string> { ["type"] = "GroupDeclined", ["count"] = "1", ["notificationId"] = declined.Id.ToString() });
        if (batch.Count == 1 && batch[0] is { Event: not null, Group: not null } one)
            return new PushMessage(one.Group.Name, one.Type == NotificationType.GroupEventReminder ? What(one) : $"{NameOf(one.Actor)} {What(one)}", "social",
                new Dictionary<string, string> { ["type"] = one.Type.ToString(), ["count"] = "1", ["notificationId"] = one.Id.ToString(), ["eventId"] = one.EventId.ToString()! });
        var newest = batch.OrderByDescending(n => n.CreatedAt).ToList();
        var names = newest.Select(n => n.Actor).DistinctBy(a => a.Id)
            .Select(NameOf).ToList();
        var title = names.Count switch
        {
            1 => names[0],
            2 => $"{names[0]} and {names[1]}",
            _ => $"{names[0]} and {names.Count - 1} others",
        };

        var whats = newest.Select(What).Distinct().ToList();
        string body;
        if (whats.Count == 1 && newest.Select(n => n.PostId).Distinct().Count() == 1) body = whats[0];
        else
        {
            var parts = newest.OrderBy(n => Of(n.Type)).GroupBy(n => Noun(n.Type))
                .Select(g => $"{g.Count()} {(g.Count() == 1 ? g.Key.One : g.Key.Many)}").ToList();
            body = parts.Count == 1 ? parts[0] : $"{string.Join(", ", parts[..^1])} and {parts[^1]}";
        }

        var data = new Dictionary<string, string> { ["type"] = newest[0].Type.ToString(), ["count"] = batch.Count.ToString() };
        if (batch.Count == 1)
        {
            data["notificationId"] = newest[0].Id.ToString();
            if (newest[0].PostId is { } postId) data["postId"] = postId.ToString();
        }
        var channel = batch.All(n => Of(n.Type) == Kind.Coaching) ? "coaching" : "social";
        return new PushMessage(title, body, channel, data);
    }
}
