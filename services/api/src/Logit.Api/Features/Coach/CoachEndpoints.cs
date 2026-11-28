using System.Security.Claims;
using System.Text.Json;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Logit.Api.Features.Coach.Payments;

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
        group.MapGet("/roster", GetRoster).RequireCoaching();
        group.MapGet("/invites/received", GetReceivedInvites);
        group.MapGet("/invites/sent", GetSentInvites);
        group.MapPost("/invites/{relationshipId:guid}/accept", AcceptInvite);
        group.MapPost("/invites/{relationshipId:guid}/decline", DeclineInvite);
        group.MapDelete("/relationships/{relationshipId:guid}", RevokeRelationship);

        // Coach-authored programs. Writes are Studio-only; the assigned-pull is open to any
        // tier (a Free client can be coached). See CoachProgram entity for the isolation note.
        group.MapPost("/programs", UpsertProgram).RequireCoaching();
        group.MapGet("/programs", GetMyPrograms).RequireCoaching();
        group.MapGet("/programs/assigned", GetAssignedPrograms);
        group.MapPost("/programs/assigned/{programId}/start", StartAssignedProgram);

        // Coach-assigned nutrition targets — same shape/rules as programs.
        group.MapPost("/nutrition-plans", UpsertNutritionPlan).RequireCoaching();
        group.MapGet("/nutrition-plans", GetMyNutritionPlans).RequireCoaching();
        group.MapGet("/nutrition-plans/assigned", GetAssignedNutritionPlans);

        // Coach check-in schedules — same shape/rules as programs. Client answers come back
        // as SyncedCheckinSubmission rows via /sync/checkins (see SyncEndpoints).
        group.MapPost("/checkins", UpsertCheckinSchedule).RequireCoaching();
        group.MapGet("/checkins", GetMyCheckinSchedules).RequireCoaching();
        group.MapGet("/checkins/assigned", GetAssignedCheckinSchedules);

        // Coach-assigned habits — same shape/rules. The client checks them off as ordinary
        // HabitEntry rows (coach-readable via ?clientId= on /sync/habit-entries).
        group.MapPost("/habits", UpsertCoachHabit).RequireCoaching();
        group.MapGet("/habits", GetMyCoachHabits).RequireCoaching();
        group.MapGet("/habits/assigned", GetAssignedCoachHabits);

        // Coach↔client messaging — bidirectional within an Active relationship, open to any
        // tier (a Free client can reply to their coach). Append-only.
        group.MapPost("/messages", SendMessage);
        group.MapGet("/messages", GetMessages);
        group.MapGet("/messages/all", GetAllMessages);
        group.MapPost("/messages/read", MarkMessagesRead);
        group.MapPut("/messages/reaction", ReactToMessage);
        group.MapGet("/messages/unread", GetUnreadCounts);

        CoachLinkEndpoints.Map(group);
        CheckinReviewEndpoints.Map(group);
        CoachLibraryEndpoints.Map(group);
        SwapRuleEndpoints.Map(group);
        InsightChartEndpoints.Map(group);
        CoachPaymentEndpoints.Map(group);
        CoachPaymentEndpoints.MapWebhook(app);
    }

    /// Offer: invite with an offer they take on the take page (canvas K13: a package or no
    /// payment through LogIt). Older apps send no body: a plain invite they accept.
    public record InviteBody(bool Offer = false, Guid? PackageId = null, string? Message = null);

    private static async Task<IResult> Invite(string username, [FromBody] InviteBody? body, ClaimsPrincipal caller, AppDbContext db, IConfiguration config)
    {
        var coachId = caller.GetUserId();
        var coach = await db.Users.FindAsync(coachId);
        if (coach is null) return Results.NotFound();

        if (!CoachingAccess.CanCoach(coach, config))
            return Results.Json(
                new { error = "Only Studio-tier accounts can invite clients." },
                statusCode: StatusCodes.Status403Forbidden);

        // Sandbox sample clients are only ever coached by their own coach, set up by the sandbox.
        var client = await db.Users.FirstOrDefaultAsync(u => u.Username == username.ToLowerInvariant() && !u.IsSample);
        if (client is null) return Results.NotFound();
        if (client.Id == coachId) return Results.BadRequest(new { error = "Cannot invite yourself." });

        // (CoachId, ClientId) is unique, so there is at most one row per pair whatever its
        // status. A Revoked row is reopened rather than duplicated: inserting a second row
        // used to hit the unique index and 500, so a revoked client could never be re-invited.
        var relationship = await db.CoachClientRelationships.FirstOrDefaultAsync(r =>
            r.CoachId == coachId && r.ClientId == client.Id);
        // They already asked through one of this coach's links: inviting them is a yes.
        if (relationship is { Status: CoachClientStatus.Pending, RequestedByClient: true })
        {
            relationship.Status = CoachClientStatus.Active;
            relationship.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(new { relationshipId = relationship.Id, accepted = true });
        }
        if (relationship is not null && relationship.Status != CoachClientStatus.Revoked)
            return Results.Conflict(new { error = "Already invited or connected." });

        if (relationship is null)
        {
            relationship = new CoachClientRelationship
            {
                CoachId = coachId,
                ClientId = client.Id,
                Status = CoachClientStatus.Pending,
            };
            db.CoachClientRelationships.Add(relationship);
        }
        else
        {
            relationship.Status = CoachClientStatus.Pending;
            relationship.RequestedByClient = false;
            relationship.InviteLinkId = null;
            relationship.ApplySharing(SharingDto.All);
            relationship.UpdatedAt = DateTime.UtcNow;
        }
        CoachOffer? offer = null;
        if (body?.Offer == true)
        {
            CoachPackage? package = null;
            if (body.PackageId is { } pid)
            {
                package = await db.CoachPackages.FirstOrDefaultAsync(k => k.Id == pid && k.CoachId == coachId && !k.Hidden);
                if (package is null) return Results.BadRequest(new { error = "That package isn't available." });
                if (!await db.CoachPaymentAccounts.AnyAsync(a => a.CoachId == coachId && a.CardPaymentsActive && !a.PaymentsStopped))
                    return Results.BadRequest(new { error = "Paid packages need payments set up first.", code = "payments_not_ready" });
            }
            if (body.Message?.Length > CoachIntake.MaxMessage) return Results.BadRequest(new { error = "That message is too long." });
            var now = DateTime.UtcNow;
            // An invite is someone you know: the offer holds for two weeks.
            offer = new CoachOffer
            {
                Relationship = relationship,
                PackageId = package?.Id,
                PackageName = package?.Name ?? "Coaching",
                PackageDescription = package?.Description ?? "",
                AmountCents = package?.AmountCents ?? 0,
                Currency = package?.Currency ?? "eur",
                Interval = package?.Interval ?? PaymentIntervals.Once,
                Weeks = package?.Weeks,
                HoldUntil = now.AddDays(14),
                CreatedAt = now,
            };
            db.CoachOffers.Add(offer);
        }
        // Otherwise nothing tells them: the invite only shows on their Coaching page.
        db.Notifications.Add(new Notification { UserId = client.Id, ActorId = coachId, Type = NotificationType.CoachInvite });
        await db.SaveChangesAsync();
        if (offer is not null)
        {
            CoachIntake.Post(db, relationship, coachId, CoachIntake.Events.Offer,
                $"{CoachIntake.NameOf(coach)} invited you to be coached: {offer.PackageName}, {CoachIntake.PriceText(offer)}.",
                CoachIntake.CardOf(offer), body!.Message, DateTime.UtcNow);
            await db.SaveChangesAsync();
        }

        return Results.Created($"/coach/invites/{relationship.Id}", new { relationshipId = relationship.Id, offerId = offer?.Id });
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
            sharing = r.ToSharingDto(),
            since = r.UpdatedAt,
            // This client's own rule; null = the coach's default.
            swapRule = r.SwapRule,
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
        // Workout and check-in figures only for clients who share them (see CoachAccess).
        var workoutIds = rels.Where(r => r.ShareWorkouts).Select(r => r.ClientId).ToList();
        var checkinIds = rels.Where(r => r.ShareCheckins).Select(r => r.ClientId).ToList();

        var sessionAgg = (await db.SyncedWorkoutSessions
            .Where(s => workoutIds.Contains(s.UserId) && s.DeletedAtMs == null
                // Not workouts from before coaching the client keeps to themselves (canvas SP3).
                && !db.CoachClientRelationships.Any(r => r.CoachId == coachId && r.ClientId == s.UserId && r.Status == CoachClientStatus.Active
                    && r.WorkoutsSinceMs != null && s.StartedAtMs < r.WorkoutsSinceMs))
            .GroupBy(s => s.UserId)
            .Select(g => new
            {
                UserId = g.Key,
                Last = g.Max(x => (long?)x.StartedAtMs),
                C7 = g.Count(x => x.StartedAtMs >= d7),
                C28 = g.Count(x => x.StartedAtMs >= d28),
            })
            .ToListAsync()).ToDictionary(x => x.UserId);

        // Canvas W1: on how many of the last 7 days each client logged any food (nutrition sharers only).
        var nutritionIds = rels.Where(r => r.ShareNutrition).Select(r => r.ClientId).ToList();
        var fromDay = "nday_" + DateTime.UtcNow.Date.AddDays(-6).ToString("yyyy-MM-dd");
        var foodDays = (await db.SyncedNutritionDays
            .Where(d => nutritionIds.Contains(d.UserId) && d.DeletedAtMs == null && string.Compare(d.ClientId, fromDay) >= 0)
            .Select(d => new { d.UserId, d.DataJson })
            .ToListAsync())
            .Where(d => d.DataJson.Contains("\"items\":[{"))
            .GroupBy(d => d.UserId)
            .ToDictionary(g => g.Key, g => g.Count());

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

        var habitCounts = (await db.CoachHabits
            .Where(h => h.CoachId == coachId && h.DeletedAtMs == null && h.RecipientUserId != null
                && clientIds.Contains(h.RecipientUserId.Value))
            .GroupBy(h => h.RecipientUserId!.Value)
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
            .Where(s => checkinIds.Contains(s.UserId) && s.DeletedAtMs == null)
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

        // How long each client has waited for a reply (canvas Z2: Today shows it from day 5).
        var relIds = rels.Select(r => r.Id).ToList();
        var lastCoachMs = (await db.CoachMessages.Where(m => relIds.Contains(m.RelationshipId) && m.SenderUserId == coachId)
            .GroupBy(m => m.RelationshipId).Select(g => new { g.Key, Ms = g.Max(m => m.CreatedAtMs) }).ToListAsync())
            .ToDictionary(x => x.Key, x => x.Ms);
        var clientMsgs = await db.CoachMessages.Where(m => relIds.Contains(m.RelationshipId) && m.SenderUserId != coachId && m.Kind == null)
            .Select(m => new { m.RelationshipId, m.CreatedAtMs }).ToListAsync();
        // Canvas Q8: a client changed an exercise for the rest of the program, and the coach hasn't
        // read it or answered it (Keep it / Put back send a "program-swap" message).
        var swapMsgs = await db.CoachMessages.Where(m => relIds.Contains(m.RelationshipId)
                && ((m.SenderUserId != coachId && m.Kind == "lasting-swap" && m.ReadAtMs == null) || (m.SenderUserId == coachId && m.Kind == "program-swap")))
            .Select(m => new { m.RelationshipId, m.Kind, m.CreatedAtMs }).ToListAsync();
        var lastingSwaps = swapMsgs.Where(m => m.Kind == "lasting-swap"
                && !swapMsgs.Any(c => c.RelationshipId == m.RelationshipId && c.Kind == "program-swap" && c.CreatedAtMs >= m.CreatedAtMs))
            .Select(m => m.RelationshipId).ToHashSet();
        long? WaitingSince(Guid relId)
        {
            var after = lastCoachMs.GetValueOrDefault(relId, 0);
            var first = clientMsgs.Where(m => m.RelationshipId == relId && m.CreatedAtMs > after).Select(m => (long?)m.CreatedAtMs).Min();
            return first;
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
                foodDays7d = r.ShareNutrition ? foodDays.GetValueOrDefault(r.ClientId, 0) : (int?)null,
                programCount = programCounts.GetValueOrDefault(r.ClientId, 0),
                checkinScheduleCount = scheduleCounts.GetValueOrDefault(r.ClientId, 0),
                assignedHabitCount = habitCounts.GetValueOrDefault(r.ClientId, 0),
                lastCheckinSubmittedAtMs = LatestSubmittedCheckin(r.ClientId),
                unreadFromClient = unread.GetValueOrDefault(r.ClientId, 0),
                sharing = r.ToSharingDto(),
                since = r.UpdatedAt,
                waitingSinceMs = WaitingSince(r.Id),
                lastingSwap = lastingSwaps.Contains(r.Id),
                pluginConsent = CoachPluginConsent.Read(r.PluginConsentJson),
                pausedUntil = r.PausedUntil,
                endsAt = r.EndsAt,
                // Canvas K3: their answers when they asked to be coached.
                answers = CoachIntake.AnswersOf(r),
            };
        });

        return Results.Ok(new { roster });
    }

    private static async Task<IResult> GetCoaches(ClaimsPrincipal caller, AppDbContext db)
    {
        var clientId = caller.GetUserId();
        // Paused coaching (not paid up) is listed too, so My coach can say why it stopped.
        var relationships = await db.CoachClientRelationships
            .Include(r => r.Coach)
            .Include(r => r.Payment)
            .Where(r => r.ClientId == clientId
                && (r.Status == CoachClientStatus.Active || r.Status == CoachClientStatus.Paused))
            .OrderBy(r => r.Coach.Username)
            .ToListAsync();
        var coachIds = relationships.Select(r => r.CoachId).ToList();
        var accounts = await db.CoachPaymentAccounts.AsNoTracking()
            .Where(a => coachIds.Contains(a.CoachId)).ToDictionaryAsync(a => a.CoachId);

        return Results.Ok(relationships.Select(r => new
        {
            relationshipId = r.Id,
            coach = r.Coach.ToProfileDto(false),
            sharing = r.ToSharingDto(),
            since = r.UpdatedAt,
            // The swap rule that applies to me in this coach's programs.
            swapRule = SwapRules.Effective(r, r.Coach),
            foodSwapRule = r.Coach.CoachFoodSwapRule ?? FoodSwapRules.Mine,
            pluginConsent = CoachPluginConsent.Read(r.PluginConsentJson),
            status = r.Status == CoachClientStatus.Paused ? "paused" : "active",
            payment = CoachPaymentEndpoints.ClientPaymentDto(r.Payment, accounts.GetValueOrDefault(r.CoachId)),
            // Canvas Z7: pinned in the conversation while the coach is away.
            away = CoachAway.Dto(r.Coach, DateTime.UtcNow),
        }));
    }

    private static async Task<IResult> GetReceivedInvites(ClaimsPrincipal caller, AppDbContext db)
    {
        var clientId = caller.GetUserId();
        var relationships = await db.CoachClientRelationships
            .Include(r => r.Coach)
            .Where(r => r.ClientId == clientId && r.Status == CoachClientStatus.Pending && !r.RequestedByClient)
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync();

        var ids = relationships.Select(r => r.Id).ToList();
        var offers = (await db.CoachOffers.AsNoTracking().Where(o => ids.Contains(o.RelationshipId)).ToListAsync())
            .GroupBy(o => o.RelationshipId).ToDictionary(g => g.Key, g => g.OrderByDescending(o => o.CreatedAt).First());
        var now = DateTime.UtcNow;
        return Results.Ok(relationships.Select(r => new
        {
            relationshipId = r.Id,
            coach = r.Coach.ToProfileDto(false),
            createdAt = r.CreatedAt,
            // Canvas K13: take it on the take page (agreement, sharing, paying).
            offer = offers.TryGetValue(r.Id, out var o) ? new { card = CoachIntake.CardOf(o), state = CoachIntake.StateOf(o, now) } : null,
        }));
    }

    private static async Task<IResult> GetSentInvites(ClaimsPrincipal caller, AppDbContext db)
    {
        var coachId = caller.GetUserId();
        var relationships = await db.CoachClientRelationships
            .Include(r => r.Client)
            .Where(r => r.CoachId == coachId && r.Status == CoachClientStatus.Pending && !r.RequestedByClient)
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync();

        return Results.Ok(relationships.Select(r => new
        {
            relationshipId = r.Id,
            client = r.Client.ToProfileDto(false),
            createdAt = r.CreatedAt,
        }));
    }

    private static async Task<IResult> AcceptInvite(
        Guid relationshipId, [FromBody] AcceptInviteRequest? req, ClaimsPrincipal caller, AppDbContext db)
    {
        var clientId = caller.GetUserId();
        var relationship = await db.CoachClientRelationships.FirstOrDefaultAsync(r =>
            r.Id == relationshipId && r.ClientId == clientId && r.Status == CoachClientStatus.Pending
            && !r.RequestedByClient);
        // Not found also covers "exists but caller isn't the client" — don't leak existence
        // of other people's pending invites to non-participants.
        if (relationship is null) return Results.NotFound();

        // Older apps send no body and so share everything, as before the switches existed.
        relationship.ApplySharing(req?.Sharing ?? SharingDto.All);
        relationship.Status = CoachClientStatus.Active;
        relationship.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return Results.NoContent();
    }

    private static async Task<IResult> DeclineInvite(Guid relationshipId, ClaimsPrincipal caller, AppDbContext db)
    {
        var clientId = caller.GetUserId();
        var relationship = await db.CoachClientRelationships.FirstOrDefaultAsync(r =>
            r.Id == relationshipId && r.ClientId == clientId && r.Status == CoachClientStatus.Pending
            && !r.RequestedByClient);
        if (relationship is null) return Results.NotFound();

        // Revoked, not deleted: a re-invited former client's row carries the old messages,
        // which cascade-delete with it. Revoked rows are invisible and get reopened later.
        relationship.Status = CoachClientStatus.Revoked;
        relationship.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return Results.NoContent();
    }

    private static async Task<IResult> RevokeRelationship(
        Guid relationshipId, ClaimsPrincipal caller, AppDbContext db, CoachingEnd coaching, CancellationToken ct)
    {
        var userId = caller.GetUserId();
        var relationship = await db.CoachClientRelationships.FirstOrDefaultAsync(r =>
            r.Id == relationshipId &&
            (r.CoachId == userId || r.ClientId == userId) &&
            (r.Status == CoachClientStatus.Active || r.Status == CoachClientStatus.Pending
                || r.Status == CoachClientStatus.Paused), ct);
        if (relationship is null) return Results.NotFound();

        // Ending a relationship, or withdrawing before it started, marks it Revoked rather than
        // deleting it: programs, check-ins and messages point at it (messages cascade-delete),
        // and a row can carry history from an earlier coaching spell. Revoked rows are
        // invisible everywhere and get reopened by a new invite or request.
        if (relationship.Status == CoachClientStatus.Pending)
        {
            // Whoever asked can withdraw: the coach an invite, the client a link request. The
            // other side declines instead.
            var asker = relationship.RequestedByClient ? relationship.ClientId : relationship.CoachId;
            if (asker != userId) return Results.NotFound();
        }

        // No more charges once coaching has ended, whoever ended it.
        var reason = relationship.CoachId == userId ? EndReason.CoachEnded : EndReason.ClientStopped;
        await coaching.EndAsync(relationship, reason, RefundRule.None, DateTime.UtcNow, ct);

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
            if (recipientUserId.HasValue && !req.DeletedAtMs.HasValue) NotifyProgram(db, coachId, recipientUserId.Value);
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
            // A new client starts the program afresh.
            if (stored.RecipientUserId != recipientUserId)
            {
                stored.StartedAtMs = null;
                if (!req.DeletedAtMs.HasValue) NotifyProgram(db, coachId, recipientUserId.Value);
            }
            stored.RecipientUserId = recipientUserId;
            stored.RelationshipId = relationshipId;
        }

        await db.SaveChangesAsync();
        return Results.Ok(new { id = stored.Id, programId = stored.ProgramId, updatedAtMs = stored.UpdatedAtMs });
    }

    /// A program reaches the client's phone on its next sync, but nothing else said it came.
    private static void NotifyProgram(AppDbContext db, Guid coachId, Guid clientId) =>
        db.Notifications.Add(new Notification { UserId = clientId, ActorId = coachId, Type = NotificationType.CoachProgram });

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
                p.RecipientUserId,
                p.StartedAtMs))
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
                p.DeletedAtMs,
                p.StartedAtMs,
                p.CoachId))
            .ToListAsync();

        return Results.Ok(new { programs });
    }

    /// Client: start an assigned program ("week 1, day 1" = the given start of day). The
    /// first start wins; starting again returns the existing date, so a retry from the offline
    /// queue or a second device can't move the program's weeks.
    private static async Task<IResult> StartAssignedProgram(
        string programId,
        [FromBody] StartProgramRequest req,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var userId = caller.GetUserId();
        var program = await db.CoachPrograms
            .Where(p => p.RecipientUserId == userId && p.ProgramId == programId && p.DeletedAtMs == null)
            .Where(p => db.CoachClientRelationships.Any(r =>
                r.CoachId == p.CoachId && r.ClientId == userId && r.Status == CoachClientStatus.Active))
            .FirstOrDefaultAsync();
        if (program is null) return Results.NotFound();

        if (program.StartedAtMs is null)
        {
            program.StartedAtMs = req.StartedAtMs;
            // Bump so the client's other devices pick the start up on their next pull.
            program.SyncedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }

        return Results.Ok(new { programId, startedAtMs = program.StartedAtMs });
    }

    // ── Nutrition plans ───────────────────────────────────────────────────────
    // Structurally identical to programs (near-copy, matching the per-entity style).

    private static async Task<IResult> UpsertNutritionPlan(
        [FromBody] UpsertNutritionPlanRequest req,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var coachId = caller.GetUserId();

        if (string.IsNullOrWhiteSpace(req.PlanId))
            return Results.BadRequest(new { error = "planId is required." });

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

        var stored = await db.CoachNutritionPlans
            .FirstOrDefaultAsync(p => p.CoachId == coachId && p.PlanId == req.PlanId);

        if (stored is null)
        {
            stored = new CoachNutritionPlan
            {
                PlanId = req.PlanId,
                CoachId = coachId,
                RecipientUserId = recipientUserId,
                RelationshipId = relationshipId,
                UpdatedAtMs = req.UpdatedAtMs,
                DataJson = req.DeletedAtMs.HasValue ? string.Empty : req.DataJson,
                DeletedAtMs = req.DeletedAtMs,
            };
            db.CoachNutritionPlans.Add(stored);
            // Canvas MP5: one notification when a plan is given ("Sam sent you a meal plan").
            if (recipientUserId.HasValue && !req.DeletedAtMs.HasValue)
                db.Notifications.Add(new Notification { UserId = recipientUserId.Value, ActorId = coachId, Type = NotificationType.CoachMealPlan });
            await db.SaveChangesAsync();
            return Results.Ok(new { id = stored.Id, planId = stored.PlanId, updatedAtMs = stored.UpdatedAtMs });
        }

        if (req.UpdatedAtMs <= stored.UpdatedAtMs)
            return Results.Ok(new { id = stored.Id, planId = stored.PlanId, updatedAtMs = stored.UpdatedAtMs });

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
        return Results.Ok(new { id = stored.Id, planId = stored.PlanId, updatedAtMs = stored.UpdatedAtMs });
    }

    private static async Task<IResult> GetMyNutritionPlans(
        [FromQuery] Guid? recipientId,
        [FromQuery] bool? templates,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var coachId = caller.GetUserId();

        var query = db.CoachNutritionPlans.AsNoTracking().Where(p => p.CoachId == coachId);
        if (templates == true) query = query.Where(p => p.RecipientUserId == null);
        else if (recipientId is not null) query = query.Where(p => p.RecipientUserId == recipientId);

        var plans = await query
            .OrderByDescending(p => p.UpdatedAtMs)
            .Select(p => new NutritionPlanDto(
                p.PlanId,
                p.UpdatedAtMs,
                p.DeletedAtMs == null ? p.DataJson : null,
                p.DeletedAtMs,
                p.RecipientUserId))
            .ToListAsync();

        return Results.Ok(new { plans });
    }

    private static async Task<IResult> GetAssignedNutritionPlans(
        [FromQuery] long since,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var userId = caller.GetUserId();
        var sinceUtc = DateTimeOffset.FromUnixTimeMilliseconds(since).UtcDateTime;

        var plans = await db.CoachNutritionPlans
            .AsNoTracking()
            .Where(p => p.RecipientUserId == userId && p.SyncedAt > sinceUtc)
            .Where(p => db.CoachClientRelationships.Any(r =>
                r.CoachId == p.CoachId && r.ClientId == userId && r.Status == CoachClientStatus.Active))
            .OrderBy(p => p.SyncedAt)
            .Select(p => new AssignedNutritionPlanDto(
                p.PlanId,
                p.UpdatedAtMs,
                p.DeletedAtMs == null ? p.DataJson : null,
                p.DeletedAtMs))
            .ToListAsync();

        return Results.Ok(new { plans });
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

    // ── Coach-assigned habits ─────────────────────────────────────────────────
    // Structurally identical to check-in schedules; parallel handlers to match the
    // per-entity style rather than a shared abstraction.

    private static async Task<IResult> UpsertCoachHabit(
        [FromBody] UpsertCoachHabitRequest req,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var coachId = caller.GetUserId();
        if (string.IsNullOrWhiteSpace(req.HabitId))
            return Results.BadRequest(new { error = "habitId is required." });

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

        var stored = await db.CoachHabits
            .FirstOrDefaultAsync(h => h.CoachId == coachId && h.HabitId == req.HabitId);

        if (stored is null)
        {
            stored = new CoachHabit
            {
                HabitId = req.HabitId,
                CoachId = coachId,
                RecipientUserId = recipientUserId,
                RelationshipId = relationshipId,
                UpdatedAtMs = req.UpdatedAtMs,
                DataJson = req.DeletedAtMs.HasValue ? string.Empty : req.DataJson,
                DeletedAtMs = req.DeletedAtMs,
            };
            db.CoachHabits.Add(stored);
            await db.SaveChangesAsync();
            return Results.Ok(new { id = stored.Id, habitId = stored.HabitId, updatedAtMs = stored.UpdatedAtMs });
        }

        if (req.UpdatedAtMs <= stored.UpdatedAtMs)
            return Results.Ok(new { id = stored.Id, habitId = stored.HabitId, updatedAtMs = stored.UpdatedAtMs });

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
        return Results.Ok(new { id = stored.Id, habitId = stored.HabitId, updatedAtMs = stored.UpdatedAtMs });
    }

    private static async Task<IResult> GetMyCoachHabits(
        [FromQuery] Guid? recipientId,
        [FromQuery] bool? templates,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var coachId = caller.GetUserId();
        var query = db.CoachHabits.AsNoTracking().Where(h => h.CoachId == coachId);
        if (templates == true) query = query.Where(h => h.RecipientUserId == null);
        else if (recipientId is not null) query = query.Where(h => h.RecipientUserId == recipientId);

        var habits = await query
            .OrderByDescending(h => h.UpdatedAtMs)
            .Select(h => new CoachHabitDto(
                h.HabitId,
                h.UpdatedAtMs,
                h.DeletedAtMs == null ? h.DataJson : null,
                h.DeletedAtMs,
                h.RecipientUserId))
            .ToListAsync();

        return Results.Ok(new { habits });
    }

    private static async Task<IResult> GetAssignedCoachHabits(
        [FromQuery] long since,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var userId = caller.GetUserId();
        var sinceUtc = DateTimeOffset.FromUnixTimeMilliseconds(since).UtcDateTime;

        var habits = await db.CoachHabits
            .AsNoTracking()
            .Where(h => h.RecipientUserId == userId && h.SyncedAt > sinceUtc)
            .Where(h => db.CoachClientRelationships.Any(r =>
                r.CoachId == h.CoachId && r.ClientId == userId && r.Status == CoachClientStatus.Active))
            .OrderBy(h => h.SyncedAt)
            .Select(h => new AssignedCoachHabitDto(
                h.HabitId,
                h.UpdatedAtMs,
                h.DeletedAtMs == null ? h.DataJson : null,
                h.DeletedAtMs))
            .ToListAsync();

        return Results.Ok(new { habits });
    }

    // ── Messaging ─────────────────────────────────────────────────────────────

    /// The relationship the caller can message in, or null (not found / not a participant /
    /// not open — all indistinguishable to the caller). Open: Active coaching, or a request
    /// someone made, which is a conversation before coaching starts (canvas R3). With
    /// `reading`, a closed request's conversation too: it stays readable, never replied to.
    private static Task<CoachClientRelationship?> ParticipantRelationship(
        Guid callerId, Guid relationshipId, AppDbContext db, bool reading = false) =>
        db.CoachClientRelationships.FirstOrDefaultAsync(r =>
            r.Id == relationshipId &&
            (r.CoachId == callerId || r.ClientId == callerId) &&
            (r.Status == CoachClientStatus.Active
                || (r.Status == CoachClientStatus.Pending && r.RequestedByClient)
                || (reading && r.Status == CoachClientStatus.Revoked && r.RequestedByClient
                    && (r.RequestStage == RequestStages.NotAFit || r.RequestStage == RequestStages.Withdrawn))));

    private static async Task<IResult> SendMessage(
        [FromBody] SendMessageRequest req,
        ClaimsPrincipal caller,
        AppDbContext db,
        Logit.Api.Features.Email.IEmailSender email,
        IConfiguration config)
    {
        var callerId = caller.GetUserId();
        if (string.IsNullOrWhiteSpace(req.MessageId))
            return Results.BadRequest(new { error = "messageId is required." });
        var body = (req.Body ?? string.Empty).Trim();
        if (body.Length == 0 && req.PhotoId is null && req.VoiceId is null) return Results.BadRequest(new { error = "Message body is empty." });
        if (body.Length > 5000) return Results.BadRequest(new { error = "Message too long." });

        var relationship = await ParticipantRelationship(callerId, req.RelationshipId, db);
        if (relationship is null) return Results.NotFound();

        var exists = await db.CoachMessages.AnyAsync(m =>
            m.SenderUserId == callerId && m.MessageId == req.MessageId);
        if (exists)
            return Results.Ok(new { messageId = req.MessageId, duplicate = true });

        Photo? photo = null;
        if (req.PhotoId is { } photoId && (photo = await Logit.Api.Features.Photos.PhotoEndpoints.OwnedAsync(db, callerId, photoId)) is null)
            return Results.BadRequest(new { error = "That photo didn't upload. Try again." });
        VoiceNote? voice = null;
        if (req.VoiceId is { } voiceId && (voice = await Logit.Api.Features.Voice.VoiceEndpoints.OwnedAsync(db, callerId, voiceId)) is null)
            return Results.BadRequest(new { error = "That voice message didn't upload. Try again." });

        string? kind = null, card = null;
        if (req.Kind is { } k)
        {
            // Clients: a lasting swap (SW1), an answer to a goal suggestion (GL1). Coaches: a
            // program swap (W6/Q8), a goal suggestion (GL1), a reply to a check-in (K4), their month (W7).
            string[] allowed = relationship.ClientId == callerId ? ["lasting-swap", "goal-answer"] : ["program-swap", "goal-suggestion", "checkin-reply", "month-report"];
            if (!allowed.Contains(k)) return Results.BadRequest(new { error = "That kind of message can't be sent." });
            if (req.CardJson is { Length: > 4000 }) return Results.BadRequest(new { error = "Card too large." });
            try { if (req.CardJson is not null) using (System.Text.Json.JsonDocument.Parse(req.CardJson)) { } }
            catch (System.Text.Json.JsonException) { return Results.BadRequest(new { error = "Card isn't JSON." }); }
            (kind, card) = (k, req.CardJson);
        }

        var message = new CoachMessage
        {
            Kind = kind,
            CardJson = card,
            VoiceId = voice?.Id,
            VoiceMs = voice?.DurationMs ?? 0,
            VoicePeaks = voice is null ? null : Logit.Api.Features.Voice.VoiceEndpoints.Peaks(req.VoicePeaks),
            PhotoId = photo?.Id,
            PhotoWidth = photo?.Width ?? 0,
            PhotoHeight = photo?.Height ?? 0,
            MessageId = req.MessageId,
            RelationshipId = relationship.Id,
            SenderUserId = callerId,
            Body = body,
            CreatedAtMs = req.CreatedAtMs,
            ContextDateIso = string.IsNullOrWhiteSpace(req.ContextDateIso) ? null : req.ContextDateIso,
        };
        db.CoachMessages.Add(message);
        await db.SaveChangesAsync();
        // A coach answering a request: an email if they don't have the app yet (canvas R7).
        if (relationship.Status == CoachClientStatus.Pending && relationship.CoachId == callerId)
            await RequestEmails.MaybeSendAsync(db, email, config, relationship.Id, null, message.Id);

        return Results.Ok(new { id = message.Id, messageId = message.MessageId });
    }

    private static async Task<IResult> GetMessages(
        [FromQuery] Guid relationshipId,
        [FromQuery] long since,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var callerId = caller.GetUserId();
        var relationship = await ParticipantRelationship(callerId, relationshipId, db, reading: true);
        if (relationship is null) return Results.NotFound();

        var sinceUtc = DateTimeOffset.FromUnixTimeMilliseconds(since).UtcDateTime;
        var messages = await db.CoachMessages
            .AsNoTracking()
            .Where(m => m.RelationshipId == relationshipId && m.SyncedAt > sinceUtc)
            .OrderBy(m => m.SyncedAt)
            .Select(m => new MessageDto(
                m.MessageId, m.Body, m.CreatedAtMs, m.ReadAtMs, m.SenderUserId == callerId, m.ContextDateIso,
                m.PhotoId == null ? null : "/photos/" + m.PhotoId.Value.ToString("N"), m.PhotoWidth, m.PhotoHeight,
                m.VoiceId == null ? null : "/voice/" + m.VoiceId.Value.ToString("N"), m.VoiceMs, m.VoicePeaks, m.Reaction,
                m.Kind, m.CardJson))
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
                m.RelationshipId, m.MessageId, m.Body, m.CreatedAtMs, m.ReadAtMs, m.SenderUserId == callerId, m.ContextDateIso,
                m.PhotoId == null ? null : "/photos/" + m.PhotoId.Value.ToString("N"), m.PhotoWidth, m.PhotoHeight,
                m.VoiceId == null ? null : "/voice/" + m.VoiceId.Value.ToString("N"), m.VoiceMs, m.VoicePeaks, m.Reaction,
                m.Kind, m.CardJson))
            .ToListAsync();

        return Results.Ok(new { messages });
    }

    /// React to the other person's message, change it, or take it back (Emoji null). The same six
    /// as chats between people; the sender gets a push (PushDispatcher).
    private static async Task<IResult> ReactToMessage([FromBody] CoachReactRequest req, ClaimsPrincipal caller, AppDbContext db)
    {
        var callerId = caller.GetUserId();
        if (req.Emoji is { } e && !Social.DirectMessageEndpoints.Reactions.Contains(e))
            return Results.BadRequest(new { error = "That reaction isn't available." });
        var relationship = await ParticipantRelationship(callerId, req.RelationshipId, db);
        if (relationship is null) return Results.NotFound();
        var message = await db.CoachMessages.FirstOrDefaultAsync(m => m.RelationshipId == req.RelationshipId && m.MessageId == req.MessageId);
        if (message is null || message.SenderUserId == callerId) return Results.NotFound();
        if (message.Reaction == req.Emoji) return Results.Ok(new { reaction = message.Reaction });
        message.Reaction = req.Emoji;
        message.ReactedAt = req.Emoji is null ? null : DateTime.UtcNow;
        message.ReactionPushedAt = req.Emoji is null ? DateTime.UtcNow : null;
        message.SyncedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Results.Ok(new { reaction = message.Reaction });
    }

    private static async Task<IResult> MarkMessagesRead(
        [FromBody] MarkReadRequest req,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        var callerId = caller.GetUserId();
        var relationship = await ParticipantRelationship(callerId, req.RelationshipId, db, reading: true);
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

public record AcceptInviteRequest(SharingDto? Sharing);

public record SendMessageRequest(Guid RelationshipId, string MessageId, string? Body, long CreatedAtMs, string? ContextDateIso = null, Guid? PhotoId = null,
    Guid? VoiceId = null, string? VoicePeaks = null,
    // Program swaps (canvas SW1, Q8): a client's "for the rest of the program", or the coach
    // changing an exercise in their copy. Only these two; request steps stay server-made.
    string? Kind = null, string? CardJson = null);
public record MarkReadRequest(Guid RelationshipId, long UpToMs);
public record CoachReactRequest(Guid RelationshipId, string MessageId, string? Emoji);
public record MessageDto(string MessageId, string Body, long CreatedAtMs, long? ReadAtMs, bool Mine, string? ContextDateIso = null,
    string? PhotoUrl = null, int PhotoWidth = 0, int PhotoHeight = 0, string? VoiceUrl = null, int VoiceMs = 0, string? VoicePeaks = null,
    string? Reaction = null,
    // A step in a request (CoachIntake.Events) and what its card shows; null for ordinary messages.
    string? Kind = null, string? CardJson = null);
public record ThreadMessageDto(Guid RelationshipId, string MessageId, string Body, long CreatedAtMs, long? ReadAtMs, bool Mine, string? ContextDateIso = null,
    string? PhotoUrl = null, int PhotoWidth = 0, int PhotoHeight = 0, string? VoiceUrl = null, int VoiceMs = 0, string? VoicePeaks = null,
    string? Reaction = null, string? Kind = null, string? CardJson = null);

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
    Guid? RecipientUserId,
    // When the client tapped Start, so the coach sees which week they're on.
    long? StartedAtMs = null);

