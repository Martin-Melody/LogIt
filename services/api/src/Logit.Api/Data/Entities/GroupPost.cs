namespace Logit.Api.Data.Entities;

/// A forum post (design canvas row 19; Martin, 25 Nov), Reddit-style: a title, text, #tags, an
/// optional photo or shared card, and optionally a group it's labelled with; upvotes only;
/// comments nest under what they answer. Kept apart from regular feed posts: the feed only shows
/// a title card for forum posts from people you follow and your groups.
public class GroupPost
{
    /// Permanent id (federation rule 3).
    public Guid Id { get; set; } = Guid.NewGuid();
    /// The group it's labelled with, if any. Posts labelled with an invite-only group stay inside it.
    public Guid? GroupId { get; set; }
    public Group? Group { get; set; }
    /// Null once the author deleted their account (shown "Deleted account").
    public Guid? AuthorId { get; set; }
    public User? Author { get; set; }
    public string Title { get; set; } = "";
    public string Body { get; set; } = "";
    /// Its #tags, lower case, space-separated ("sligo gyms"); indexed in Hashtags.
    public string Tags { get; set; } = "";
    /// For the web address: getlogit.app/forum/{slug}-{short id}.
    public string Slug { get; set; } = "";
    public Guid? PhotoId { get; set; }
    public int PhotoWidth { get; set; }
    public int PhotoHeight { get; set; }
    public string? CardType { get; set; }
    public string? CardJson { get; set; }
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

/// One #tag on a forum post or a regular post (canvas F3, F4): what tag pages, suggestions and
/// trending read. Lower case, so #Sligo = #sligo.
public class Hashtag
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Tag { get; set; } = "";
    public Guid? ForumPostId { get; set; }
    public Guid? PostId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
