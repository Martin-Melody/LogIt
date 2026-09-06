namespace Logit.Api.Data.Entities;

public class Post
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid AuthorId { get; set; }
    public PostType Type { get; set; }
    public string? Body { get; set; }
    public string? PayloadJson { get; set; } // serialised workout/PR data
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? EditedAt { get; set; }
    public DateTime? DeletedAt { get; set; }

    /// Set when this post is a repost — points at the post it was reposted from. A repost is
    /// always a Text row: a plain repost has a null Body (client renders the quoted original
    /// with a "reposted" marker), a quote repost carries the reposter's own commentary in Body.
    /// Either way the shared content lives on the original and is reached via RepostOf. The
    /// original is soft-deleted, not removed, so this link survives and the client greys the
    /// quoted card out; SetNull is only a safety net for a hard delete.
    public Guid? RepostOfId { get; set; }
    public Post? RepostOf { get; set; }

    public User Author { get; set; } = null!;
    public ICollection<Like> Likes { get; set; } = [];
    public ICollection<Comment> Comments { get; set; } = [];
}

public enum PostType
{
    Text,
    WorkoutSession,
    PersonalRecord,
    Split,
    Exercise,
    Algorithm,
    Widget,
    // Added at the end deliberately — EF Core stores this enum as its underlying int by
    // default, so a new member must go last to avoid renumbering (and thus reinterpreting)
    // every existing row's stored value.
    Habit,
}
