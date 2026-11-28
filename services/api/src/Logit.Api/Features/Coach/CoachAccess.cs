using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Coach;

/// The kinds of client data a client can share with (or hide from) a coach.
public enum ShareArea { Workouts, Nutrition, Bodyweight, Habits, Checkins }

/// What a client shares with one coach. Sent by the client when accepting, asking through a
/// link, or changing it in My coach; shown to the coach so the UI can say "Not shared".
public record SharingDto(bool Workouts, bool Nutrition, bool Bodyweight, bool Habits, bool Checkins, bool? PastTraining = null)
{
    public static readonly SharingDto All = new(true, true, true, true, true, true);
}

/// The one place that decides what a coach may read of a client's data. Every coach read
/// (the ?clientId= sync pulls, the roster, the check-in inbox) goes through here.
public static class CoachAccess
{
    public static bool Shares(this CoachClientRelationship r, ShareArea area) => area switch
    {
        ShareArea.Workouts => r.ShareWorkouts,
        ShareArea.Nutrition => r.ShareNutrition,
        ShareArea.Bodyweight => r.ShareBodyweight,
        ShareArea.Habits => r.ShareHabits,
        ShareArea.Checkins => r.ShareCheckins,
        _ => false,
    };

    public static SharingDto ToSharingDto(this CoachClientRelationship r) =>
        new(r.ShareWorkouts, r.ShareNutrition, r.ShareBodyweight, r.ShareHabits, r.ShareCheckins, r.WorkoutsSinceMs is null);

    public static void ApplySharing(this CoachClientRelationship r, SharingDto s)
    {
        r.ShareWorkouts = s.Workouts;
        r.ShareNutrition = s.Nutrition;
        r.ShareBodyweight = s.Bodyweight;
        r.ShareHabits = s.Habits;
        r.ShareCheckins = s.Checkins;
        // Training from before (canvas SP3): off hides workouts from before now; on shows them again.
        if (s.PastTraining == false && r.WorkoutsSinceMs is null) r.WorkoutsSinceMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        else if (s.PastTraining == true) r.WorkoutsSinceMs = null;
    }

    /// The earliest workout this coach may see of a client (null = all of them).
    public static async Task<long?> WorkoutsSince(AppDbContext db, Guid coachId, Guid clientId) =>
        (await ActiveRelationship(db, coachId, clientId))?.WorkoutsSinceMs;

    public static Task<CoachClientRelationship?> ActiveRelationship(
        AppDbContext db, Guid coachId, Guid clientId) =>
        db.CoachClientRelationships.AsNoTracking().FirstOrDefaultAsync(r =>
            r.CoachId == coachId && r.ClientId == clientId && r.Status == CoachClientStatus.Active);

    /// 403 body for data the client keeps private, so the UI can tell it from other errors.
    public static IResult NotShared() =>
        Results.Json(new { error = "The client doesn't share this with you.", code = "not_shared" },
            statusCode: StatusCodes.Status403Forbidden);
}
