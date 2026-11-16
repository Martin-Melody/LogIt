namespace Logit.Api.Data.Entities;

/// Someone asked to follow a private account and is waiting for it to accept. Accepting turns
/// it into a Follow; declining or cancelling deletes it.
public class FollowRequest
{
    public Guid RequesterId { get; set; }
    public Guid TargetId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User Requester { get; set; } = null!;
    public User Target { get; set; } = null!;
}
