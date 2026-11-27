using System.Text.Json;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Coach;

/// How people become clients (canvas P2, R3, C1–C6, A1–A5): the coach's questions and client
/// limit, a request's answers, offers, and the cards that record each step in the conversation.
/// The endpoints are in CoachRequestEndpoints; the rules are here so they read in one place.
public static class CoachIntake
{
    public record Question(string Id, string Label, string Kind, List<string>? Options, bool Optional);
    public record Answer(string QuestionId, string Question, string Value);

    public const int MaxQuestions = 12, MaxLabel = 160, MaxOptions = 10, MaxOption = 60, MaxAnswer = 2000,
        MaxSpots = 500, MaxExpect = 40, MaxMessage = 4000, MaxHoldDays = 30;
    public static readonly string[] WhenFull = ["waitlist", "stop"];

    /// LogIt's five questions (canvas P2), used until a coach writes their own.
    public static readonly List<Question> DefaultQuestions =
    [
        new("goal", "What do you want from coaching?", "text", null, false),
        new("experience", "How long have you been training?", "choice", ["New to it", "Under a year", "1–3 years", "3+ years"], false),
        new("health", "Injuries or health conditions your coach should know about", "text", null, true),
        new("days", "Days a week you can train", "choice", ["2", "3", "4", "5", "6"], false),
        new("food", "Do you want help with food too?", "choice", ["Yes", "No", "Not sure"], false),
    ];

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static List<Question> QuestionsOf(User coach)
    {
        if (string.IsNullOrWhiteSpace(coach.CoachAskQuestionsJson)) return DefaultQuestions;
        try { return JsonSerializer.Deserialize<List<Question>>(coach.CoachAskQuestionsJson, Json) is { Count: > 0 } q ? q : DefaultQuestions; }
        catch (JsonException) { return DefaultQuestions; }
    }

    public static List<Answer> AnswersOf(CoachClientRelationship r)
    {
        if (string.IsNullOrWhiteSpace(r.AnswersJson)) return [];
        try { return JsonSerializer.Deserialize<List<Answer>>(r.AnswersJson, Json) ?? []; }
        catch (JsonException) { return []; }
    }

    public static string ToJson<T>(T value) => JsonSerializer.Serialize(value, Json);

    /// The answers kept with a request: one per question the coach asks, with the question as it
    /// was asked. A problem comes back in words the ask sheet can show.
    public static (List<Answer> Answers, string? Problem) CheckAnswers(List<Question> questions, IReadOnlyDictionary<string, string>? given)
    {
        var answers = new List<Answer>();
        foreach (var q in questions)
        {
            var value = given is not null && given.TryGetValue(q.Id, out var v) ? (v ?? "").Trim() : "";
            if (value.Length == 0)
            {
                if (!q.Optional) return (answers, $"Answer \"{q.Label}\".");
                continue;
            }
            if (value.Length > MaxAnswer) return (answers, $"Keep \"{q.Label}\" under {MaxAnswer:N0} characters.");
            if (q.Kind == "choice" && q.Options is { } opts && !opts.Contains(value))
                return (answers, $"Pick one of the answers for \"{q.Label}\".");
            answers.Add(new Answer(q.Id, q.Label, value));
        }
        return (answers, null);
    }

    /// A coach's own questions, checked (canvas F2's form editor writes them in 1.6).
    public static string? CheckQuestions(List<Question>? questions)
    {
        if (questions is null) return null;
        if (questions.Count is 0 or > MaxQuestions) return $"Ask between 1 and {MaxQuestions} questions.";
        if (questions.Select(q => q.Id).Distinct().Count() != questions.Count) return "Each question needs its own id.";
        foreach (var q in questions)
        {
            if (string.IsNullOrWhiteSpace(q.Id) || q.Id.Length > 40) return "A question is missing its id.";
            if (string.IsNullOrWhiteSpace(q.Label) || q.Label.Length > MaxLabel) return $"Each question needs a label under {MaxLabel} characters.";
            if (q.Kind is not ("text" or "choice")) return "A question is either written or a choice.";
            if (q.Kind == "choice" && (q.Options is not { Count: >= 2 } o || o.Count > MaxOptions || o.Any(x => string.IsNullOrWhiteSpace(x) || x.Length > MaxOption)))
                return $"A choice needs 2 to {MaxOptions} answers, each under {MaxOption} characters.";
        }
        return null;
    }

    /// How an offer stands now: an open one past its HoldUntil has run out.
    public static string StateOf(CoachOffer o, DateTime now) =>
        o.State == OfferStates.Open && o.HoldUntil <= now ? OfferStates.Expired : o.State;

    /// Spots taken: clients (not samples) plus offers still being held.
    public static async Task<int> TakenAsync(AppDbContext db, Guid coachId, DateTime now)
    {
        var clients = await db.CoachClientRelationships.CountAsync(r => r.CoachId == coachId && !r.Client.IsSample
            && (r.Status == CoachClientStatus.Active || r.Status == CoachClientStatus.Paused));
        var held = await db.CoachOffers.CountAsync(o => o.Relationship.CoachId == coachId && o.State == OfferStates.Open
            && o.HoldUntil > now && o.Relationship.Status == CoachClientStatus.Pending && !o.Relationship.Client.IsSample);
        return clients + held;
    }

