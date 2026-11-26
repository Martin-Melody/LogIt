using System.Security.Claims;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Social;

/// A group's events (design canvas G2, E1–E4, the Home meetup card; journey F5). Members see
/// them and answer Going / Can't make it; organisers add, edit and cancel. A new event notifies
/// members on "Events, notes and mentions" or every message; a new time or place, or a
/// cancellation, notifies those going; the evening before, those going get a reminder.
public static class EventEndpoints
{
    public static readonly string[] Kinds = ["Session", "Meet", "Race", "Social"];
    public static readonly string[] Sports =
        ["Strength", "Powerlifting", "Weightlifting", "Bodybuilding", "CrossFit", "Running", "Cycling", "Swimming", "Hyrox", "BJJ", "Boxing", "Yoga", "Other"];
    public const int MaxRepeats = 120;

    public static void MapEventEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/groups/{groupId:guid}/events", List).WithTags("Social").RequireAuthorization();
        app.MapPost("/groups/{groupId:guid}/events", Create).WithTags("Social").RequireAuthorization().RequireRateLimiting("social-write");
        var g = app.MapGroup("/events").WithTags("Social").RequireAuthorization();
        g.MapGet("/home", Home);
        g.MapGet("/search", Search);
        g.MapGet("/{id:guid}", Get);
        g.MapPatch("/{id:guid}", Edit);
        g.MapPost("/{id:guid}/cancel", Cancel);
        g.MapPut("/{id:guid}/rsvp", Answer).RequireRateLimiting("social-write");
        g.MapPut("/{id:guid}/pin", Pin);
        g.MapGet("/{id:guid}/people", People);
    }

    public record PersonDto(string Username, string DisplayName, string? AvatarUrl, Guid Id);
    /// Answer: true Going, false Can't make it, null not answered. GoingNames: a few of those
    /// going, for "Riya, Dev and 4 others".
    /// Member: you're in its group (else it was found in search: GroupAccess and Requested say how to get in).
    public record EventDto(Guid Id, Guid GroupId, string GroupName, string Title, string Kind, long StartsAtMs, long? EndsAtMs, string? Place,
        string? Details, bool Cancelled, int Going, bool? Answer, bool Pinned, List<PersonDto> GoingPeople, bool CanEdit,
        string? Sport, string? Repeats, bool Member, string GroupAccess, string? GroupPlace, int GroupMembers, bool Requested);
    public record Occurrence(DateTime StartsAt, DateTime? EndsAt);
    /// A repeating event: the phone works out the dates in its own time zone (so 7pm stays 7pm
    /// across the clock change) and sends them as Dates, with Repeats to show. Scope on edit and
    /// cancel: "one" (default) or "following" (this and every later date of the series).
    public record EventRequest(string? Title, string? Kind, DateTime? StartsAt, DateTime? EndsAt, string? Place, string? Details, bool Notify = true,
        bool ClearEnd = false, string? Sport = null, List<Occurrence>? Dates = null, string? Repeats = null, string? Scope = null, bool ClearSport = false);
    public record AnswerRequest(bool? Going);
    public record PinRequest(bool Pinned);
    public record PeopleDto(List<PersonDto> Going, List<PersonDto> CantMakeIt);

    private static long Ms(DateTime t) => new DateTimeOffset(DateTime.SpecifyKind(t, DateTimeKind.Utc)).ToUnixTimeMilliseconds();
    private static DateTime Utc(DateTime t) => t.Kind == DateTimeKind.Utc ? t : t.Kind == DateTimeKind.Local ? t.ToUniversalTime() : DateTime.SpecifyKind(t, DateTimeKind.Utc);
    private static PersonDto Person(User u) => new(u.Username, u.DisplayName, u.AvatarUrl, u.Id);
    private static string? Clean(string? s, int max) => string.IsNullOrWhiteSpace(s) ? null : s.Trim()[..Math.Min(s.Trim().Length, max)];
    private static IResult Gone() => Results.NotFound(new { error = "This event doesn't exist, or you're not in its group." });

    private static async Task<List<EventDto>> DtosAsync(AppDbContext db, IQueryable<GroupEvent> events, Guid me)
    {
        var rows = await events.Select(e => new
        {
            Event = e,
            GroupName = e.Group.Name,
            Going = db.EventRsvps.Count(r => r.EventId == e.Id && r.Going == true),
            Mine = db.EventRsvps.Where(r => r.EventId == e.Id && r.UserId == me).Select(r => new { r.Going, r.Pinned }).FirstOrDefault(),
            Organiser = db.GroupMembers.Any(m => m.GroupId == e.GroupId && m.UserId == me && m.Role == GroupRole.Organiser),
            Member = db.GroupMembers.Any(m => m.GroupId == e.GroupId && m.UserId == me),
            e.Group.Access,
            GroupPlace = e.Group.Place,
            GroupMembers = db.GroupMembers.Count(m => m.GroupId == e.GroupId),
            Requested = db.GroupJoinRequests.Any(r => r.GroupId == e.GroupId && r.UserId == me),
        }).ToListAsync();
        // A few faces per event: you first if you're going, then the earliest answers.
        var ids = rows.Select(r => r.Event.Id).ToList();
        var going = (await db.EventRsvps.Where(r => ids.Contains(r.EventId) && r.Going == true).OrderBy(r => r.UpdatedAt)
                .Select(r => new { r.EventId, r.User }).Take(5000).ToListAsync())
            .GroupBy(r => r.EventId).ToDictionary(g => g.Key, g => g.OrderByDescending(r => r.User.Id == me).Take(4).Select(r => Person(r.User)).ToList());
        return [.. rows.Select(r => new EventDto(r.Event.Id, r.Event.GroupId, r.GroupName, r.Event.Title, r.Event.Kind, Ms(r.Event.StartsAt),
            r.Event.EndsAt is { } end ? Ms(end) : null, r.Event.Place, r.Event.Details, r.Event.CancelledAt is not null, r.Going,
            r.Mine?.Going, r.Mine?.Pinned ?? false, r.Member ? going.GetValueOrDefault(r.Event.Id) ?? [] : [], r.Organiser,
            r.Event.Sport, r.Event.Repeats, r.Member, r.Access.ToString(), r.GroupPlace, r.GroupMembers, r.Requested))];
    }

    private static IQueryable<GroupEvent> Mine(AppDbContext db, Guid me) =>
        db.GroupEvents.Where(e => db.GroupMembers.Any(m => m.GroupId == e.GroupId && m.UserId == me));

    /// Upcoming (and today's, cancelled ones included until their day ends) or past, for members.
    private static async Task<IResult> List(Guid groupId, bool? past, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        var me = caller.GetUserId();
        if (!await db.GroupMembers.AnyAsync(m => m.GroupId == groupId && m.UserId == me)) return Results.NotFound();
        var now = clock.GetUtcNow().UtcDateTime;
        var cutoff = now.AddHours(-6); // an event stays "upcoming" for a while after it starts
        var q = db.GroupEvents.Where(e => e.GroupId == groupId);
        q = past == true
            ? q.Where(e => e.StartsAt < cutoff && e.CancelledAt == null).OrderByDescending(e => e.StartsAt).Take(30)
            : q.Where(e => e.StartsAt >= cutoff).OrderBy(e => e.StartsAt).Take(50);
        return Results.Ok(await DtosAsync(db, q, me));
    }

    private static async Task<(GroupEvent? Event, GroupMember? Me)> LoadAsync(AppDbContext db, Guid id, Guid me)
    {
        var e = await db.GroupEvents.Include(x => x.Group).FirstOrDefaultAsync(x => x.Id == id);
        if (e is null) return (null, null);
        var member = await db.GroupMembers.FirstOrDefaultAsync(m => m.GroupId == e.GroupId && m.UserId == me);
        return member is null ? (null, null) : (e, member);
    }

    private static async Task<IResult> Create(Guid groupId, EventRequest req, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        var me = caller.GetUserId();
        var member = await db.GroupMembers.FirstOrDefaultAsync(m => m.GroupId == groupId && m.UserId == me);
        if (member is null) return Results.NotFound();
        if (member.Role != GroupRole.Organiser) return Results.Json(new { error = "Only the group's organisers can add events." }, statusCode: 403);
        var title = Clean(req.Title, 80);
        if (title is null) return Results.BadRequest(new { error = "Give the event a name." });
        if (req.StartsAt is null && req.Dates is not { Count: > 0 }) return Results.BadRequest(new { error = "Choose when it starts." });
        var kind = req.Kind is null ? "Session" : Kinds.FirstOrDefault(k => k.Equals(req.Kind, StringComparison.OrdinalIgnoreCase));
        if (kind is null) return Results.BadRequest(new { error = "Choose Session, Meet, Race or Social." });
        string? sport = null;
        if (req.Sport is not null && (sport = Sports.FirstOrDefault(x => x.Equals(req.Sport, StringComparison.OrdinalIgnoreCase))) is null)
            return Results.BadRequest(new { error = "That sport isn't on the list." });
        var now = clock.GetUtcNow().UtcDateTime;
        var dates = req.Dates is { Count: > 0 } d ? d : [new Occurrence(req.StartsAt!.Value, req.EndsAt)];
        if (dates.Count > MaxRepeats) return Results.BadRequest(new { error = $"That's more than {MaxRepeats} dates. Pick an earlier end." });
        var times = dates.Select(o => (Start: Utc(o.StartsAt), End: o.EndsAt is { } e ? Utc(e) : (DateTime?)null)).OrderBy(o => o.Start).ToList();
        if (times[0].Start < now.AddMinutes(-5)) return Results.BadRequest(new { error = "That time has passed." });
        if (times.Any(o => o.End <= o.Start)) return Results.BadRequest(new { error = "It has to end after it starts." });
        if (await db.GroupEvents.CountAsync(e => e.GroupId == groupId && e.StartsAt > now) + times.Count > 300)
            return Results.BadRequest(new { error = "That's a lot of upcoming events. Cancel some first." });

        Guid? series = times.Count > 1 ? Guid.NewGuid() : null;
        var created = times.Select(o => new GroupEvent
        {
            GroupId = groupId, Title = title, Kind = kind, Sport = sport, StartsAt = o.Start, EndsAt = o.End, Place = Clean(req.Place, 120),
            Details = Clean(req.Details, 1000), CreatedById = me, CreatedAt = now, SeriesId = series, Repeats = series is null ? null : Clean(req.Repeats, 60),
        }).ToList();
        db.GroupEvents.AddRange(created);
        var ev = created[0]; // one notification for a whole series
        if (req.Notify)
        {
            var to = await db.GroupMembers.Where(m => m.GroupId == groupId && m.UserId != me && m.Notify != GroupNotify.Off).Select(m => m.UserId).ToListAsync();
            db.Notifications.AddRange(to.Select(u => new Notification { UserId = u, ActorId = me, Type = NotificationType.GroupEvent, GroupId = groupId, EventId = ev.Id, CreatedAt = now }));
        }
        await db.SaveChangesAsync();
        return Results.Ok((await DtosAsync(db, db.GroupEvents.Where(e => e.Id == ev.Id), me))[0]);
    }

    /// Members see their group's events; anyone signed in sees one in a findable group (from search).
    private static async Task<IResult> Get(Guid id, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var list = await DtosAsync(db, db.GroupEvents.Where(e => e.Id == id
            && (e.Group.Access != GroupAccess.InviteOnly || db.GroupMembers.Any(m => m.GroupId == e.GroupId && m.UserId == me))), me);
        return list.Count == 0 ? Gone() : Results.Ok(list[0]);
    }

    /// The dates an edit or cancel applies to: this one, or (scope "following") this and every
    /// later date of its series.
    private static async Task<List<GroupEvent>> TargetsAsync(AppDbContext db, GroupEvent ev, string? scope) =>
        scope == "following" && ev.SeriesId is { } series
            ? await db.GroupEvents.Where(e => e.SeriesId == series && e.StartsAt >= ev.StartsAt && e.CancelledAt == null).OrderBy(e => e.StartsAt).ToListAsync()
            : [ev];

    /// Tells everyone going to any of these (once each, except whoever made the change).
    private static async Task NotifyGoingAsync(AppDbContext db, List<GroupEvent> events, Guid actor, NotificationType type, DateTime now)
    {
        var ids = events.Select(e => e.Id).ToList();
        var first = events[0];
        var to = await db.EventRsvps.Where(r => ids.Contains(r.EventId) && r.Going == true && r.UserId != actor
                && db.GroupMembers.Any(m => m.GroupId == first.GroupId && m.UserId == r.UserId && m.Notify != GroupNotify.Off))
            .Select(r => new { r.UserId, r.EventId }).ToListAsync();
        foreach (var u in to.GroupBy(x => x.UserId))
        {
            var eventId = events.First(e => u.Any(x => x.EventId == e.Id)).Id; // the earliest they're going to
            db.Notifications.Add(new Notification { UserId = u.Key, ActorId = actor, Type = type, GroupId = first.GroupId, EventId = eventId, CreatedAt = now });
        }
    }

    private static async Task<IResult> Edit(Guid id, EventRequest req, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        var me = caller.GetUserId();
        var (ev, member) = await LoadAsync(db, id, me);
        if (ev is null || member is null) return Gone();
        if (member.Role != GroupRole.Organiser) return Results.Json(new { error = "Only the group's organisers can change events." }, statusCode: 403);
        if (ev.CancelledAt is not null) return Results.BadRequest(new { error = "This event was cancelled." });
        string? sport = null;
        if (req.Sport is not null && (sport = Sports.FirstOrDefault(x => x.Equals(req.Sport, StringComparison.OrdinalIgnoreCase))) is null)
            return Results.BadRequest(new { error = "That sport isn't on the list." });
        // A new time moves every chosen date by the same amount (19:00 to 18:30 on each).
        var startShift = req.StartsAt is { } start ? Utc(start) - ev.StartsAt : TimeSpan.Zero;
        TimeSpan? length = req.ClearEnd ? null : req.EndsAt is { } end ? Utc(end) - (ev.StartsAt + startShift) : ev.EndsAt - ev.StartsAt;
        if (length <= TimeSpan.Zero) return Results.BadRequest(new { error = "It has to end after it starts." });
        var targets = await TargetsAsync(db, ev, req.Scope);
        var moved = new List<GroupEvent>();
        foreach (var t in targets)
        {
            var oldPlace = t.Place;
            if (req.Title is not null) t.Title = Clean(req.Title, 80) ?? t.Title;
            if (req.Kind is not null) t.Kind = Kinds.FirstOrDefault(k => k.Equals(req.Kind, StringComparison.OrdinalIgnoreCase)) ?? t.Kind;
            if (sport is not null) t.Sport = sport;
            else if (req.ClearSport) t.Sport = null;
            t.StartsAt += startShift;
            t.EndsAt = length is { } l ? t.StartsAt + l : null;
            if (req.Place is not null) t.Place = Clean(req.Place, 120);
            if (req.Details is not null) t.Details = Clean(req.Details, 1000);
            if (startShift != TimeSpan.Zero || t.Place != oldPlace) moved.Add(t);
        }
        var now = clock.GetUtcNow().UtcDateTime;
        if (moved.Count > 0)
        {
            await NotifyGoingAsync(db, moved, me, NotificationType.GroupEventChanged, now);
            if (startShift != TimeSpan.Zero)
            {
                var ids = moved.Select(m => m.Id).ToList();
                await db.EventRsvps.Where(r => ids.Contains(r.EventId)).ExecuteUpdateAsync(s => s.SetProperty(r => r.RemindedAt, (DateTime?)null));
            }
        }
        await db.SaveChangesAsync();
        return Results.Ok((await DtosAsync(db, db.GroupEvents.Where(e => e.Id == id), me))[0]);
    }

    public record CancelRequest(string? Scope);

    private static async Task<IResult> Cancel(Guid id, CancelRequest? req, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        var me = caller.GetUserId();
        var (ev, member) = await LoadAsync(db, id, me);
        if (ev is null || member is null) return Gone();
        if (member.Role != GroupRole.Organiser) return Results.Json(new { error = "Only the group's organisers can cancel events." }, statusCode: 403);
        if (ev.CancelledAt is not null) return Results.NoContent();
        var now = clock.GetUtcNow().UtcDateTime;
        var targets = await TargetsAsync(db, ev, req?.Scope);
        foreach (var t in targets) t.CancelledAt = now;
        await NotifyGoingAsync(db, targets, me, NotificationType.GroupEventCancelled, now);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    /// Social › Search › Events (canvas V1): upcoming events in groups anyone can find (and your
    /// own groups'), by a place or name, sport, kind and a window; a repeating event shows once,
    /// at its next date.
    private static async Task<IResult> Search(string? q, string? sport, string? kind, DateTime? from, DateTime? to, ClaimsPrincipal caller,
        AppDbContext db, TimeProvider clock)
    {
        var me = caller.GetUserId();
        var now = clock.GetUtcNow().UtcDateTime;
        var term = (q ?? "").Trim().ToLowerInvariant();
        var start = from is { } f && Utc(f) > now ? Utc(f) : now;
        var events = db.GroupEvents.Where(e => e.CancelledAt == null && e.StartsAt >= start
            && (e.Group.Access != GroupAccess.InviteOnly || db.GroupMembers.Any(m => m.GroupId == e.GroupId && m.UserId == me)));
        if (to is { } t) events = events.Where(e => e.StartsAt < Utc(t));
        if (!string.IsNullOrEmpty(sport)) events = events.Where(e => e.Sport == sport);
        if (!string.IsNullOrEmpty(kind)) events = events.Where(e => e.Kind == kind);
        if (term.Length > 0)
            events = events.Where(e => e.Title.ToLower().Contains(term) || (e.Place != null && e.Place.ToLower().Contains(term))
                || e.Group.Name.ToLower().Contains(term) || (e.Group.Place != null && e.Group.Place.ToLower().Contains(term)));
        else if (string.IsNullOrEmpty(sport) && string.IsNullOrEmpty(kind)) return Results.Ok(Array.Empty<EventDto>());
        var ids = (await events.OrderBy(e => e.StartsAt).Select(e => new { e.Id, e.SeriesId }).Take(500).ToListAsync())
            .DistinctBy(e => e.SeriesId ?? e.Id).Take(50).Select(e => e.Id).ToList();
        var list = await DtosAsync(db, db.GroupEvents.Where(e => ids.Contains(e.Id)), me);
        return Results.Ok(list.OrderBy(e => e.StartsAtMs));
    }

    private static async Task<EventRsvp> RsvpAsync(AppDbContext db, Guid id, Guid me, DateTime now)
    {
        var r = await db.EventRsvps.FirstOrDefaultAsync(x => x.EventId == id && x.UserId == me);
        if (r is null) db.EventRsvps.Add(r = new EventRsvp { EventId = id, UserId = me, UpdatedAt = now });
        return r;
    }

    private static async Task<IResult> Answer(Guid id, AnswerRequest req, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        var me = caller.GetUserId();
        var (ev, _) = await LoadAsync(db, id, me);
        if (ev is null) return Gone();
        if (ev.CancelledAt is not null) return Results.BadRequest(new { error = "This event was cancelled." });
        var now = clock.GetUtcNow().UtcDateTime;
        var r = await RsvpAsync(db, id, me, now);
        r.Going = req.Going;
        r.UpdatedAt = now;
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException) { /* answered twice at once */ }
        return Results.Ok((await DtosAsync(db, db.GroupEvents.Where(e => e.Id == id), me))[0]);
    }

    /// "Pin to Home": one event on your Home meetup card; pinning another replaces it.
    private static async Task<IResult> Pin(Guid id, PinRequest req, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        var me = caller.GetUserId();
        var (ev, _) = await LoadAsync(db, id, me);
        if (ev is null) return Gone();
        if (req.Pinned) await db.EventRsvps.Where(r => r.UserId == me && r.Pinned && r.EventId != id).ExecuteUpdateAsync(s => s.SetProperty(r => r.Pinned, false));
        var r = await RsvpAsync(db, id, me, clock.GetUtcNow().UtcDateTime);
        r.Pinned = req.Pinned;
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> People(Guid id, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var (ev, _) = await LoadAsync(db, id, me);
        if (ev is null) return Gone();
        var rows = await db.EventRsvps.Where(r => r.EventId == id && r.Going != null
                && db.GroupMembers.Any(m => m.GroupId == ev.GroupId && m.UserId == r.UserId))
            .OrderByDescending(r => r.UserId == me).ThenBy(r => r.UpdatedAt)
            .Select(r => new { r.User, r.Going }).Take(2000).ToListAsync();
        return Results.Ok(new PeopleDto([.. rows.Where(r => r.Going == true).Select(r => Person(r.User))], [.. rows.Where(r => r.Going == false).Select(r => Person(r.User))]));
    }

    /// The Home meetup card: your pinned event while it's ahead, else the next one you're going
    /// to; nothing once it has started (204).
    private static async Task<IResult> Home(ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        var me = caller.GetUserId();
        var now = clock.GetUtcNow().UtcDateTime;
        var ahead = Mine(db, me).Where(e => e.StartsAt > now && e.CancelledAt == null);
        var pinned = await DtosAsync(db, ahead.Where(e => db.EventRsvps.Any(r => r.EventId == e.Id && r.UserId == me && r.Pinned)).Take(1), me);
        if (pinned.Count > 0) return Results.Ok(pinned[0]);
        var next = await DtosAsync(db, ahead.Where(e => db.EventRsvps.Any(r => r.EventId == e.Id && r.UserId == me && r.Going == true)).OrderBy(e => e.StartsAt).Take(1), me);
        return next.Count > 0 ? Results.Ok(next[0]) : Results.NoContent();
    }
}

