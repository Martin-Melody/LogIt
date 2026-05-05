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
}
