using System.Security.Claims;
using System.Security.Cryptography;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Photos;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Social;

/// Groups (design canvas G1–G10, P3; journey F5 in docs/testing-friends.md). Only members see a
/// group; anyone with its link can see its name and join. Members see each other's names and
/// photos, never workouts or weights. Organisers pin a note, edit the group, manage members and
/// reset the link. The chat is a DmThread with the group's id, so it works like any chat.
public static class GroupEndpoints
{
    public static readonly string[] Kinds = ["Gym", "Club", "Team", "Friends"];
    public const int MaxMembers = 2000;
    public const int MaxGroupsPerPerson = 100;

    public static void MapGroupEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/groups").WithTags("Social");
        g.MapGet("", Mine).RequireAuthorization();
        g.MapPost("", Create).RequireAuthorization().RequireRateLimiting("social-write");
        g.MapGet("/join/{code}", Preview).AllowAnonymous().RequireRateLimiting("social-write");
        g.MapPost("/join/{code}", Join).RequireAuthorization().RequireRateLimiting("social-write");
        g.MapGet("/{id:guid}", Get).RequireAuthorization();
        g.MapPatch("/{id:guid}", Edit).RequireAuthorization();
        g.MapDelete("/{id:guid}", Delete).RequireAuthorization();
        g.MapPut("/{id:guid}/note", PinNote).RequireAuthorization().RequireRateLimiting("social-write");
        g.MapDelete("/{id:guid}/note", Unpin).RequireAuthorization();
        g.MapPost("/{id:guid}/invite/reset", ResetInvite).RequireAuthorization();
        g.MapGet("/{id:guid}/members", Members).RequireAuthorization();
        g.MapPut("/{id:guid}/members/{username}/role", SetRole).RequireAuthorization();
        g.MapDelete("/{id:guid}/members/{username}", Remove).RequireAuthorization();
        g.MapPut("/{id:guid}/me", MySettings).RequireAuthorization();
        g.MapGet("/search", Search).RequireAuthorization();
        g.MapGet("/{id:guid}/about", About).RequireAuthorization();
        g.MapPost("/{id:guid}/join", JoinById).RequireAuthorization().RequireRateLimiting("social-write");
        g.MapDelete("/{id:guid}/request", CancelRequest).RequireAuthorization();
        g.MapGet("/{id:guid}/requests", Requests).RequireAuthorization();
        g.MapPost("/{id:guid}/requests/{username}", Approve).RequireAuthorization();
        g.MapDelete("/{id:guid}/requests/{username}", Decline).RequireAuthorization();
    }

    public record PersonDto(string Username, string DisplayName, string? AvatarUrl, Guid Id);
    public record BriefDto(Guid Id, string Name, string Kind, string? Place, string? PhotoUrl, int Members);
    public record NoteDto(string Text, PersonDto? By, long AtMs);
    public record MeDto(string Role, bool OnBoard, string Notify);
    /// Requests: how many are waiting (organisers only, else 0).
    public record GroupDto(Guid Id, string Name, string Kind, string? Place, string? PhotoUrl, int Members, Guid ThreadId, string InviteCode,
        NoteDto? Note, MeDto Me, List<PersonDto> Organisers, List<PersonDto> Preview, string Access, int Requests);
    public record MemberDto(PersonDto User, string Role, long JoinedAtMs);
    /// Requested: you asked to join and wait. InvitedBy: a member invited you from a chat.
    public record PreviewDto(Guid Id, string Name, string Kind, string? Place, string? PhotoUrl, int Members, string? Organiser,
        List<PersonDto> Followed, bool Member, string Access = "InviteOnly", bool Requested = false, string? InvitedBy = null);
    /// A search result; State is "member", "requested", "invited" or "none".
    public record SearchDto(Guid Id, string Name, string Kind, string? Place, string? PhotoUrl, int Members, string Access, string State, string? Followed);
    public record RequestDto(PersonDto User, long AtMs, string? FollowedBy);
    public record CreateRequest(string Name, string? Kind, string? Place, Guid? PhotoId, string? Access = null);
    public record EditRequest(string? Name, string? Kind, string? Place, Guid? PhotoId, bool RemovePhoto = false, string? Access = null);
    /// EventId: joining from an event in search, so you're going to it once you're in.
    public record JoinRequest(bool OnBoard = true, Guid? EventId = null);
    public record NoteRequest(string Text, bool Notify = true);
    public record RoleRequest(string Role);
    public record MySettingsRequest(bool? OnBoard, string? Notify);

    private static long Ms(DateTime t) => new DateTimeOffset(DateTime.SpecifyKind(t, DateTimeKind.Utc)).ToUnixTimeMilliseconds();
    private static PersonDto Person(User u) => new(u.Username, u.DisplayName, u.AvatarUrl, u.Id);
    private static string? PhotoOf(Group g) => g.PhotoId is { } p ? PhotoEndpoints.UrlOf(p) : null;

    private static string NewCode()
    {
        const string letters = "abcdefghjkmnpqrstuvwxyz23456789";
        return string.Concat(RandomNumberGenerator.GetItems<char>(letters, 12));
    }

    private static string? Clean(string? s, int max) => string.IsNullOrWhiteSpace(s) ? null : s.Trim()[..Math.Min(s.Trim().Length, max)];

    private static Task<GroupMember?> MembershipAsync(AppDbContext db, Guid groupId, Guid me) =>
        db.GroupMembers.Include(m => m.Group).FirstOrDefaultAsync(m => m.GroupId == groupId && m.UserId == me);

    private static IResult Gone() => Results.NotFound(new { error = "This group doesn't exist, or you're not in it." });
    private static IResult NotOrganiser() => Results.Json(new { error = "Only the group's organisers can do that." }, statusCode: 403);

    /// A group always has an organiser: if the last one left or deleted their account, the
    /// longest-standing member becomes one.
    private static async Task EnsureOrganiserAsync(AppDbContext db, Guid groupId)
    {
        if (await db.GroupMembers.AnyAsync(m => m.GroupId == groupId && m.Role == GroupRole.Organiser)) return;
        var next = await db.GroupMembers.Where(m => m.GroupId == groupId).OrderBy(m => m.JoinedAt).FirstOrDefaultAsync();
        if (next is null) return;
        next.Role = GroupRole.Organiser;
        await db.SaveChangesAsync();
    }

    private static async Task<IResult> Mine(ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var rows = await db.GroupMembers.Where(m => m.UserId == me).OrderBy(m => m.Group.Name)
            .Select(m => new { m.Group, Count = m.Group.Members.Count })
            .ToListAsync();
        return Results.Ok(rows.Select(r => new BriefDto(r.Group.Id, r.Group.Name, r.Group.Kind, r.Group.Place, PhotoOf(r.Group), r.Count)));
    }

    private static async Task<IResult> Create(CreateRequest req, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        var me = caller.GetUserId();
        var name = Clean(req.Name, 60);
        if (name is null) return Results.BadRequest(new { error = "Give the group a name." });
        var kind = req.Kind is null ? "Club" : Kinds.FirstOrDefault(k => k.Equals(req.Kind, StringComparison.OrdinalIgnoreCase));
        if (kind is null) return Results.BadRequest(new { error = "Choose Gym, Club, Team or Friends." });
        if (await db.GroupMembers.CountAsync(m => m.UserId == me) >= MaxGroupsPerPerson)
            return Results.BadRequest(new { error = $"You're in {MaxGroupsPerPerson} groups. Leave one first." });
        Photo? photo = null;
        if (req.PhotoId is { } pid && (photo = await PhotoEndpoints.OwnedAsync(db, me, pid)) is null)
            return Results.BadRequest(new { error = "That photo didn't upload. Try again." });
        var access = GroupAccess.InviteOnly;
        if (req.Access is not null && !Enum.TryParse(req.Access, true, out access)) return Results.BadRequest(new { error = "InviteOnly, Request or Open." });

        var now = clock.GetUtcNow().UtcDateTime;
        var group = new Group { Name = name, Kind = kind, Place = Clean(req.Place, 60), PhotoId = photo?.Id, InviteCode = NewCode(), CreatedAt = now, Access = access };
        group.Members.Add(new GroupMember { UserId = me, Role = GroupRole.Organiser, JoinedAt = now });
        db.Groups.Add(group);
        var thread = new DmThread { PairKey = $"g:{group.Id}", Group = group, CreatedAt = now, LastMessageAt = now };
        thread.Members.Add(new DmMember { UserId = me, Accepted = true, LastReadAt = now });
        db.DmThreads.Add(thread);
        await db.SaveChangesAsync();
        return Results.Ok(await DtoAsync(db, group.Id, me));
    }

    private static async Task<GroupDto?> DtoAsync(AppDbContext db, Guid groupId, Guid me)
    {
        var mine = await MembershipAsync(db, groupId, me);
        if (mine is null) return null;
        var g = mine.Group;
        var count = await db.GroupMembers.CountAsync(m => m.GroupId == groupId);
        var threadId = await db.DmThreads.Where(t => t.GroupId == groupId).Select(t => t.Id).FirstAsync();
        var organisers = await db.GroupMembers.Where(m => m.GroupId == groupId && m.Role == GroupRole.Organiser)
            .OrderBy(m => m.JoinedAt).Select(m => m.User).Take(5).ToListAsync();
        // The member row's faces: people you follow first, then organisers, then the longest-standing.
        var preview = await db.GroupMembers.Where(m => m.GroupId == groupId && m.UserId != me)
            .OrderByDescending(m => db.Follows.Any(f => f.FollowerId == me && f.FollowedId == m.UserId))
            .ThenByDescending(m => m.Role).ThenBy(m => m.JoinedAt)
            .Select(m => m.User).Take(4).ToListAsync();
        var noteBy = g.NoteById is { } nb ? await db.Users.FindAsync(nb) : null;
        var requests = mine.Role == GroupRole.Organiser ? await db.GroupJoinRequests.CountAsync(r => r.GroupId == groupId) : 0;
        return new GroupDto(g.Id, g.Name, g.Kind, g.Place, PhotoOf(g), count, threadId, g.InviteCode,
            g.Note is null ? null : new NoteDto(g.Note, noteBy is null ? null : Person(noteBy), Ms(g.NoteAt ?? g.CreatedAt)),
            new MeDto(mine.Role.ToString(), mine.OnBoard, mine.Notify.ToString()),
            [.. organisers.Select(Person)], [.. preview.Select(Person)], g.Access.ToString(), requests);
    }

    private static async Task<IResult> Get(Guid id, ClaimsPrincipal caller, AppDbContext db)
    {
        await EnsureOrganiserAsync(db, id);
        return await DtoAsync(db, id, caller.GetUserId()) is { } dto ? Results.Ok(dto) : Gone();
    }

    private static async Task<IResult> Edit(Guid id, EditRequest req, ClaimsPrincipal caller, AppDbContext db, IPhotoStore store, CancellationToken ct)
    {
        var me = caller.GetUserId();
        var mine = await MembershipAsync(db, id, me);
        if (mine is null) return Gone();
        if (mine.Role != GroupRole.Organiser) return NotOrganiser();
        var g = mine.Group;
        if (req.Name is not null)
        {
            var name = Clean(req.Name, 60);
            if (name is null) return Results.BadRequest(new { error = "Give the group a name." });
            g.Name = name;
        }
        if (req.Kind is not null)
        {
            var kind = Kinds.FirstOrDefault(k => k.Equals(req.Kind, StringComparison.OrdinalIgnoreCase));
            if (kind is null) return Results.BadRequest(new { error = "Choose Gym, Club, Team or Friends." });
            g.Kind = kind;
        }
        if (req.Place is not null) g.Place = Clean(req.Place, 60);
        if (req.Access is not null)
        {
            if (!Enum.TryParse<GroupAccess>(req.Access, true, out var access)) return Results.BadRequest(new { error = "InviteOnly, Request or Open." });
            g.Access = access;
        }
        if (req.PhotoId is { } pid && pid != g.PhotoId)
        {
            if (await PhotoEndpoints.OwnedAsync(db, me, pid) is null) return Results.BadRequest(new { error = "That photo didn't upload. Try again." });
            await DeletePhotoAsync(db, store, g.PhotoId, ct);
            g.PhotoId = pid;
        }
        else if (req.RemovePhoto)
        {
            await DeletePhotoAsync(db, store, g.PhotoId, ct);
            g.PhotoId = null;
        }
        await db.SaveChangesAsync(ct);
        return Results.Ok(await DtoAsync(db, id, me));
    }

    /// The group's own photo goes with it, whoever of its organisers uploaded it. Caller saves.
    private static async Task DeletePhotoAsync(AppDbContext db, IPhotoStore store, Guid? photoId, CancellationToken ct)
    {
        if (photoId is not { } id || await db.Photos.FindAsync([id], ct) is not { } photo) return;
        await store.DeleteAsync(id.ToString("N"), ct);
        db.Photos.Remove(photo);
    }

    private static async Task<IResult> Delete(Guid id, ClaimsPrincipal caller, AppDbContext db, IPhotoStore store, CancellationToken ct)
    {
        var mine = await MembershipAsync(db, id, caller.GetUserId());
        if (mine is null) return Gone();
        if (mine.Role != GroupRole.Organiser) return NotOrganiser();
        await DeleteGroupAsync(db, store, mine.Group, ct);
        return Results.NoContent();
    }

    /// Deletes a group for everyone: its chat (with the photos and voice messages sent in it), its
    /// photo, members and notifications.
    public static async Task DeleteGroupAsync(AppDbContext db, IPhotoStore store, Group group, CancellationToken ct = default)
    {
        var media = await db.DirectMessages.Where(m => m.Thread.GroupId == group.Id && (m.PhotoId != null || m.VoiceId != null))
            .Select(m => new { m.PhotoId, m.VoiceId }).ToListAsync(ct);
        var photoIds = media.Where(m => m.PhotoId != null).Select(m => m.PhotoId!.Value).ToList();
        var voiceIds = media.Where(m => m.VoiceId != null).Select(m => m.VoiceId!.Value).ToList();
        foreach (var p in await db.Photos.Where(p => photoIds.Contains(p.Id)).ToListAsync(ct))
        {
            await store.DeleteAsync(p.Id.ToString("N"), ct);
            db.Photos.Remove(p);
        }
        foreach (var v in await db.VoiceNotes.Where(v => voiceIds.Contains(v.Id)).ToListAsync(ct))
        {
            await store.DeleteAsync(Voice.VoiceEndpoints.KeyOf(v.Id), ct);
            db.VoiceNotes.Remove(v);
        }
        await DeletePhotoAsync(db, store, group.PhotoId, ct);
        db.Groups.Remove(group);
        await db.SaveChangesAsync(ct);
    }

    /// Before an account is deleted: groups it was the only member of go too. In the others its
    /// membership goes with the account, and the next visit makes a new organiser if needed.
    public static async Task ForgetAsync(AppDbContext db, IPhotoStore store, Guid userId, CancellationToken ct = default)
    {
        var alone = await db.Groups.Where(g => g.Members.Any(m => m.UserId == userId) && g.Members.Count == 1).ToListAsync(ct);
        foreach (var g in alone) await DeleteGroupAsync(db, store, g, ct);
    }

    private static async Task<IResult> PinNote(Guid id, NoteRequest req, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        var me = caller.GetUserId();
        var mine = await MembershipAsync(db, id, me);
        if (mine is null) return Gone();
        if (mine.Role != GroupRole.Organiser) return NotOrganiser();
        var text = (req.Text ?? "").Trim();
        if (text.Length == 0) return Results.BadRequest(new { error = "Write the note first." });
        if (text.Length > 500) return Results.BadRequest(new { error = "Keep it under 500 characters." });
        var now = clock.GetUtcNow().UtcDateTime;
        var g = mine.Group;
        g.Note = text;
        g.NoteById = me;
        g.NoteAt = now;
        if (req.Notify)
        {
            // Members who chose every message, or events, notes and mentions.
            var to = await db.GroupMembers.Where(m => m.GroupId == id && m.UserId != me && m.Notify != GroupNotify.Off)
                .Select(m => m.UserId).ToListAsync();
            db.Notifications.AddRange(to.Select(u => new Notification { UserId = u, ActorId = me, Type = NotificationType.GroupNote, GroupId = id, CreatedAt = now }));
        }
        await db.SaveChangesAsync();
        return Results.Ok(await DtoAsync(db, id, me));
    }

    private static async Task<IResult> Unpin(Guid id, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var mine = await MembershipAsync(db, id, me);
        if (mine is null) return Gone();
        if (mine.Role != GroupRole.Organiser) return NotOrganiser();
        mine.Group.Note = null;
        mine.Group.NoteById = null;
        mine.Group.NoteAt = null;
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> ResetInvite(Guid id, ClaimsPrincipal caller, AppDbContext db)
    {
        var mine = await MembershipAsync(db, id, caller.GetUserId());
        if (mine is null) return Gone();
        if (mine.Role != GroupRole.Organiser) return NotOrganiser();
        mine.Group.InviteCode = NewCode();
        await db.SaveChangesAsync();
        return Results.Ok(new { inviteCode = mine.Group.InviteCode });
    }

    /// The join screen (G5), also before signing in (the website's /g page): name, kind, how many,
    /// who runs it. Signed in, also which members you follow and whether you're in already.
    private static async Task<IResult> Preview(string code, ClaimsPrincipal caller, AppDbContext db)
    {
        var g = await db.Groups.FirstOrDefaultAsync(x => x.InviteCode == code);
        if (g is null) return Results.NotFound(new { error = "This group link doesn't work any more. Ask for a new one." });
        var count = await db.GroupMembers.CountAsync(m => m.GroupId == g.Id);
        var organiser = await db.GroupMembers.Where(m => m.GroupId == g.Id && m.Role == GroupRole.Organiser).OrderBy(m => m.JoinedAt)
            .Select(m => m.User.DisplayName).FirstOrDefaultAsync();
        List<PersonDto> followed = [];
        var member = false;
        if (caller.Identity?.IsAuthenticated == true)
        {
            var me = caller.GetUserId();
            member = await db.GroupMembers.AnyAsync(m => m.GroupId == g.Id && m.UserId == me);
            followed = [.. (await db.GroupMembers.Where(m => m.GroupId == g.Id && db.Follows.Any(f => f.FollowerId == me && f.FollowedId == m.UserId))
                .Select(m => m.User).Take(3).ToListAsync()).Select(Person)];
        }
        return Results.Ok(new PreviewDto(g.Id, g.Name, g.Kind, g.Place, PhotoOf(g), count, organiser, followed, member, g.Access.ToString()));
    }

    private static async Task<IResult> Join(string code, JoinRequest? req, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        var me = caller.GetUserId();
        var g = await db.Groups.FirstOrDefaultAsync(x => x.InviteCode == code);
        if (g is null) return Results.NotFound(new { error = "This group link doesn't work any more. Ask for a new one." });
        if (await db.GroupMembers.AnyAsync(m => m.GroupId == g.Id && m.UserId == me)) return Results.Ok(new { id = g.Id });
        if (await db.GroupMembers.CountAsync(m => m.GroupId == g.Id) >= MaxMembers) return Results.BadRequest(new { error = "This group is full." });
        if (await db.GroupMembers.CountAsync(m => m.UserId == me) >= MaxGroupsPerPerson)
            return Results.BadRequest(new { error = $"You're in {MaxGroupsPerPerson} groups. Leave one first." });
        await AddMemberAsync(db, g.Id, me, req?.OnBoard ?? true, clock.GetUtcNow().UtcDateTime);
        return Results.Ok(new { id = g.Id });
    }

    /// Adds someone to a group and its chat (which starts from now for them: earlier messages
    /// show, none count as unread), and clears their request and invite.
    private static async Task AddMemberAsync(AppDbContext db, Guid groupId, Guid userId, bool onBoard, DateTime now)
    {
        db.GroupMembers.Add(new GroupMember { GroupId = groupId, UserId = userId, OnBoard = onBoard, JoinedAt = now });
        var threadId = await db.DmThreads.Where(t => t.GroupId == groupId).Select(t => t.Id).FirstAsync();
        db.DmMembers.Add(new DmMember { ThreadId = threadId, UserId = userId, Accepted = true, LastReadAt = now });
        db.GroupJoinRequests.RemoveRange(await db.GroupJoinRequests.Where(r => r.GroupId == groupId && r.UserId == userId).ToListAsync());
        db.GroupInvites.RemoveRange(await db.GroupInvites.Where(i => i.GroupId == groupId && i.InviteeId == userId).ToListAsync());
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException) { /* joined twice at once */ }
    }

    private static async Task<string?> FollowedMemberAsync(AppDbContext db, Guid groupId, Guid me) =>
        await db.GroupMembers.Where(m => m.GroupId == groupId && db.Follows.Any(f => f.FollowerId == me && f.FollowedId == m.UserId))
            .Select(m => m.User.DisplayName).FirstOrDefaultAsync();

    /// Social › Search › Groups (canvas G12): findable groups by name or place. Invite-only groups
    /// never appear (nor which of them anyone is in), except your own.
    private static async Task<IResult> Search(string? q, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var term = (q ?? "").Trim().ToLowerInvariant();
        if (term.Length < 2) return Results.Ok(Array.Empty<SearchDto>());
        var rows = await db.Groups
            .Where(g => g.Access != GroupAccess.InviteOnly || g.Members.Any(m => m.UserId == me))
            .Where(g => g.Name.ToLower().Contains(term) || (g.Place != null && g.Place.ToLower().Contains(term)))
            .Select(g => new
            {
                Group = g,
                Count = g.Members.Count,
                Member = g.Members.Any(m => m.UserId == me),
                Requested = db.GroupJoinRequests.Any(r => r.GroupId == g.Id && r.UserId == me),
                Invited = db.GroupInvites.Any(i => i.GroupId == g.Id && i.InviteeId == me),
                Followed = g.Members.Where(m => db.Follows.Any(f => f.FollowerId == me && f.FollowedId == m.UserId)).Select(m => m.User.DisplayName).FirstOrDefault(),
            })
            .OrderByDescending(r => r.Member).ThenByDescending(r => r.Count).Take(30).ToListAsync();
        return Results.Ok(rows.Select(r => new SearchDto(r.Group.Id, r.Group.Name, r.Group.Kind, r.Group.Place, PhotoOf(r.Group), r.Count,
            r.Group.Access.ToString(), r.Member ? "member" : r.Requested ? "requested" : r.Invited ? "invited" : "none", r.Followed)));
    }

    /// The join screen opened from search or an invite card: findable groups, or ones you're
    /// invited to (or in).
    private static async Task<IResult> About(Guid id, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var g = await db.Groups.FirstOrDefaultAsync(x => x.Id == id);
        if (g is null) return Gone();
        var member = await db.GroupMembers.AnyAsync(m => m.GroupId == id && m.UserId == me);
        var invite = await db.GroupInvites.Include(i => i.Inviter).FirstOrDefaultAsync(i => i.GroupId == id && i.InviteeId == me);
        if (!member && invite is null && g.Access == GroupAccess.InviteOnly) return Gone();
        var count = await db.GroupMembers.CountAsync(m => m.GroupId == id);
        var organiser = await db.GroupMembers.Where(m => m.GroupId == id && m.Role == GroupRole.Organiser).OrderBy(m => m.JoinedAt)
            .Select(m => m.User.DisplayName).FirstOrDefaultAsync();
        var followed = await db.GroupMembers.Where(m => m.GroupId == id && db.Follows.Any(f => f.FollowerId == me && f.FollowedId == m.UserId))
            .Select(m => m.User).Take(3).ToListAsync();
        var requested = await db.GroupJoinRequests.AnyAsync(r => r.GroupId == id && r.UserId == me);
        return Results.Ok(new PreviewDto(g.Id, g.Name, g.Kind, g.Place, PhotoOf(g), count, organiser, [.. followed.Select(Person)], member,
            g.Access.ToString(), requested, invite?.Inviter.DisplayName));
    }

    /// Joining from search or an invite card: straight in when invited or the group is open; a
    /// request when it asks (organisers are told); not at all for an invite-only group.
    private static async Task<IResult> JoinById(Guid id, JoinRequest? req, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        var me = caller.GetUserId();
        var g = await db.Groups.FirstOrDefaultAsync(x => x.Id == id);
        if (g is null) return Gone();
        if (await db.GroupMembers.AnyAsync(m => m.GroupId == id && m.UserId == me)) return Results.Ok(new { id, status = "member" });
        var invited = await db.GroupInvites.AnyAsync(i => i.GroupId == id && i.InviteeId == me);
        if (!invited && g.Access == GroupAccess.InviteOnly) return Gone();
        if (await db.GroupMembers.CountAsync(m => m.GroupId == id) >= MaxMembers) return Results.BadRequest(new { error = "This group is full." });
        if (await db.GroupMembers.CountAsync(m => m.UserId == me) >= MaxGroupsPerPerson)
            return Results.BadRequest(new { error = $"You're in {MaxGroupsPerPerson} groups. Leave one first." });
        var now = clock.GetUtcNow().UtcDateTime;
        var goingTo = req?.EventId is { } eventId && await db.GroupEvents.AnyAsync(e => e.Id == eventId && e.GroupId == id && e.CancelledAt == null) ? eventId : (Guid?)null;
        if (invited || g.Access == GroupAccess.Open)
        {
            await AddMemberAsync(db, id, me, req?.OnBoard ?? true, now);
            if (goingTo is { } ev) await GoingAsync(db, ev, me, now);
            return Results.Ok(new { id, status = "member" });
        }
        if (await db.GroupJoinRequests.FirstOrDefaultAsync(r => r.GroupId == id && r.UserId == me) is { } asked)
        {
            if (goingTo is not null) asked.GoingTo = goingTo;
            await db.SaveChangesAsync();
        }
        else
        {
            db.GroupJoinRequests.Add(new GroupJoinRequest { GroupId = id, UserId = me, OnBoard = req?.OnBoard ?? true, GoingTo = goingTo, CreatedAt = now });
            var organisers = await db.GroupMembers.Where(m => m.GroupId == id && m.Role == GroupRole.Organiser).Select(m => m.UserId).ToListAsync();
            db.Notifications.AddRange(organisers.Select(o => new Notification { UserId = o, ActorId = me, Type = NotificationType.GroupRequest, GroupId = id, CreatedAt = now }));
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException) { /* asked twice at once */ }
        }
        return Results.Ok(new { id, status = "requested" });
    }

    private static async Task<IResult> CancelRequest(Guid id, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        await db.GroupJoinRequests.Where(r => r.GroupId == id && r.UserId == me).ExecuteDeleteAsync();
        await db.Notifications.Where(n => n.GroupId == id && n.ActorId == me && n.Type == NotificationType.GroupRequest).ExecuteDeleteAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> Requests(Guid id, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var mine = await MembershipAsync(db, id, me);
        if (mine is null) return Gone();
        if (mine.Role != GroupRole.Organiser) return NotOrganiser();
        var rows = await db.GroupJoinRequests.Where(r => r.GroupId == id).OrderBy(r => r.CreatedAt)
            .Select(r => new
            {
                r.User, r.CreatedAt,
                // A member who follows them, to put a face to the name.
                FollowedBy = db.GroupMembers.Where(m => m.GroupId == id && db.Follows.Any(f => f.FollowerId == m.UserId && f.FollowedId == r.UserId))
                    .Select(m => m.User.DisplayName).FirstOrDefault(),
            }).Take(500).ToListAsync();
        return Results.Ok(rows.Select(r => new RequestDto(Person(r.User), Ms(r.CreatedAt), r.FollowedBy)));
    }

    private static async Task<IResult> Approve(Guid id, string username, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock)
    {
        var me = caller.GetUserId();
        var mine = await MembershipAsync(db, id, me);
        if (mine is null) return Gone();
        if (mine.Role != GroupRole.Organiser) return NotOrganiser();
        var request = await db.GroupJoinRequests.FirstOrDefaultAsync(r => r.GroupId == id && r.User.Username == username.ToLowerInvariant());
        if (request is null) return Results.NotFound();
        var now = clock.GetUtcNow().UtcDateTime;
        db.Notifications.Add(new Notification { UserId = request.UserId, ActorId = me, Type = NotificationType.GroupApproved, GroupId = id, CreatedAt = now });
        await db.Notifications.Where(n => n.GroupId == id && n.ActorId == request.UserId && n.Type == NotificationType.GroupRequest).ExecuteDeleteAsync();
        await AddMemberAsync(db, id, request.UserId, request.OnBoard, now);
        if (request.GoingTo is { } ev) await GoingAsync(db, ev, request.UserId, now);
        return Results.NoContent();
    }

    private static async Task GoingAsync(AppDbContext db, Guid eventId, Guid userId, DateTime now)
    {
        if (await db.EventRsvps.FirstOrDefaultAsync(r => r.EventId == eventId && r.UserId == userId) is { } r) r.Going = true;
        else db.EventRsvps.Add(new EventRsvp { EventId = eventId, UserId = userId, Going = true, UpdatedAt = now });
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException) { /* answered at the same moment */ }
    }

    /// Declining tells nobody (as with follow requests).
    private static async Task<IResult> Decline(Guid id, string username, ClaimsPrincipal caller, AppDbContext db)
    {
        var mine = await MembershipAsync(db, id, caller.GetUserId());
        if (mine is null) return Gone();
        if (mine.Role != GroupRole.Organiser) return NotOrganiser();
        var userId = await db.Users.Where(u => u.Username == username.ToLowerInvariant()).Select(u => (Guid?)u.Id).FirstOrDefaultAsync();
        if (userId is null) return Results.NotFound();
        await db.GroupJoinRequests.Where(r => r.GroupId == id && r.UserId == userId).ExecuteDeleteAsync();
        await db.Notifications.Where(n => n.GroupId == id && n.ActorId == userId && n.Type == NotificationType.GroupRequest).ExecuteDeleteAsync();
        return Results.NoContent();
    }

    /// A member invites someone from a chat (the "GroupInvite" message card): they may then join
    /// straight away. Called by DirectMessageEndpoints.Send; null when the sender isn't a member.
    public static async Task<string?> InviteCardAsync(AppDbContext db, Guid groupId, Guid inviterId, Guid inviteeId, DateTime now)
    {
        var g = await db.Groups.FirstOrDefaultAsync(x => x.Id == groupId && x.Members.Any(m => m.UserId == inviterId));
        if (g is null) return null;
        var invite = await db.GroupInvites.FirstOrDefaultAsync(i => i.GroupId == groupId && i.InviteeId == inviteeId);
        if (invite is null) db.GroupInvites.Add(new GroupInvite { GroupId = groupId, InviteeId = inviteeId, InviterId = inviterId, CreatedAt = now });
        else (invite.InviterId, invite.CreatedAt) = (inviterId, now);
        var count = await db.GroupMembers.CountAsync(m => m.GroupId == groupId);
        return System.Text.Json.JsonSerializer.Serialize(new { groupId = g.Id, name = g.Name, kind = g.Kind, place = g.Place, photoUrl = PhotoOf(g), members = count });
    }

    private static async Task<IResult> Members(Guid id, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        if (!await db.GroupMembers.AnyAsync(m => m.GroupId == id && m.UserId == me)) return Gone();
        var rows = await db.GroupMembers.Where(m => m.GroupId == id)
            .OrderByDescending(m => m.Role).ThenBy(m => m.User.DisplayName)
            .Select(m => new { m.User, m.Role, m.JoinedAt }).Take(MaxMembers).ToListAsync();
        return Results.Ok(rows.Select(r => new MemberDto(Person(r.User), r.Role.ToString(), Ms(r.JoinedAt))));
    }

    private static async Task<IResult> SetRole(Guid id, string username, RoleRequest req, ClaimsPrincipal caller, AppDbContext db)
    {
        var mine = await MembershipAsync(db, id, caller.GetUserId());
        if (mine is null) return Gone();
        if (mine.Role != GroupRole.Organiser) return NotOrganiser();
        if (!Enum.TryParse<GroupRole>(req.Role, true, out var role)) return Results.BadRequest(new { error = "Member or Organiser." });
        var them = await db.GroupMembers.FirstOrDefaultAsync(m => m.GroupId == id && m.User.Username == username.ToLowerInvariant());
        if (them is null) return Results.NotFound();
        them.Role = role;
        await db.SaveChangesAsync();
        await EnsureOrganiserAsync(db, id); // stepping yourself down as the only organiser
        return Results.NoContent();
    }

    /// An organiser removes someone, or you leave (your own username). Out of the chat too.
    private static async Task<IResult> Remove(Guid id, string username, ClaimsPrincipal caller, AppDbContext db, IPhotoStore store, CancellationToken ct)
    {
        var me = caller.GetUserId();
        var mine = await MembershipAsync(db, id, me);
        if (mine is null) return Gone();
        var them = await db.GroupMembers.FirstOrDefaultAsync(m => m.GroupId == id && m.User.Username == username.ToLowerInvariant(), ct);
        if (them is null) return Results.NotFound();
        if (them.UserId != me && mine.Role != GroupRole.Organiser) return NotOrganiser();
        db.GroupMembers.Remove(them);
        await db.DmMembers.Where(m => m.Thread.GroupId == id && m.UserId == them.UserId).ExecuteDeleteAsync(ct);
        await db.EventRsvps.Where(r => r.Event.GroupId == id && r.UserId == them.UserId).ExecuteDeleteAsync(ct); // off the going lists
        await db.SaveChangesAsync(ct);
        // The last one out deletes the group.
        if (!await db.GroupMembers.AnyAsync(m => m.GroupId == id, ct)) await DeleteGroupAsync(db, store, mine.Group, ct);
        else await EnsureOrganiserAsync(db, id);
        return Results.NoContent();
    }

    private static async Task<IResult> MySettings(Guid id, MySettingsRequest req, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var mine = await MembershipAsync(db, id, me);
        if (mine is null) return Gone();
        if (req.OnBoard is { } on) mine.OnBoard = on;
        if (req.Notify is not null)
        {
            if (!Enum.TryParse<GroupNotify>(req.Notify, true, out var n)) return Results.BadRequest(new { error = "All, Important or Off." });
            mine.Notify = n;
        }
        await db.SaveChangesAsync();
        return Results.Ok(new MeDto(mine.Role.ToString(), mine.OnBoard, mine.Notify.ToString()));
    }
}
