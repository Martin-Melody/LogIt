using System.Security.Claims;
using System.Text.Json;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Coach;

public static class CoachEndpoints
{
    public static void MapCoachEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/coach").WithTags("Coach").RequireAuthorization();

        group.MapPost("/clients/{username}/invite", Invite);
        group.MapGet("/clients", GetClients);
        group.MapGet("/coaches", GetCoaches);
        // Roster adherence summary for the coach dashboard — one request, aggregated server-side.
        group.MapGet("/roster", GetRoster).RequireTier(UserTier.Studio);
        group.MapGet("/invites/received", GetReceivedInvites);
        group.MapGet("/invites/sent", GetSentInvites);
        group.MapPost("/invites/{relationshipId:guid}/accept", AcceptInvite);
        group.MapPost("/invites/{relationshipId:guid}/decline", DeclineInvite);
        group.MapDelete("/relationships/{relationshipId:guid}", RevokeRelationship);

        // Coach-authored programs. Writes are Studio-only; the assigned-pull is open to any
        // tier (a Free client can be coached). See CoachProgram entity for the isolation note.
        group.MapPost("/programs", UpsertProgram).RequireTier(UserTier.Studio);
        group.MapGet("/programs", GetMyPrograms).RequireTier(UserTier.Studio);
        group.MapGet("/programs/assigned", GetAssignedPrograms);

        // Coach check-in schedules — same shape/rules as programs. Client answers come back
        // as SyncedCheckinSubmission rows via /sync/checkins (see SyncEndpoints).
        group.MapPost("/checkins", UpsertCheckinSchedule).RequireTier(UserTier.Studio);
        group.MapGet("/checkins", GetMyCheckinSchedules).RequireTier(UserTier.Studio);
        group.MapGet("/checkins/assigned", GetAssignedCheckinSchedules);