public record AssignedProgramDto(
    string ProgramId,
    long UpdatedAtMs,
    string? DataJson,
    long? DeletedAtMs,
    long? StartedAtMs,
    // Whose program it is, so the client's phone applies that coach's swap rule.
    Guid? CoachId = null);

public record StartProgramRequest(long StartedAtMs);

public record UpsertNutritionPlanRequest(
    string PlanId,
    string DataJson,
    long UpdatedAtMs,
    string? RecipientUsername,
    long? DeletedAtMs);

public record UpsertCoachHabitRequest(
    string HabitId,
    string DataJson,
    long UpdatedAtMs,
    string? RecipientUsername = null,
    long? DeletedAtMs = null);

public record CoachHabitDto(
    string HabitId,
    long UpdatedAtMs,
    string? DataJson,
    long? DeletedAtMs,
    Guid? RecipientUserId);

public record AssignedCoachHabitDto(
    string HabitId,
    long UpdatedAtMs,
    string? DataJson,
    long? DeletedAtMs);

public record NutritionPlanDto(
    string PlanId,
    long UpdatedAtMs,
    string? DataJson,
    long? DeletedAtMs,
    Guid? RecipientUserId);

public record AssignedNutritionPlanDto(
    string PlanId,
    long UpdatedAtMs,
    string? DataJson,
    long? DeletedAtMs);
