namespace Logit.Api.Data.Entities;

/// A recorded voice message (design canvas M5–M6, C1–C2), kept like a photo: the file lives in
/// the photo store under "v" + its id, and only people who were sent its address have it.
public class VoiceNote
{
    public Guid Id { get; set; } = Guid.NewGuid();
    /// Null once the owner's account is deleted: the sweeper then removes the file and the row.
    public Guid? OwnerId { get; set; }
    public User? Owner { get; set; }
    /// audio/webm, audio/ogg or audio/mp4, from the file's first bytes.
    public string ContentType { get; set; } = "audio/webm";
    public int DurationMs { get; set; }
    public long Bytes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
