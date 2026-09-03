namespace Logit.Api.Data.Entities;

public enum ReportTargetType { Post, Comment, User }

public enum ReportReason { Spam, Harassment, HateSpeech, Violence, SexualContent, SelfHarm, Misinformation, Other }

public enum ReportStatus { Open, Reviewed, Actioned, Dismissed }

/// A user-submitted report against a post, comment, or user. Reviewed from the
/// /admin panel.
public class Report
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ReporterId { get; set; }
    public ReportTargetType TargetType { get; set; }
    public Guid TargetId { get; set; }
    public ReportReason Reason { get; set; }
    public string? Note { get; set; }
    public ReportStatus Status { get; set; } = ReportStatus.Open;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ReviewedAt { get; set; }
    public Guid? ReviewerId { get; set; }

    public User Reporter { get; set; } = null!;
}
