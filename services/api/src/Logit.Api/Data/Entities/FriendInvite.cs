namespace Logit.Api.Data.Entities;

/// Someone's "Invite a friend" link (design canvas T3): accepting it makes the two follow each
/// other. One per person; a new link replaces the old one.
public class FriendInvite
{
    public string Code { get; set; } = "";
    public Guid InviterId { get; set; }
    public User Inviter { get; set; } = null!;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
