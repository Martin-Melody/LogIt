using System.Security.Claims;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Social;

public static class ModerationEndpoints
{
    public static void MapModerationEndpoints(this IEndpointRouteBuilder app)
    {
        var users = app.MapGroup("/users").WithTags("Moderation");
        users.MapPost("/{username}/block", Block).RequireAuthorization().RequireRateLimiting("social-write");
        users.MapDelete("/{username}/block", Unblock).RequireAuthorization();
        users.MapGet("/me/blocks", GetBlocks).RequireAuthorization();

        app.MapPost("/reports", CreateReport).WithTags("Moderation")
            .RequireAuthorization().RequireRateLimiting("social-write");
    }

    private static async Task<IResult> Block(string username, ClaimsPrincipal caller, AppDbContext db)
    {
        var callerId = caller.GetUserId();
        var target = await db.Users.FirstOrDefaultAsync(u => u.Username == username.ToLowerInvariant());
        if (target is null) return Results.NotFound();
        if (target.Id == callerId) return Results.BadRequest(new { error = "Cannot block yourself." });

        if (!await db.Blocks.AnyAsync(b => b.BlockerId == callerId && b.BlockedId == target.Id))
            db.Blocks.Add(new Block { BlockerId = callerId, BlockedId = target.Id });

        // Blocking severs the follow graph both ways.
        var follows = await db.Follows
            .Where(f => (f.FollowerId == callerId && f.FollowedId == target.Id)
                     || (f.FollowerId == target.Id && f.FollowedId == callerId))
            .ToListAsync();
        db.Follows.RemoveRange(follows);

        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> Unblock(string username, ClaimsPrincipal caller, AppDbContext db)
    {
        var callerId = caller.GetUserId();
        var target = await db.Users.FirstOrDefaultAsync(u => u.Username == username.ToLowerInvariant());
        if (target is null) return Results.NotFound();

        var block = await db.Blocks.FindAsync(callerId, target.Id);
        if (block is null) return Results.NotFound();

        db.Blocks.Remove(block);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> GetBlocks(ClaimsPrincipal caller, AppDbContext db)
    {
        var callerId = caller.GetUserId();
        var blocked = await db.Blocks
            .Where(b => b.BlockerId == callerId)
            .OrderByDescending(b => b.CreatedAt)
            .Select(b => new { b.Blocked.Id, b.Blocked.Username, b.Blocked.DisplayName, b.Blocked.AvatarUrl, b.CreatedAt })
            .ToListAsync();
        return Results.Ok(blocked);
    }

    private record CreateReportRequest(string TargetType, Guid TargetId, string Reason, string? Note);

    private static async Task<IResult> CreateReport(
        [FromBody] CreateReportRequest req,
        ClaimsPrincipal caller,
        AppDbContext db)
    {
        if (!Enum.TryParse<ReportTargetType>(req.TargetType, ignoreCase: true, out var targetType))
            return Results.BadRequest(new { error = "Unknown target type." });
        if (!Enum.TryParse<ReportReason>(req.Reason, ignoreCase: true, out var reason))
            return Results.BadRequest(new { error = "Unknown reason." });

        var callerId = caller.GetUserId();

        var targetExists = targetType switch
        {
            ReportTargetType.Post => await db.Posts.AnyAsync(p => p.Id == req.TargetId && p.DeletedAt == null),
            ReportTargetType.Comment => await db.Comments.AnyAsync(c => c.Id == req.TargetId && c.DeletedAt == null),
            ReportTargetType.User => await db.Users.AnyAsync(u => u.Id == req.TargetId),
            _ => false,
        };
        if (!targetExists) return Results.NotFound();

        // One open report per reporter per target.
        var dup = await db.Reports.AnyAsync(r =>
            r.ReporterId == callerId && r.TargetType == targetType &&
            r.TargetId == req.TargetId && r.Status == ReportStatus.Open);
        if (dup) return Results.NoContent();

        db.Reports.Add(new Report
        {
            ReporterId = callerId,
            TargetType = targetType,
            TargetId = req.TargetId,
            Reason = reason,
            Note = string.IsNullOrWhiteSpace(req.Note) ? null : req.Note.Trim(),
        });
        await db.SaveChangesAsync();
        return Results.NoContent();
    }
}
