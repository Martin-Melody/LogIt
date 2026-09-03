namespace Logit.Api.Data.Entities;

/// One user blocking another. Blocking is mutual invisibility: neither party sees
/// the other's posts, comments, profile, or search results, and any follow rows
/// between them are removed when the block is created.
public class Block
{
    public Guid BlockerId { get; set; }
    public Guid BlockedId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User Blocker { get; set; } = null!;
    public User Blocked { get; set; } = null!;
}
