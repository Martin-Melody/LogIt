using System.Security.Claims;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Coach;

public static class CoachEndpoints
{
    public static void MapCoachEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/coach").WithTags("Coach").RequireAuthorization();

        group.MapPost("/clients/{username}/invite", Invite);
        group.MapGet("/clients", GetClients);
        group.MapGet("/invites/received", GetReceivedInvites);
        group.MapGet("/invites/sent", GetSentInvites);
        group.MapPost("/invites/{relationshipId:guid}/accept", AcceptInvite);
        group.MapPost("/invites/{relationshipId:guid}/decline", DeclineInvite);
        group.MapDelete("/relationships/{relationshipId:guid}", RevokeRelationship);
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
}
