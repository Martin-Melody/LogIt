using System.Security.Claims;
using System.Text.Json;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Coach;

/// The coach's check-in inbox (every client's submitted answers in one request) and the
/// "reviewed" mark, which lives in its own table (see CheckinReview).
public static class CheckinReviewEndpoints
{
    public const int MaxInboxDays = 365;
    public const int MaxReplyChars = 4000;

    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/checkins/inbox", GetInbox).RequireTier(UserTier.Studio);
        group.MapPost("/checkins/reviews", SetReviewed).RequireTier(UserTier.Studio);
        group.MapGet("/checkins/reviews/mine", GetMyReviews);
    }

    /// Submitted answers from every Active client who shares check-ins, to this coach's own
    /// forms only (a client with two coaches doesn't show one coach the other's form), from
    /// the last `days` days, newest first, each with when this coach reviewed it.
    private static async Task<IResult> GetInbox([FromQuery] int? days, ClaimsPrincipal caller, AppDbContext db)
    {
        var coachId = caller.GetUserId();
        var window = Math.Clamp(days ?? 120, 1, MaxInboxDays);
        var sinceMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - window * 86_400_000L;

        var rels = await db.CoachClientRelationships.AsNoTracking()
            .Where(r => r.CoachId == coachId && r.Status == CoachClientStatus.Active && r.ShareCheckins)
            .Select(r => new { r.Id, r.ClientId })
            .ToListAsync();
        var clientIds = rels.Select(r => r.ClientId).ToList();
        var relByClient = rels.ToDictionary(r => r.ClientId, r => r.Id);

        var myScheduleIds = (await db.CheckinSchedules.AsNoTracking()
            .Where(s => s.CoachId == coachId && s.RecipientUserId != null && clientIds.Contains(s.RecipientUserId.Value))
            .Select(s => new { s.ScheduleId, Client = s.RecipientUserId!.Value })
            .ToListAsync())
            .Select(s => (s.Client, s.ScheduleId))
            .ToHashSet();

        var rows = await db.SyncedCheckinSubmissions.AsNoTracking()
            .Where(s => clientIds.Contains(s.UserId) && s.DeletedAtMs == null && s.UpdatedAtMs >= sinceMs)
            .Select(s => new { s.UserId, s.ClientId, s.DataJson, s.UpdatedAtMs })
            .ToListAsync();

        var reviews = (await db.CheckinReviews.AsNoTracking()
            .Where(r => r.CoachId == coachId && clientIds.Contains(r.ClientUserId))
            .Select(r => new { r.ClientUserId, r.SubmissionId, r.ReviewedAtMs })
            .ToListAsync())
            .ToDictionary(r => (r.ClientUserId, r.SubmissionId), r => r.ReviewedAtMs);

        var items = new List<InboxItem>();
        foreach (var row in rows)
        {
            var (scheduleId, submittedAtMs) = ReadSubmission(row.DataJson);
            if (scheduleId is null || submittedAtMs is null) continue; // drafts stay private
            if (!myScheduleIds.Contains((row.UserId, scheduleId))) continue;
            items.Add(new InboxItem(
                relByClient[row.UserId], row.UserId, row.ClientId, scheduleId, submittedAtMs.Value,
                row.UpdatedAtMs, row.DataJson,
                reviews.TryGetValue((row.UserId, row.ClientId), out var at) ? at : null));
        }

        return Results.Ok(new { items = items.OrderByDescending(i => i.SubmittedAtMs) });
    }

    /// The schedule id and submitted time from a submission's JSON; nulls when unreadable or
    /// still a draft.
    public static (string? ScheduleId, long? SubmittedAtMs) ReadSubmission(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            var scheduleId = root.TryGetProperty("scheduleId", out var s) && s.ValueKind == JsonValueKind.String
                ? s.GetString() : null;
            long? submitted = root.TryGetProperty("submittedAtMs", out var t) && t.ValueKind == JsonValueKind.Number
                ? t.GetInt64() : null;
            return (scheduleId, submitted);
        }
        catch (JsonException)
        {
            return (null, null);
        }
    }

    private static async Task<IResult> SetReviewed(
        [FromBody] SetReviewedRequest req, ClaimsPrincipal caller, AppDbContext db)
    {
        var coachId = caller.GetUserId();
        if (string.IsNullOrWhiteSpace(req.SubmissionId))
            return Results.BadRequest(new { error = "submissionId is required." });

        var rel = await CoachAccess.ActiveRelationship(db, coachId, req.ClientUserId);
        if (rel is null) return Results.Forbid();
        if (!rel.Shares(ShareArea.Checkins)) return CoachAccess.NotShared();

        var existing = await db.CheckinReviews.FirstOrDefaultAsync(r =>
            r.CoachId == coachId && r.ClientUserId == req.ClientUserId && r.SubmissionId == req.SubmissionId);

        if (!req.Reviewed)
        {
            if (existing is not null)
            {
                db.CheckinReviews.Remove(existing);
                await db.SaveChangesAsync();
            }
            return Results.Ok(new { reviewedAtMs = (long?)null });
        }

        var reply = string.IsNullOrWhiteSpace(req.Reply) ? null : req.Reply.Trim();
        if (reply is { Length: > MaxReplyChars }) reply = reply[..MaxReplyChars];
        if (existing is null)
        {
            existing = new CheckinReview
            {
                CoachId = coachId,
                ClientUserId = req.ClientUserId,
                SubmissionId = req.SubmissionId,
                ReviewedAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                Reply = reply,
            };
            db.CheckinReviews.Add(existing);
            await db.SaveChangesAsync();
        }
        else if (reply is not null && reply != existing.Reply)
        {
            // Replying again to a reviewed check-in keeps the first review time, newest reply.
            existing.Reply = reply;
            await db.SaveChangesAsync();
        }
        return Results.Ok(new { reviewedAtMs = (long?)existing.ReviewedAtMs, reply = existing.Reply });
    }

    /// For the client: which of their submissions a coach has reviewed.
    private static async Task<IResult> GetMyReviews(ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var reviews = await db.CheckinReviews.AsNoTracking()
            .Where(r => r.ClientUserId == me)
            .Select(r => new { submissionId = r.SubmissionId, coachId = r.CoachId, reviewedAtMs = r.ReviewedAtMs, reply = r.Reply })
            .ToListAsync();
        return Results.Ok(new { reviews });
    }
}

public record InboxItem(
    Guid RelationshipId, Guid ClientUserId, string Id, string ScheduleId, long SubmittedAtMs,
    long UpdatedAtMs, string DataJson, long? ReviewedAtMs);

public record SetReviewedRequest(Guid ClientUserId, string SubmissionId, bool Reviewed = true, string? Reply = null);
