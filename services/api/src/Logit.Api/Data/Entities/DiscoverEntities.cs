namespace Logit.Api.Data.Entities;

/// "Not interested": Discover stops showing this person's posts and suggesting them.
public class DiscoverDismissal
{
    public Guid UserId { get; set; }
    public Guid HiddenUserId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User HiddenUser { get; set; } = null!;
}

public enum DiscoverTargetKind { Post, Person }

/// One post or person Discover showed someone, with the recipe that picked it. Kept once per
/// (viewer, target): the first recipe to show it gets the credit. Comparing these with later
/// likes, comments and follows tells us which recipe works (see DiscoverStats).
public class DiscoverImpression
{
    public Guid UserId { get; set; }
    public DiscoverTargetKind Kind { get; set; }
    public Guid TargetId { get; set; }
    /// The experiment arm the viewer was in, and the recipe inside it that picked this.
    public string Arm { get; set; } = string.Empty;
    public string Recipe { get; set; } = string.Empty;
    public DateTime ShownAt { get; set; } = DateTime.UtcNow;
}
