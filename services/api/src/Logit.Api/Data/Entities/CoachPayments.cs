namespace Logit.Api.Data.Entities;

/// A Studio coach's Stripe account and payment settings. Clients pay the coach directly
/// (direct charges on the coach's own Stripe account); LogIt takes no fee.
public class CoachPaymentAccount
{
    public Guid CoachId { get; set; }
    public User Coach { get; set; } = null!;
    /// The coach's connected account ("acct_…"). Null until they press Connect Stripe.
    public string? StripeAccountId { get; set; }
    /// Stripe says the account can take card payments (onboarding finished and verified).
    public bool CardPaymentsActive { get; set; }
    /// Stripe still wants something from the coach (ID, bank details, …).
    public bool RequirementsDue { get; set; }
    /// The business name Stripe has, shown on the Payments page.
    public string? DisplayName { get; set; }
    /// Lower case ISO code ("eur"). Packages are priced in it.
    public string Currency { get; set; } = "eur";
    public string Country { get; set; } = "ie";
    public DateTime? StatusCheckedAt { get; set; }

    /// What happens when a client's payment fails, a one-off package runs out, or a monthly
    /// plan is stopped (see PaymentRules). Each client can have their own instead.
    public string FailRule { get; set; } = PaymentRules.Pause;
    public int FailDays { get; set; } = PaymentRules.DefaultDays;
    public bool EmailOnFail { get; set; } = true;
    /// Show the client a note in the app about the problem (never a price or a pay button).
    public bool ShowClientNote { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// Something a coach sells: monthly coaching, or a one-off block of N weeks.
public class CoachPackage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CoachId { get; set; }
    public User Coach { get; set; } = null!;
    public string Name { get; set; } = string.Empty;
    /// "What's included", shown on the payment page.
    public string Description { get; set; } = string.Empty;
    /// In the smallest unit (cents).
    public long AmountCents { get; set; }
    public string Currency { get; set; } = "eur";
    /// PaymentIntervals.Month or PaymentIntervals.Once.
    public string Interval { get; set; } = PaymentIntervals.Month;
    /// How long a one-off package lasts. Null for monthly.
    public int? Weeks { get; set; }
    /// Hidden packages can't be put on links; clients already on them stay.
    public bool Hidden { get; set; }
    /// Listed in the Coaching section of the coach's profile, with its price.
    public bool ShowOnProfile { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// How one coached client pays (at most one per relationship).
public class CoachClientPayment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid RelationshipId { get; set; }
    public CoachClientRelationship Relationship { get; set; } = null!;
    /// PaymentModes.Stripe (pays through LogIt) or PaymentModes.Elsewhere (coach marks it).
    public string Mode { get; set; } = PaymentModes.Stripe;
    public Guid? PackageId { get; set; }
    // A copy of the package as it was bought, so editing the package changes nothing here.
    public string PackageName { get; set; } = string.Empty;
    public long AmountCents { get; set; }
    public string Currency { get; set; } = "eur";
    public string Interval { get; set; } = PaymentIntervals.Month;

    public string? StripeCheckoutSessionId { get; set; }
    public string? StripeSubscriptionId { get; set; }
    public string? StripeCustomerId { get; set; }

    /// PaymentStates.*
    public string State { get; set; } = PaymentStates.Paid;
    /// Paid up to here: the end of the month paid for, the end of a one-off package, or the
    /// date a coach marked an outside payment up to.
    public DateTime? PaidUntil { get; set; }
    /// When the client stopped being paid up (a failed payment, a one-off package ending, a
    /// stopped plan). The coach's rule counts its days from here. Null = paid up.
    public DateTime? UnpaidSince { get; set; }
    /// The monthly plan ends at PaidUntil (the client or coach stopped it).
    public bool StopsAtPeriodEnd { get; set; }
    /// This client's own rule; null = the coach's default.
    public string? FailRule { get; set; }
    public int? FailDays { get; set; }
    /// Coaching was paused (or ended) by the rule, not by hand, so a payment brings it back.
    public bool PausedForPayment { get; set; }
    /// The coach was emailed about the current problem (one email per problem).
    public DateTime? CoachEmailedAt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// One payment that reached a coach (for "paid to you this month").
public class CoachPaymentReceipt
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CoachId { get; set; }
    public Guid? RelationshipId { get; set; }
    /// The Stripe invoice or checkout session it came from; unique, so a webhook sent twice
    /// counts once.
    public string ExternalId { get; set; } = string.Empty;
    public long AmountCents { get; set; }
    public string Currency { get; set; } = "eur";
    public DateTime PaidAt { get; set; }
}

public static class PaymentModes
{
    public const string Stripe = "stripe";
    public const string Elsewhere = "elsewhere";
}

public static class PaymentIntervals
{
    public const string Month = "month";
    public const string Once = "once";
}

public static class PaymentStates
{
    /// Paid up (or a monthly plan running normally).
    public const string Paid = "paid";
    /// The last payment failed; Stripe is retrying the card.
    public const string Failed = "failed";
    /// No longer paid: a one-off package ran out, a plan was stopped and its month ended, or
    /// Stripe gave up on the card.
    public const string Ended = "ended";
}

public static class PaymentLimits
{
    public const int MaxNameChars = 80;
    public const int MaxDescriptionChars = 600;
    public const long MinAmountCents = 100;          // €1
    public const long MaxAmountCents = 1_000_000;    // €10,000
    public const int MaxWeeks = 104;
    public const int MaxPackages = 30;
}

/// What happens to coaching when a client isn't paid up (see Features/Coach/Payments).
public static class PaymentRules
{
    /// Keep coaching; only tell the coach.
    public const string Keep = "keep";
    /// Pause coaching after N days unpaid; paying restarts it.
    public const string Pause = "pause";
    /// End coaching after N days unpaid.
    public const string End = "end";
    public const int DefaultDays = 7;
    public const int MaxDays = 60;

    public static bool IsValid(string? rule) => rule is Keep or Pause or End;
}
