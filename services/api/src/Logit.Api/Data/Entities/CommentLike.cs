namespace Logit.Api.Data.Entities;

public class CommentLike
{
    public Guid UserId { get; set; }
    public Guid CommentId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User User { get; set; } = null!;
    public Comment Comment { get; set; } = null!;
}
