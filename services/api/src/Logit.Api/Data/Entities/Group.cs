namespace Logit.Api.Data.Entities;

/// A group (friends overhaul, design canvas G1–G10; journey F5): a gym, club, team or group of
/// friends. Primarily a page (pinned note, members, later events and the board) with a group chat
/// (a DmThread with this GroupId). Joined with its link or QR. Pattern: Strava clubs / Facebook
/// groups; Instagram has none.
public class Group
{
    /// Permanent id (federation rule 3: a group lives on one instance).
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    /// "Gym", "Club", "Team" or "Friends".
    public string Kind { get; set; } = "Club";
    /// Shown under the name ("Dublin 8").
    public string? Place { get; set; }
    public Guid? PhotoId { get; set; }
    /// The join link's code; resetting it stops the old link and QR working.
    public string InviteCode { get; set; } = "";
    /// The pinned note (one at a time).
    public string? Note { get; set; }
    public Guid? NoteById { get; set; }
    public DateTime? NoteAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public GroupAccess Access { get; set; } = GroupAccess.InviteOnly;
    /// For web addresses (getlogit.app/g/{slug}/…); unique.
    public string Slug { get; set; } = "";
    /// Posts (canvas Q4): on, who can post, who can comment, and whether posts show on the web
    /// (findable groups only; off until an organiser turns it on).
    public bool PostsOn { get; set; } = true;
    public GroupPosting WhoCanPost { get; set; } = GroupPosting.Members;
    public GroupCommenting WhoCanComment { get; set; } = GroupCommenting.Anyone;
    public bool PostsOnWeb { get; set; }
    public ICollection<GroupMember> Members { get; set; } = [];
}

/// Who can find and join (canvas G11, as Strava clubs / Facebook groups). Invites from members
/// and the link always work.
public enum GroupAccess { InviteOnly, Request, Open }

/// Someone asked to join a findable group (G13); an organiser approves or declines (G14).
public class GroupJoinRequest
{
    public Guid GroupId { get; set; }
    public Group Group { get; set; } = null!;
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public bool OnBoard { get; set; } = true;
    /// Asked from an event in search ("Ask to join"): marked going once let in.
    public Guid? GoingTo { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// A member invited someone from a chat (G15–G16): it lets them join straight away, also an
/// invite-only group, whatever happens to the link.
public class GroupInvite
{
    public Guid GroupId { get; set; }
    public Group Group { get; set; } = null!;
    public Guid InviteeId { get; set; }
    public Guid InviterId { get; set; }
    public User Inviter { get; set; } = null!;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// Organisers run the group (edit, delete, roles); moderators keep it civil (remove messages,
/// mute, approve requests, remove members, reports). Stored as numbers, so Moderator comes last.
public enum GroupRole { Member, Organiser, Moderator }

/// Per-group notifications (canvas P3, as on Facebook groups): every chat message; events, notes
/// and mentions (the default); or off.
public enum GroupNotify { All, Important, Off }

public class GroupMember
{
    public Guid GroupId { get; set; }
    public Group Group { get; set; } = null!;
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public GroupRole Role { get; set; }
    /// "Show me on this group's board" (Strava's hide-from-leaderboards); offered when joining.
    public bool OnBoard { get; set; } = true;
    public GroupNotify Notify { get; set; } = GroupNotify.Important;
    /// Muted in the group's chat by a moderator until then: can read, can't send.
    public DateTime? MutedUntil { get; set; }
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
}
