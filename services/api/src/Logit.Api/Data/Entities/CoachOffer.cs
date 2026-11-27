namespace Logit.Api.Data.Entities;

/// A spot a coach offers someone who asked (canvas C2, C6, A1, A5). One request can have
/// several over time; at most one is Open. The package is copied, so editing it later changes
/// nothing here. Running out is worked out from HoldUntil when read (CoachIntake.StateOf), so a
/// payment that lands just after still finds it.
public class CoachOffer
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid RelationshipId { get; set; }
    public CoachClientRelationship Relationship { get; set; } = null!;
    /// Null = no payment through LogIt (the coach sorts payment out themselves).
    public Guid? PackageId { get; set; }
    public string PackageName { get; set; } = string.Empty;
    public string PackageDescription { get; set; } = string.Empty;
    public long AmountCents { get; set; }
    public string Currency { get; set; } = "eur";
    public string Interval { get; set; } = PaymentIntervals.Once;
    public int? Weeks { get; set; }
    /// The spot is held until here; after it the offer has run out.
    public DateTime HoldUntil { get; set; }
    /// When coaching starts; null = the day they take it.
    public DateTime? StartsOn { get; set; }
    /// The first charge; null = when coaching starts. Later for someone already paid up elsewhere.
    public DateTime? FirstChargeOn { get; set; }
    /// OfferStates.*. Open offers past HoldUntil read as Expired.
    public string State { get; set; } = OfferStates.Open;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ClosedAt { get; set; }
}

public static class OfferStates
{
    public const string Open = "open";
    /// The coach changed it: a newer offer replaced this one.
    public const string Replaced = "replaced";
    public const string Withdrawn = "withdrawn";
    public const string Taken = "taken";
    /// Read-only: an Open offer past its HoldUntil.
    public const string Expired = "expired";
}
