namespace Logit.Api.Data.Entities;

// Client-owned nutrition rows, synced through /sync/nutrition/*. Same conventions as
// SyncedCheckinSubmission: app-generated stable ClientId, last-write-wins by UpdatedAtMs,
// tombstoned via DeletedAtMs, pull cursor on SyncedAt. Coach-readable via ?clientId= for
// the ones whose data a coach reviews (days, weight) — see SyncEndpoints/ResolveTargetUserId.
// The nutrition goal is a singleton and lives on User.NutritionGoalJson, like the profile.

/// Shared shape of every per-row nutrition sync entity, so SyncEndpoints can handle them
/// with one generic push/pull pair.
public interface ISyncedNutritionRow
{
    string ClientId { get; set; }
    Guid UserId { get; set; }
    long CreatedAtMs { get; set; }
    long UpdatedAtMs { get; set; }
    string DataJson { get; set; }
    long? DeletedAtMs { get; set; }
    DateTime SyncedAt { get; set; }
}

/// One calendar day of a user's food diary (all meals + logged items) as a JSON blob.
public class SyncedNutritionDay : ISyncedNutritionRow
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string ClientId { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public long CreatedAtMs { get; set; }
    public long UpdatedAtMs { get; set; }
    public string DataJson { get; set; } = string.Empty;
    public long? DeletedAtMs { get; set; }
    public DateTime SyncedAt { get; set; } = DateTime.UtcNow;
}

/// A user-authored food (not from the bundled database).
public class SyncedCustomFood : ISyncedNutritionRow
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string ClientId { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public long CreatedAtMs { get; set; }
    public long UpdatedAtMs { get; set; }
    public string DataJson { get; set; } = string.Empty;
    public long? DeletedAtMs { get; set; }
    public DateTime SyncedAt { get; set; } = DateTime.UtcNow;
}

/// A user-authored recipe (ingredients + servings + cached per-serving macros).
public class SyncedRecipe : ISyncedNutritionRow
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string ClientId { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public long CreatedAtMs { get; set; }
    public long UpdatedAtMs { get; set; }
    public string DataJson { get; set; } = string.Empty;
    public long? DeletedAtMs { get; set; }
    public DateTime SyncedAt { get; set; } = DateTime.UtcNow;
}

/// One bodyweight reading.
public class SyncedWeightEntry : ISyncedNutritionRow
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string ClientId { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public long CreatedAtMs { get; set; }
    public long UpdatedAtMs { get; set; }
    public string DataJson { get; set; } = string.Empty;
    public long? DeletedAtMs { get; set; }
    public DateTime SyncedAt { get; set; } = DateTime.UtcNow;
}
