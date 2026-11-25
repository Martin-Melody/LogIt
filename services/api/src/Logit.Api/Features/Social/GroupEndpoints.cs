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
    }

    public record PersonDto(string Username, string DisplayName, string? AvatarUrl, Guid Id);
    public record BriefDto(Guid Id, string Name, string Kind, string? Place, string? PhotoUrl, int Members);
    public record NoteDto(string Text, PersonDto? By, long AtMs);
    public record MeDto(string Role, bool OnBoard, string Notify);
    public record GroupDto(Guid Id, string Name, string Kind, string? Place, string? PhotoUrl, int Members, Guid ThreadId, string InviteCode,
        NoteDto? Note, MeDto Me, List<PersonDto> Organisers, List<PersonDto> Preview);
    public record MemberDto(PersonDto User, string Role, long JoinedAtMs);
    public record PreviewDto(Guid Id, string Name, string Kind, string? Place, string? PhotoUrl, int Members, string? Organiser,
        List<PersonDto> Followed, bool Member);
    public record CreateRequest(string Name, string? Kind, string? Place, Guid? PhotoId);
    public record EditRequest(string? Name, string? Kind, string? Place, Guid? PhotoId, bool RemovePhoto = false);
    public record JoinRequest(bool OnBoard = true);
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

        var now = clock.GetUtcNow().UtcDateTime;
        var group = new Group { Name = name, Kind = kind, Place = Clean(req.Place, 60), PhotoId = photo?.Id, InviteCode = NewCode(), CreatedAt = now };
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
        return new GroupDto(g.Id, g.Name, g.Kind, g.Place, PhotoOf(g), count, threadId, g.InviteCode,
            g.Note is null ? null : new NoteDto(g.Note, noteBy is null ? null : Person(noteBy), Ms(g.NoteAt ?? g.CreatedAt)),
            new MeDto(mine.Role.ToString(), mine.OnBoard, mine.Notify.ToString()),
            [.. organisers.Select(Person)], [.. preview.Select(Person)]);
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
        return Results.Ok(new PreviewDto(g.Id, g.Name, g.Kind, g.Place, PhotoOf(g), count, organiser, followed, member));
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
        var now = clock.GetUtcNow().UtcDateTime;
        db.GroupMembers.Add(new GroupMember { GroupId = g.Id, UserId = me, OnBoard = req?.OnBoard ?? true, JoinedAt = now });
        var threadId = await db.DmThreads.Where(t => t.GroupId == g.Id).Select(t => t.Id).FirstAsync();
        // The chat starts from now for you: earlier messages show, but none count as unread.
        db.DmMembers.Add(new DmMember { ThreadId = threadId, UserId = me, Accepted = true, LastReadAt = now });
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException) { /* joined twice at once */ }
        return Results.Ok(new { id = g.Id });
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