/// The evening-before reminder (canvas G2): at 7pm in the person's own time zone (Push settings),
/// the day before, for everyone going. Not when they answered after that time (they know).
public class EventReminderSweeper(IServiceScopeFactory scopes, ILogger<EventReminderSweeper> log, TimeProvider clock) : BackgroundService
{
    public const int ReminderHour = 19;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(5), clock);
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                await SweepAsync(scope.ServiceProvider.GetRequiredService<AppDbContext>(), clock.GetUtcNow().UtcDateTime, stoppingToken);
            }
            catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
            {
                log.LogError(ex, "Event reminder sweep failed");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    /// When the reminder for an event starting at `startUtc` is due, in this time zone.
    public static DateTime DueAt(DateTime startUtc, string timeZone)
    {
        var zone = TimeZoneInfo.TryFindSystemTimeZoneById(timeZone, out var z) ? z : TimeZoneInfo.Utc;
        var localStart = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(startUtc, DateTimeKind.Utc), zone);
        var local = DateTime.SpecifyKind(localStart.Date.AddDays(-1).AddHours(ReminderHour), DateTimeKind.Unspecified);
        return TimeZoneInfo.ConvertTimeToUtc(local, zone);
    }

    public static async Task<int> SweepAsync(AppDbContext db, DateTime now, CancellationToken ct = default)
    {
        var due = await db.EventRsvps.Include(r => r.Event)
            .Where(r => r.Going == true && r.RemindedAt == null && r.Event.CancelledAt == null && r.Event.StartsAt > now && r.Event.StartsAt < now.AddHours(48)
                && db.GroupMembers.Any(m => m.GroupId == r.Event.GroupId && m.UserId == r.UserId && m.Notify != GroupNotify.Off))
            .Take(2000).ToListAsync(ct);
        var userIds = due.Select(r => r.UserId).Distinct().ToList();
        var zones = await db.PushSettings.Where(s => userIds.Contains(s.UserId)).ToDictionaryAsync(s => s.UserId, s => s.TimeZone, ct);
        var sent = 0;
        foreach (var r in due)
        {
            var at = DueAt(r.Event.StartsAt, zones.GetValueOrDefault(r.UserId, "UTC"));
            if (now < at) continue;
            r.RemindedAt = now;
            if (r.UpdatedAt > at) continue; // answered after the reminder time
            db.Notifications.Add(new Notification
            {
                // Nobody did anything: the reminder is "from" the person it's for.
                UserId = r.UserId, ActorId = r.UserId, Type = NotificationType.GroupEventReminder,
                GroupId = r.Event.GroupId, EventId = r.EventId, CreatedAt = now,
            });
            sent++;
        }
        await db.SaveChangesAsync(ct);
        return sent;
    }
}
