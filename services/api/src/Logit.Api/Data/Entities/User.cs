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
    /// The plan the user has right now: the higher of ManualTier and any paid subscription
    /// that currently grants access. Never set it directly; call Entitlements.Recompute.
    public UserTier Tier { get; set; } = UserTier.Free;
    /// A plan granted by hand in the admin page (friends, testers, refunds). Null = none.
    public UserTier? ManualTier { get; set; }
    public string? StripeCustomerId { get; set; }
    /// As a coach: the swap rule for every client without their own (see SwapRules). Null = "any".
    public string? CoachSwapRule { get; set; }
    /// Social privacy (see Features/Social/Privacy.cs). A private account's follows need its
    /// approval, and only accepted followers see its posts, profile cards and follow lists.
    public bool IsPrivate { get; set; }
    /// Whether this account's posts may appear in other people's Discover. Null = never asked
    /// (accounts from before Discover existed); treated as "no" until they answer once.
    public bool? ShowInDiscover { get; set; }
    /// Keep this account out of other people's "People you might know".
    public bool HideFromSuggestions { get; set; }
    /// Don't show "People you might know" to this account (they closed the section).
    public bool HidePeopleSuggestions { get; set; }
    /// A sample client in a Studio coach's sandbox (see Features/Sandbox). Nobody signs in as one:
    /// it has no usable password, only its coach gets short-lived tokens for it, and it's left
    /// out of social, search, suggestions, admin counts and payments.
    public bool IsSample { get; set; }
    /// The coach whose sandbox this sample client belongs to. Deleting the coach deletes it.
    public Guid? SampleOwnerId { get; set; }
    public User? SampleOwner { get; set; }
    /// Walkthrough progress (chapters done, welcome card seen), shared by web and phone.
    /// Opaque JSON written by the apps, see packages/core/src/guide.
    public string? GuideJson { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    /// The invite this account signed up with (invite-only servers). Null for open sign-up.
    public Guid? InviteId { get; set; }
    public Invite? Invite { get; set; }

    public ICollection<BillingSubscription> Subscriptions { get; set; } = [];
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
