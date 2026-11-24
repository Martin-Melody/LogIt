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

        var pending = await db.Notifications.Include(n => n.Actor)
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
            var wanted = new List<Notification>();
            foreach (var n in group)
            {
                if (!paused && n.ReadAt is null && Wanted(settings, n, following)) wanted.Add(n);
                else n.PushedAt = now;
            }
            if (wanted.Count == 0 || InQuiet(settings, now)) continue;

            // Coaching and cheers go straight away; a cheer is no use an hour after the workout.
            var instant = wanted.Where(n => Of(n.Type) is Kind.Coaching or Kind.Cheers).ToList();
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
                names.Count > 1 ? $"{wanted.Count} messages" : wanted.Count == 1 ? "sent you a message" : $"sent you {wanted.Count} messages",
                "messages",
                wanted.Select(m => m.RelationshipId).Distinct().Count() == 1
                    ? new Dictionary<string, string> { ["type"] = "Message", ["relationshipId"] = wanted[0].RelationshipId.ToString() }
                    : new Dictionary<string, string> { ["type"] = "Message" });
            sent += await SendAsync(db, sender, group.Key, message, ct);
            foreach (var m in wanted) m.PushedAt = now;
        }
        return sent;
    }

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

    public enum Kind { Likes, Comments, Follows, Coaching, Cheers }

    public static Kind Of(NotificationType type) => type switch
    {
        NotificationType.Like or NotificationType.Repost => Kind.Likes,
        NotificationType.Comment or NotificationType.Reply or NotificationType.Mention or NotificationType.Quote => Kind.Comments,
        NotificationType.Follow or NotificationType.FollowRequest or NotificationType.FollowAccepted => Kind.Follows,
        NotificationType.Cheer => Kind.Cheers,
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
        _ => ("coaching update", "coaching updates"),
    };

    /// Title says who, body says what: "Ava and 3 others" / "liked your post", or for a mix
    /// "Ava and 2 others" / "4 likes, 2 comments and 1 new follower" (always in that order).
    public static PushMessage Compose(IReadOnlyList<Notification> batch)
    {
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
