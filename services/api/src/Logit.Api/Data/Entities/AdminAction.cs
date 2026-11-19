namespace Logit.Api.Data.Entities;

/// One thing an admin did (reset a password, deleted an account, made someone admin), shown on
/// the admin console. Names are copied in so the entry still reads after an account is deleted.
public class AdminAction
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    /// The admin's account, or null when the request used ADMIN_KEY.
    public Guid? ActorUserId { get; set; }
    public string ActorName { get; set; } = string.Empty;
    /// What happened, e.g. "user.delete" (see AdminLog for the list).
    public string Action { get; set; } = string.Empty;
    public Guid? TargetUserId { get; set; }
    public string? TargetName { get; set; }
    public string? Detail { get; set; }
}