        // Coach↔client messaging — bidirectional within an Active relationship, open to any
        // tier (a Free client can reply to their coach). Append-only.
        group.MapPost("/messages", SendMessage);
        group.MapGet("/messages", GetMessages);
        group.MapGet("/messages/all", GetAllMessages);
        group.MapPost("/messages/read", MarkMessagesRead);
        group.MapGet("/messages/unread", GetUnreadCounts);
    }

    private static async Task<IResult> Invite(string username, ClaimsPrincipal caller, AppDbContext db)
    {
        var coachId = caller.GetUserId();
        var coach = await db.Users.FindAsync(coachId);
        if (coach is null) return Results.NotFound();

        if (coach.Tier != UserTier.Studio)
            return Results.Json(
                new { error = "Only Studio-tier accounts can invite clients." },
                statusCode: StatusCodes.Status403Forbidden);

        var client = await db.Users.FirstOrDefaultAsync(u => u.Username == username.ToLowerInvariant());
        if (client is null) return Results.NotFound();
        if (client.Id == coachId) return Results.BadRequest(new { error = "Cannot invite yourself." });

        var existing = await db.CoachClientRelationships.AnyAsync(r =>
            r.CoachId == coachId && r.ClientId == client.Id &&
            (r.Status == CoachClientStatus.Pending || r.Status == CoachClientStatus.Active));
        if (existing) return Results.Conflict(new { error = "Already invited or connected." });

        var relationship = new CoachClientRelationship
        {
            CoachId = coachId,
            ClientId = client.Id,
            Status = CoachClientStatus.Pending,
        };
        db.CoachClientRelationships.Add(relationship);
        await db.SaveChangesAsync();

        return Results.Created($"/coach/invites/{relationship.Id}", new { relationshipId = relationship.Id });
    }

    private static async Task<IResult> GetClients(ClaimsPrincipal caller, AppDbContext db)
    {
        var coachId = caller.GetUserId();
        var relationships = await db.CoachClientRelationships
            .Include(r => r.Client)
            .Where(r => r.CoachId == coachId && r.Status == CoachClientStatus.Active)
            .OrderBy(r => r.Client.Username)
            .ToListAsync();

        return Results.Ok(relationships.Select(r => new
        {
            relationshipId = r.Id,
            client = r.Client.ToProfileDto(false),
        }));
    }

    /// Per-client adherence summary for the coach dashboard. One round trip: last workout,
    /// recent session counts, assigned-content counts, latest submitted check-in, unread
    /// messages from the client. The coach UI turns these into traffic-light status.
    private static async Task<IResult> GetRoster(ClaimsPrincipal caller, AppDbContext db)
    {
        var coachId = caller.GetUserId();
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var d7 = now - 7L * 86_400_000;
        var d28 = now - 28L * 86_400_000;

        var rels = await db.CoachClientRelationships
            .Include(r => r.Client)
            .Where(r => r.CoachId == coachId && r.Status == CoachClientStatus.Active)
            .OrderBy(r => r.Client.Username)
            .ToListAsync();
        var clientIds = rels.Select(r => r.ClientId).ToList();

        var sessionAgg = (await db.SyncedWorkoutSessions
            .Where(s => clientIds.Contains(s.UserId) && s.DeletedAtMs == null)
            .GroupBy(s => s.UserId)
            .Select(g => new
            {
                UserId = g.Key,
                Last = g.Max(x => (long?)x.StartedAtMs),
                C7 = g.Count(x => x.StartedAtMs >= d7),
                C28 = g.Count(x => x.StartedAtMs >= d28),
            })
            .ToListAsync()).ToDictionary(x => x.UserId);

        var programCounts = (await db.CoachPrograms
            .Where(p => p.CoachId == coachId && p.DeletedAtMs == null && p.RecipientUserId != null
                && clientIds.Contains(p.RecipientUserId.Value))
            .GroupBy(p => p.RecipientUserId!.Value)
            .Select(g => new { UserId = g.Key, N = g.Count() })
            .ToListAsync()).ToDictionary(x => x.UserId, x => x.N);

        var scheduleCounts = (await db.CheckinSchedules
            .Where(s => s.CoachId == coachId && s.DeletedAtMs == null && s.RecipientUserId != null
                && clientIds.Contains(s.RecipientUserId.Value))
            .GroupBy(s => s.RecipientUserId!.Value)
            .Select(g => new { UserId = g.Key, N = g.Count() })
            .ToListAsync()).ToDictionary(x => x.UserId, x => x.N);

        var unread = (await db.CoachMessages
            .Where(m => m.SenderUserId != coachId && m.ReadAtMs == null
                && m.Relationship.CoachId == coachId && m.Relationship.Status == CoachClientStatus.Active)
            .GroupBy(m => m.Relationship.ClientId)
            .Select(g => new { UserId = g.Key, N = g.Count() })
            .ToListAsync()).ToDictionary(x => x.UserId, x => x.N);

        // Latest *submitted* check-in per client — submittedAtMs lives in the JSON payload,
        // so pull the (few) non-deleted rows and parse in memory rather than query into JSON.
        var subsByClient = (await db.SyncedCheckinSubmissions
            .AsNoTracking()
            .Where(s => clientIds.Contains(s.UserId) && s.DeletedAtMs == null)
            .Select(s => new { s.UserId, s.DataJson })
            .ToListAsync())
            .GroupBy(x => x.UserId)
            .ToDictionary(g => g.Key, g => g.Select(x => x.DataJson).ToList());

        long? LatestSubmittedCheckin(Guid userId)
        {
            if (!subsByClient.TryGetValue(userId, out var jsons)) return null;
            long? best = null;
            foreach (var json in jsons)
            {
                try
                {
                    var doc = JsonDocument.Parse(json);
                    if (doc.RootElement.TryGetProperty("submittedAtMs", out var el)
                        && el.ValueKind == JsonValueKind.Number)
                    {
                        var v = el.GetInt64();
                        if (best is null || v > best) best = v;
                    }
                }
                catch { /* skip unparseable */ }
            }
            return best;
        }

        var roster = rels.Select(r =>
        {
            sessionAgg.TryGetValue(r.ClientId, out var s);
            return new
            {
                relationshipId = r.Id,
                client = r.Client.ToProfileDto(false),
                lastSessionAtMs = s?.Last,
                sessions7d = s?.C7 ?? 0,
                sessions28d = s?.C28 ?? 0,
                programCount = programCounts.GetValueOrDefault(r.ClientId, 0),
                checkinScheduleCount = scheduleCounts.GetValueOrDefault(r.ClientId, 0),
                lastCheckinSubmittedAtMs = LatestSubmittedCheckin(r.ClientId),
                unreadFromClient = unread.GetValueOrDefault(r.ClientId, 0),
            };
        });

        return Results.Ok(new { roster });
    }

    private static async Task<IResult> GetCoaches(ClaimsPrincipal caller, AppDbContext db)
    {
        var clientId = caller.GetUserId();
        var relationships = await db.CoachClientRelationships
            .Include(r => r.Coach)
            .Where(r => r.ClientId == clientId && r.Status == CoachClientStatus.Active)
            .OrderBy(r => r.Coach.Username)
            .ToListAsync();

        return Results.Ok(relationships.Select(r => new
        {
            relationshipId = r.Id,
            coach = r.Coach.ToProfileDto(false),
        }));
    }

    private static async Task<IResult> GetReceivedInvites(ClaimsPrincipal caller, AppDbContext db)
    {
        var clientId = caller.GetUserId();
        var relationships = await db.CoachClientRelationships
            .Include(r => r.Coach)
            .Where(r => r.ClientId == clientId && r.Status == CoachClientStatus.Pending)
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync();

        return Results.Ok(relationships.Select(r => new
        {
            relationshipId = r.Id,
            coach = r.Coach.ToProfileDto(false),
            createdAt = r.CreatedAt,
        }));
    }

    private static async Task<IResult> GetSentInvites(ClaimsPrincipal caller, AppDbContext db)
    {
        var coachId = caller.GetUserId();
        var relationships = await db.CoachClientRelationships
            .Include(r => r.Client)
            .Where(r => r.CoachId == coachId && r.Status == CoachClientStatus.Pending)
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync();

        return Results.Ok(relationships.Select(r => new
        {
            relationshipId = r.Id,
            client = r.Client.ToProfileDto(false),
            createdAt = r.CreatedAt,
        }));
    }

    private static async Task<IResult> AcceptInvite(Guid relationshipId, ClaimsPrincipal caller, AppDbContext db)
    {
        var clientId = caller.GetUserId();
        var relationship = await db.CoachClientRelationships.FirstOrDefaultAsync(r =>
            r.Id == relationshipId && r.ClientId == clientId && r.Status == CoachClientStatus.Pending);
        // Not found also covers "exists but caller isn't the client" — don't leak existence
        // of other people's pending invites to non-participants.
        if (relationship is null) return Results.NotFound();

        relationship.Status = CoachClientStatus.Active;
        relationship.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return Results.NoContent();
    }

    private static async Task<IResult> DeclineInvite(Guid relationshipId, ClaimsPrincipal caller, AppDbContext db)
    {
        var clientId = caller.GetUserId();
        var relationship = await db.CoachClientRelationships.FirstOrDefaultAsync(r =>
            r.Id == relationshipId && r.ClientId == clientId && r.Status == CoachClientStatus.Pending);
        if (relationship is null) return Results.NotFound();

        db.CoachClientRelationships.Remove(relationship);
        await db.SaveChangesAsync();

        return Results.NoContent();
    }

    private static async Task<IResult> RevokeRelationship(Guid relationshipId, ClaimsPrincipal caller, AppDbContext db)
    {
        var userId = caller.GetUserId();
        var relationship = await db.CoachClientRelationships.FirstOrDefaultAsync(r =>
            r.Id == relationshipId &&
            (r.CoachId == userId || r.ClientId == userId) &&
            r.Status == CoachClientStatus.Active);
        if (relationship is null) return Results.NotFound();

        relationship.Status = CoachClientStatus.Revoked;
        relationship.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return Results.NoContent();
    }

    // ── Programs ──────────────────────────────────────────────────────────────

    /// Upsert a coach-authored program keyed on (caller, programId). Last-write-wins by
    /// UpdatedAtMs. A coach can only ever touch their own rows — programId collisions across
    /// coaches produce separate rows. If RecipientUsername is given, the caller must have an
    /// Active relationship with that user (the program is then assigned to them); otherwise
    /// the program is an unassigned template.
    private static async Task<IResult> UpsertProgram(
        [FromBody] UpsertProgramRequest req,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var coachId = caller.GetUserId();

        if (string.IsNullOrWhiteSpace(req.ProgramId))
            return Results.BadRequest(new { error = "programId is required." });

        Guid? recipientUserId = null;
        Guid? relationshipId = null;

        if (!string.IsNullOrWhiteSpace(req.RecipientUsername))
        {
            var recipient = await db.Users
                .FirstOrDefaultAsync(u => u.Username == req.RecipientUsername.ToLowerInvariant());
            if (recipient is null) return Results.NotFound(new { error = "Client not found." });

            var relationship = await db.CoachClientRelationships.FirstOrDefaultAsync(r =>
                r.CoachId == coachId && r.ClientId == recipient.Id && r.Status == CoachClientStatus.Active);
            if (relationship is null)
                return Results.Json(
                    new { error = "No active coaching relationship with that client." },
                    statusCode: StatusCodes.Status403Forbidden);

            recipientUserId = recipient.Id;
            relationshipId = relationship.Id;
        }

        var stored = await db.CoachPrograms
            .FirstOrDefaultAsync(p => p.CoachId == coachId && p.ProgramId == req.ProgramId);

        if (stored is null)
        {
            stored = new CoachProgram
            {
                ProgramId = req.ProgramId,
                CoachId = coachId,
                RecipientUserId = recipientUserId,
                RelationshipId = relationshipId,
                UpdatedAtMs = req.UpdatedAtMs,
                DataJson = req.DeletedAtMs.HasValue ? string.Empty : req.DataJson,
                DeletedAtMs = req.DeletedAtMs,
            };
            db.CoachPrograms.Add(stored);
            await db.SaveChangesAsync();
            return Results.Ok(new { id = stored.Id, programId = stored.ProgramId, updatedAtMs = stored.UpdatedAtMs });
        }

        // Ignore stale writes outright (a slow retry after a newer edit already landed).
        if (req.UpdatedAtMs <= stored.UpdatedAtMs)
            return Results.Ok(new { id = stored.Id, programId = stored.ProgramId, updatedAtMs = stored.UpdatedAtMs });

        stored.UpdatedAtMs = req.UpdatedAtMs;
        stored.DeletedAtMs = req.DeletedAtMs;
        stored.DataJson = req.DeletedAtMs.HasValue ? string.Empty : req.DataJson;
        stored.SyncedAt = DateTime.UtcNow;
        // Only (re)assign when the caller names a recipient — an omitted recipient on an edit
        // leaves the existing assignment untouched.
        if (recipientUserId.HasValue)
        {
            stored.RecipientUserId = recipientUserId;
            stored.RelationshipId = relationshipId;
        }

        await db.SaveChangesAsync();
        return Results.Ok(new { id = stored.Id, programId = stored.ProgramId, updatedAtMs = stored.UpdatedAtMs });
    }

    private static async Task<IResult> GetMyPrograms(
        [FromQuery] Guid? recipientId,
        [FromQuery] bool? templates,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var coachId = caller.GetUserId();

        var query = db.CoachPrograms.AsNoTracking().Where(p => p.CoachId == coachId);
        if (templates == true) query = query.Where(p => p.RecipientUserId == null);
        else if (recipientId is not null) query = query.Where(p => p.RecipientUserId == recipientId);

        var programs = await query
            .OrderByDescending(p => p.UpdatedAtMs)
            .Select(p => new ProgramDto(
                p.ProgramId,
                p.UpdatedAtMs,
                p.DeletedAtMs == null ? p.DataJson : null,
                p.DeletedAtMs,
                p.RecipientUserId))
            .ToListAsync();

        return Results.Ok(new { programs });
    }

    /// Client-side incremental pull of programs assigned to the caller. Gated on a still-Active
    /// relationship, so a revoked client stops receiving updates (their local copy is retained
    /// client-side). Tombstones (DeletedAtMs set) are delivered so the client can drop the copy.
    private static async Task<IResult> GetAssignedPrograms(
        [FromQuery] long since,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var userId = caller.GetUserId();
        var sinceUtc = DateTimeOffset.FromUnixTimeMilliseconds(since).UtcDateTime;

        var programs = await db.CoachPrograms
            .AsNoTracking()
            .Where(p => p.RecipientUserId == userId && p.SyncedAt > sinceUtc)
            .Where(p => db.CoachClientRelationships.Any(r =>
                r.CoachId == p.CoachId && r.ClientId == userId && r.Status == CoachClientStatus.Active))
            .OrderBy(p => p.SyncedAt)
            .Select(p => new AssignedProgramDto(
                p.ProgramId,
                p.UpdatedAtMs,
                p.DeletedAtMs == null ? p.DataJson : null,
                p.DeletedAtMs))
            .ToListAsync();

        return Results.Ok(new { programs });
    }

    // ── Check-in schedules ────────────────────────────────────────────────────
    // Structurally identical to programs; kept as parallel handlers to match the
    // per-entity style used throughout SyncEndpoints rather than a shared abstraction.

    private static async Task<IResult> UpsertCheckinSchedule(
        [FromBody] UpsertCheckinScheduleRequest req,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var coachId = caller.GetUserId();
        if (string.IsNullOrWhiteSpace(req.ScheduleId))
            return Results.BadRequest(new { error = "scheduleId is required." });

        Guid? recipientUserId = null;
        Guid? relationshipId = null;

        if (!string.IsNullOrWhiteSpace(req.RecipientUsername))
        {
            var recipient = await db.Users
                .FirstOrDefaultAsync(u => u.Username == req.RecipientUsername.ToLowerInvariant());
            if (recipient is null) return Results.NotFound(new { error = "Client not found." });

            var relationship = await db.CoachClientRelationships.FirstOrDefaultAsync(r =>
                r.CoachId == coachId && r.ClientId == recipient.Id && r.Status == CoachClientStatus.Active);
            if (relationship is null)
                return Results.Json(
                    new { error = "No active coaching relationship with that client." },
                    statusCode: StatusCodes.Status403Forbidden);

            recipientUserId = recipient.Id;
            relationshipId = relationship.Id;
        }

        var stored = await db.CheckinSchedules
            .FirstOrDefaultAsync(s => s.CoachId == coachId && s.ScheduleId == req.ScheduleId);

        if (stored is null)
        {
            stored = new CheckinSchedule
            {
                ScheduleId = req.ScheduleId,
                CoachId = coachId,
                RecipientUserId = recipientUserId,
                RelationshipId = relationshipId,
                UpdatedAtMs = req.UpdatedAtMs,
                DataJson = req.DeletedAtMs.HasValue ? string.Empty : req.DataJson,
                DeletedAtMs = req.DeletedAtMs,
            };
            db.CheckinSchedules.Add(stored);
            await db.SaveChangesAsync();
            return Results.Ok(new { id = stored.Id, scheduleId = stored.ScheduleId, updatedAtMs = stored.UpdatedAtMs });
        }

        if (req.UpdatedAtMs <= stored.UpdatedAtMs)
            return Results.Ok(new { id = stored.Id, scheduleId = stored.ScheduleId, updatedAtMs = stored.UpdatedAtMs });

        stored.UpdatedAtMs = req.UpdatedAtMs;
        stored.DeletedAtMs = req.DeletedAtMs;
        stored.DataJson = req.DeletedAtMs.HasValue ? string.Empty : req.DataJson;
        stored.SyncedAt = DateTime.UtcNow;
        if (recipientUserId.HasValue)
        {
            stored.RecipientUserId = recipientUserId;
            stored.RelationshipId = relationshipId;
        }

        await db.SaveChangesAsync();
        return Results.Ok(new { id = stored.Id, scheduleId = stored.ScheduleId, updatedAtMs = stored.UpdatedAtMs });
    }

    private static async Task<IResult> GetMyCheckinSchedules(
        [FromQuery] Guid? recipientId,
        [FromQuery] bool? templates,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var coachId = caller.GetUserId();
        var query = db.CheckinSchedules.AsNoTracking().Where(s => s.CoachId == coachId);
        if (templates == true) query = query.Where(s => s.RecipientUserId == null);
        else if (recipientId is not null) query = query.Where(s => s.RecipientUserId == recipientId);

        var schedules = await query
            .OrderByDescending(s => s.UpdatedAtMs)
            .Select(s => new ScheduleDto(
                s.ScheduleId,
                s.UpdatedAtMs,
                s.DeletedAtMs == null ? s.DataJson : null,
                s.DeletedAtMs,
                s.RecipientUserId))
            .ToListAsync();

        return Results.Ok(new { schedules });
    }

    private static async Task<IResult> GetAssignedCheckinSchedules(
        [FromQuery] long since,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var userId = caller.GetUserId();
        var sinceUtc = DateTimeOffset.FromUnixTimeMilliseconds(since).UtcDateTime;

        var schedules = await db.CheckinSchedules
            .AsNoTracking()
            .Where(s => s.RecipientUserId == userId && s.SyncedAt > sinceUtc)
            .Where(s => db.CoachClientRelationships.Any(r =>
                r.CoachId == s.CoachId && r.ClientId == userId && r.Status == CoachClientStatus.Active))
            .OrderBy(s => s.SyncedAt)
            .Select(s => new AssignedScheduleDto(
                s.ScheduleId,
                s.UpdatedAtMs,
                s.DeletedAtMs == null ? s.DataJson : null,
                s.DeletedAtMs))
            .ToListAsync();

        return Results.Ok(new { schedules });
    }

    // ── Messaging ─────────────────────────────────────────────────────────────

    /// The Active relationship the caller participates in, or null (not found / not a
    /// participant / not Active — all indistinguishable to the caller).
    private static Task<CoachClientRelationship?> ParticipantRelationship(
        Guid callerId, Guid relationshipId, AppDbContext db) =>
        db.CoachClientRelationships.FirstOrDefaultAsync(r =>
            r.Id == relationshipId &&
            r.Status == CoachClientStatus.Active &&
            (r.CoachId == callerId || r.ClientId == callerId));

    private static async Task<IResult> SendMessage(
        [FromBody] SendMessageRequest req,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var callerId = caller.GetUserId();
        if (string.IsNullOrWhiteSpace(req.MessageId))
            return Results.BadRequest(new { error = "messageId is required." });
        var body = (req.Body ?? string.Empty).Trim();
        if (body.Length == 0) return Results.BadRequest(new { error = "Message body is empty." });
        if (body.Length > 5000) return Results.BadRequest(new { error = "Message too long." });

        var relationship = await ParticipantRelationship(callerId, req.RelationshipId, db);
        if (relationship is null) return Results.NotFound();

        var exists = await db.CoachMessages.AnyAsync(m =>
            m.SenderUserId == callerId && m.MessageId == req.MessageId);
        if (exists)
            return Results.Ok(new { messageId = req.MessageId, duplicate = true });

        var message = new CoachMessage
        {
            MessageId = req.MessageId,
            RelationshipId = relationship.Id,
            SenderUserId = callerId,
            Body = body,
            CreatedAtMs = req.CreatedAtMs,
        };
        db.CoachMessages.Add(message);
        await db.SaveChangesAsync();

        return Results.Ok(new { id = message.Id, messageId = message.MessageId });
    }

    private static async Task<IResult> GetMessages(
        [FromQuery] Guid relationshipId,
        [FromQuery] long since,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var callerId = caller.GetUserId();
        var relationship = await ParticipantRelationship(callerId, relationshipId, db);
        if (relationship is null) return Results.NotFound();

        var sinceUtc = DateTimeOffset.FromUnixTimeMilliseconds(since).UtcDateTime;
        var messages = await db.CoachMessages
            .AsNoTracking()
            .Where(m => m.RelationshipId == relationshipId && m.SyncedAt > sinceUtc)
            .OrderBy(m => m.SyncedAt)
            .Select(m => new MessageDto(
                m.MessageId, m.Body, m.CreatedAtMs, m.ReadAtMs, m.SenderUserId == callerId))
            .ToListAsync();

        return Results.Ok(new { messages });
    }

    /// Every message across all the caller's Active relationships, incremental — the
    /// client-app sync loop pulls this in one request instead of one per thread.
    private static async Task<IResult> GetAllMessages(
        [FromQuery] long since,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var callerId = caller.GetUserId();
        var sinceUtc = DateTimeOffset.FromUnixTimeMilliseconds(since).UtcDateTime;

        var messages = await db.CoachMessages
            .AsNoTracking()
            .Where(m => m.SyncedAt > sinceUtc
                && (m.Relationship.CoachId == callerId || m.Relationship.ClientId == callerId)
                && m.Relationship.Status == CoachClientStatus.Active)
            .OrderBy(m => m.SyncedAt)
            .Select(m => new ThreadMessageDto(
                m.RelationshipId, m.MessageId, m.Body, m.CreatedAtMs, m.ReadAtMs, m.SenderUserId == callerId))
            .ToListAsync();

        return Results.Ok(new { messages });
    }

    private static async Task<IResult> MarkMessagesRead(
        [FromBody] MarkReadRequest req,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var callerId = caller.GetUserId();
        var relationship = await ParticipantRelationship(callerId, req.RelationshipId, db);
        if (relationship is null) return Results.NotFound();

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var unread = await db.CoachMessages
            .Where(m => m.RelationshipId == req.RelationshipId
                && m.SenderUserId != callerId
                && m.ReadAtMs == null
                && m.CreatedAtMs <= req.UpToMs)
            .ToListAsync();
        foreach (var m in unread)
        {
            m.ReadAtMs = now;
            m.SyncedAt = DateTime.UtcNow;
        }
        await db.SaveChangesAsync();

        return Results.Ok(new { marked = unread.Count });
    }

    private static async Task<IResult> GetUnreadCounts(ClaimsPrincipal caller, AppDbContext db)
    {
        var callerId = caller.GetUserId();
        var counts = await db.CoachMessages
            .AsNoTracking()
            .Where(m => m.SenderUserId != callerId
                && m.ReadAtMs == null
                && (m.Relationship.CoachId == callerId || m.Relationship.ClientId == callerId)
                && m.Relationship.Status == CoachClientStatus.Active)
            .GroupBy(m => m.RelationshipId)
            .Select(g => new { relationshipId = g.Key, unread = g.Count() })
            .ToListAsync();

        return Results.Ok(new { counts });
    }
}

