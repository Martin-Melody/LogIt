namespace Logit.Api.Data.Entities;

/// One of a user's own library items: a strength exercise, cardio activity or mobility
/// drill (see packages/core/src/domain/library.ts). The app owns DataJson; the server only
/// reads its "kind" (into Kind) and never anything else.
public class SyncedExercise
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string ClientId { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public long CreatedAtMs { get; set; }
    public string DataJson { get; set; } = string.Empty;
    public long? DeletedAtMs { get; set; }
    public DateTime SyncedAt { get; set; } = DateTime.UtcNow;

    /// "strength", "cardio" or "mobility". Rows from before the library are all strength.
    public string Kind { get; set; } = LibraryKinds.Strength;

    /// A coach's switch: every active client sees this item, read-only. Items in a program
    /// assigned to a client reach that client whatever this says (see CoachLibrary).
    public bool SharedWithClients { get; set; }
}

public static class LibraryKinds
{
    public const string Strength = "strength";
    public const string Cardio = "cardio";
    public const string Mobility = "mobility";

    /// The "kind" field of an item's JSON; strength when it has none (every row written
    /// before cardio and mobility existed) or it isn't one we know.
    public static string FromDataJson(string? json)
    {
        if (string.IsNullOrEmpty(json)) return Strength;
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind == System.Text.Json.JsonValueKind.Object
                && doc.RootElement.TryGetProperty("kind", out var k)
                && k.ValueKind == System.Text.Json.JsonValueKind.String)
            {
                var s = k.GetString();
                if (s is Cardio or Mobility) return s;
            }
        }
        catch (System.Text.Json.JsonException) { }
        return Strength;
    }
}
