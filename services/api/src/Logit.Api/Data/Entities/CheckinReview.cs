namespace Logit.Api.Data.Entities;

/// A coach marking a client's check-in submission as reviewed. Kept apart from the
/// submission row because that row is client-owned and synced last-write-wins from the
/// client's devices; a coach write there would be overwritten by the next client edit.
public class CheckinReview
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CoachId { get; set; }
    public User Coach { get; set; } = null!;
    public Guid ClientUserId { get; set; }
    public User Client { get; set; } = null!;
    /// The submission's app-generated id (SyncedCheckinSubmission.ClientId).
    public string SubmissionId { get; set; } = string.Empty;
    public long ReviewedAtMs { get; set; }
    /// What the coach wrote back when marking it reviewed ("Send and mark reviewed"); also
    /// sent as a message. Shown with the check-in in the client's history.
    public string? Reply { get; set; }
}