public record SendMessageRequest(Guid RelationshipId, string MessageId, string? Body, long CreatedAtMs);
public record MarkReadRequest(Guid RelationshipId, long UpToMs);
public record MessageDto(string MessageId, string Body, long CreatedAtMs, long? ReadAtMs, bool Mine);
public record ThreadMessageDto(Guid RelationshipId, string MessageId, string Body, long CreatedAtMs, long? ReadAtMs, bool Mine);

public record UpsertProgramRequest(
    string ProgramId,
    string DataJson,
    long UpdatedAtMs,
    string? RecipientUsername = null,
    long? DeletedAtMs = null);

public record UpsertCheckinScheduleRequest(
    string ScheduleId,
    string DataJson,
    long UpdatedAtMs,
    string? RecipientUsername = null,
    long? DeletedAtMs = null);

public record ScheduleDto(
    string ScheduleId,
    long UpdatedAtMs,
    string? DataJson,
    long? DeletedAtMs,
    Guid? RecipientUserId);

public record AssignedScheduleDto(
    string ScheduleId,
    long UpdatedAtMs,
    string? DataJson,
    long? DeletedAtMs);

public record ProgramDto(
    string ProgramId,
    long UpdatedAtMs,
    string? DataJson,
    long? DeletedAtMs,
    Guid? RecipientUserId);

public record AssignedProgramDto(
    string ProgramId,
    long UpdatedAtMs,
    string? DataJson,
    long? DeletedAtMs);
