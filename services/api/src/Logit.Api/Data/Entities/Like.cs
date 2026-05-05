namespace Logit.Api.Data.Entities;

public class Like
{
    public Guid UserId { get; set; }
    public Guid PostId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User User { get; set; } = null!;
    public Post Post { get; set; } = null!;
}
