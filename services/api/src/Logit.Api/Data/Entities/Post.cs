namespace Logit.Api.Data.Entities;

public class Post
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid AuthorId { get; set; }
    public PostType Type { get; set; }
    public string? Body { get; set; }
    public string? PayloadJson { get; set; } // serialised workout/PR data
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? DeletedAt { get; set; }

    public User Author { get; set; } = null!;
}

public enum PostType
{
    Text,
    WorkoutSession,
    PersonalRecord,
}