    public static bool IsFull(User coach, int taken) => coach.CoachSpots is int spots && taken >= spots;

    /// What someone thinking of asking sees about a coach's spots (canvas A4).
    public record Spots(bool Full, string WhenFull, string? ExpectSpots);

    public static async Task<Spots> SpotsAsync(AppDbContext db, User coach, DateTime now) =>
        new(IsFull(coach, await TakenAsync(db, coach.Id, now)), coach.CoachWhenFull ?? "waitlist", coach.CoachExpectSpots);

    /// The coach someone already has, other than this one (canvas R1: "You're coached by Joe
    /// Burke", one quiet line; the other coach is never told).
    public static Task<string?> OtherCoachAsync(AppDbContext db, Guid me, Guid notCoachId) =>
        db.CoachClientRelationships.AsNoTracking()
            .Where(r => r.ClientId == me && r.CoachId != notCoachId && !r.Coach.IsSample
                && (r.Status == CoachClientStatus.Active || r.Status == CoachClientStatus.Paused))
            .Select(r => r.Coach.DisplayName != "" && r.Coach.DisplayName != null ? r.Coach.DisplayName : r.Coach.Username)
            .FirstOrDefaultAsync();

    /// The latest offer on a request, with its state as of now.
    public static async Task<CoachOffer?> LatestOfferAsync(AppDbContext db, Guid relationshipId) =>
        await db.CoachOffers.Where(o => o.RelationshipId == relationshipId).OrderByDescending(o => o.CreatedAt).FirstOrDefaultAsync();

    // ── Cards in the conversation ────────────────────────────────────────────

    public static class Events
    {
        public const string Asked = "asked";
        public const string Offer = "offer";
        public const string OfferChanged = "offer-changed";
        public const string OfferWithdrawn = "offer-withdrawn";
        public const string Waitlist = "waitlist";
        public const string Closed = "closed";
        public const string Withdrawn = "withdrawn";
        public const string Reopened = "reopened";
        public const string Joined = "joined";
        /// In the old coach's conversation: the client moved to another coach.
        public const string Leaving = "leaving";
        /// Coaching ending and pausing (canvas E1, E2, M1, Z2).
        public const string Paused = "paused";
        public const string Resumed = "resumed";
        public const string Ended = "ended";
        public const string Stopping = "stopping";
        public const string Stopped = "stopped";
    }

    public record OfferCard(Guid OfferId, string PackageName, string PackageDescription, long AmountCents, string Currency,
        string Interval, int? Weeks, bool Pays, long HoldUntilMs, long? StartsOnMs, long? FirstChargeOnMs);

    public static OfferCard CardOf(CoachOffer o) => new(o.Id, o.PackageName, o.PackageDescription, o.AmountCents, o.Currency,
        o.Interval, o.Weeks, o.PackageId is not null, Ms(o.HoldUntil)!.Value, Ms(o.StartsOn), Ms(o.FirstChargeOn));

    /// Records a step as a message from `senderId`. `body` says it in words for apps that don't
    /// draw the card; the coach's own words, if any, go first as an ordinary message.
    public static CoachMessage Post(AppDbContext db, CoachClientRelationship rel, Guid senderId, string kind, string body,
        object? card, string? note, DateTime now)
    {
        var ms = new DateTimeOffset(now).ToUnixTimeMilliseconds();
        if (!string.IsNullOrWhiteSpace(note))
            db.CoachMessages.Add(new CoachMessage
            {
                MessageId = $"note-{Guid.NewGuid():N}", RelationshipId = rel.Id, SenderUserId = senderId,
                Body = note.Trim(), CreatedAtMs = ms,
            });
        var evt = new CoachMessage
        {
            MessageId = $"evt-{Guid.NewGuid():N}", RelationshipId = rel.Id, SenderUserId = senderId,
            Body = body, CreatedAtMs = ms + 1, Kind = kind, CardJson = card is null ? null : ToJson(card),
        };
        db.CoachMessages.Add(evt);
        return evt;
    }

    public static string Money(long cents, string currency) => Payments.PaymentEmails.Money(cents, currency);

    public static string PriceText(CoachOffer o) => o.PackageId is null
        ? "no payment through LogIt"
        : o.Interval == PaymentIntervals.Month ? $"{Money(o.AmountCents, o.Currency)} a month" : $"{Money(o.AmountCents, o.Currency)} once";

    public static long? Ms(DateTime? d) =>
        d is { } v ? new DateTimeOffset(DateTime.SpecifyKind(v, DateTimeKind.Utc)).ToUnixTimeMilliseconds() : null;

    public static string NameOf(User u) => string.IsNullOrWhiteSpace(u.DisplayName) ? u.Username : u.DisplayName;
}
