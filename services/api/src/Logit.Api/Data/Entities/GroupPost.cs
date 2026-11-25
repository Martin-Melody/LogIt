namespace Logit.Api.Data.Entities;

/// A thread in a group's Posts (design canvas Q1–Q7; Martin's notes 25 Nov), Reddit-style: a
/// title, text, a kind ("Question", or the poster's own), an optional photo or shared card;
/// upvotes only; comments nest under what they answer. Kept apart from feed posts so feeds,
/// profiles and Discover never pick them up.
public class GroupPost
{
    /// Permanent id (federation rule 3).
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GroupId { get; set; }
    public Group Group { get; set; } = null!;
    /// Null once the author deleted their account (shown "Deleted account").
    public Guid? AuthorId { get; set; }
    public User? Author { get; set; }
    public string Title { get; set; } = "";
    public string Body { get; set; } = "";
    public string Kind { get; set; } = "Question";
    /// For the web address: getlogit.app/g/{group slug}/{slug}-{short id}.
    public string Slug { get; set; } = "";
    public Guid? PhotoId { get; set; }
    public int PhotoWidth { get; set; }
    public int PhotoHeight { get; set; }
    public string? CardType { get; set; }
    public string? CardJson { get; set; }
    /// Members only for this post's comments, narrower than the group's setting.
    public bool MembersOnlyComments { get; set; }
    /// Written while the group showed posts on the web: only these ever appear there.
    public bool OnWeb { get; set; }
    public bool Pinned { get; set; }
    /// Comments locked by a moderator.
    public bool Locked { get; set; }
    public int Upvotes { get; set; }
    public int CommentCount { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastActivityAt { get; set; } = DateTime.UtcNow;
    public DateTime? EditedAt { get; set; }
    public DateTime? DeletedAt { get; set; }
    public bool RemovedByModerator { get; set; }
}

public class GroupComment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PostId { get; set; }
    public GroupPost Post { get; set; } = null!;
    /// The comment it answers; null for a top-level comment.
    public Guid? ParentId { get; set; }
    public Guid? AuthorId { get; set; }
    public User? Author { get; set; }
    public string Body { get; set; } = "";
    public int Upvotes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? EditedAt { get; set; }
    public DateTime? DeletedAt { get; set; }
    public bool RemovedByModerator { get; set; }
}

/// An upvote on a post (CommentId null) or a comment. No downvotes (no pile-ons).
public class GroupVote
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid PostId { get; set; }
    public Guid? CommentId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public enum GroupPosting { Members, Staff }
public enum GroupCommenting { Anyone, Members }
