namespace Logit.Api.Data.Entities;

/// A picture someone uploaded (profile picture, progress photo; later posts, messages, stories).
/// The file lives in the photo store under its id; the id is random, so its address can't be
/// guessed and is only known to people who were shown it.
public class Photo
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// Null once the owner's account is deleted: the sweeper then removes the file and the row.
    public Guid? OwnerId { get; set; }
    public User? Owner { get; set; }

    public string ContentType { get; set; } = "image/jpeg";
    public int Width { get; set; }
    public int Height { get; set; }
    public long Bytes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
