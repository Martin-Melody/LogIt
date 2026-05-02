namespace Logit.Api.Data.Entities;

public class Follow
{
    public Guid FollowerId { get; set; }
    public Guid FollowedId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User Follower { get; set; } = null!;
    public User Followed { get; set; } = null!;
}
