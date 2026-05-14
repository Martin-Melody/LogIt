namespace Logit.Api.Data.Entities;

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Bio { get; set; }
    public string? AvatarUrl { get; set; }
    public string? PublicProfileJson { get; set; }
    public bool OnboardingCompleted { get; set; } = false;
    public string? ProfileJson { get; set; }
    public long ProfileUpdatedAtMs { get; set; } = 0;
    public UserTier Tier { get; set; } = UserTier.Free;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<RefreshToken> RefreshTokens { get; set; } = [];
    public ICollection<Follow> Followers { get; set; } = [];
    public ICollection<Follow> Following { get; set; } = [];
    public ICollection<Post> Posts { get; set; } = [];
    public ICollection<CoachClientRelationship> CoachRelationships { get; set; } = [];
    public ICollection<CoachClientRelationship> ClientRelationships { get; set; } = [];
    public ICollection<Like> Likes { get; set; } = [];
    public ICollection<Comment> Comments { get; set; } = [];
}

public enum UserTier { Free, Pro }
