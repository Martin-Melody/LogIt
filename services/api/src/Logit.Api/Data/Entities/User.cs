namespace Logit.Api.Data.Entities;

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Username { get; set; } = string.Empty;

    /// The instance a user belongs to. Null = this (local) instance. Non-null =
    /// a remote actor mirrored here once federation ships (Phase 3). Username is
    /// unique per Origin, not globally. See docs/social-federation-design.md.
    public string? Origin { get; set; }

    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Bio { get; set; }
    public string? AvatarUrl { get; set; }
    public string? PublicProfileJson { get; set; }
    public bool OnboardingCompleted { get; set; } = false;
    public string? ProfileJson { get; set; }
    public long ProfileUpdatedAtMs { get; set; } = 0;
    /// The user's nutrition goal — a singleton JSON blob synced like ProfileJson.
    public string? NutritionGoalJson { get; set; }
    public long NutritionGoalUpdatedAtMs { get; set; } = 0;
    public UserTier Tier { get; set; } = UserTier.Free;
    public string? StripeCustomerId { get; set; }
    public string? StripeSubscriptionId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<RefreshToken> RefreshTokens { get; set; } = [];
    public ICollection<PasswordResetToken> PasswordResetTokens { get; set; } = [];
    public ICollection<Follow> Followers { get; set; } = [];
    public ICollection<Follow> Following { get; set; } = [];
    public ICollection<Post> Posts { get; set; } = [];
    public ICollection<CoachClientRelationship> CoachRelationships { get; set; } = [];
    public ICollection<CoachClientRelationship> ClientRelationships { get; set; } = [];
    public ICollection<Like> Likes { get; set; } = [];
    public ICollection<Comment> Comments { get; set; } = [];
    public ICollection<CommentLike> CommentLikes { get; set; } = [];
}

public enum UserTier { Free, Pro, Studio }
