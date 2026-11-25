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
    public ICollection<GroupMember> Members { get; set; } = [];
}

public enum GroupRole { Member, Organiser }

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
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
}
