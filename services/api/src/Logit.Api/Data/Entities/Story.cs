namespace Logit.Api.Data.Entities;

/// A story (friends overhaul, design canvas S1–S4; journey F4), copied from Instagram: it lasts
/// 24 hours, follows the account's privacy (public: followers see it in their row; private:
/// approved followers), can go to Close friends only, and can be hidden from chosen people.
/// Made from a workout or a record (a card, the same format as a message card); photos later.
public class Story
{
    /// Permanent id (federation rule 3).
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid AuthorId { get; set; }
    public User Author { get; set; } = null!;
    public bool CloseFriends { get; set; }
    /// "WorkoutSession" or "PersonalRecord", as in a message card.
    public string CardType { get; set; } = "";
    public string CardJson { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }
}

/// Someone watched a story (the author sees who), and maybe cheered it (Instagram's story like).
public class StoryView
{
    public Guid StoryId { get; set; }
    public Story Story { get; set; } = null!;
    public Guid ViewerId { get; set; }
    public User Viewer { get; set; } = null!;
    public DateTime ViewedAt { get; set; } = DateTime.UtcNow;
    public bool Cheered { get; set; }
}

/// Owner's Close friends list (Instagram): who sees their close-friends stories.
public class CloseFriend
{
    public Guid OwnerId { get; set; }
    public Guid FriendId { get; set; }
    public User Friend { get; set; } = null!;
}

/// Owner's "Hide story from" list (Instagram): who never sees their stories.
public class StoryHide
{
    public Guid OwnerId { get; set; }
    public Guid HiddenId { get; set; }
    public User Hidden { get; set; } = null!;
}
