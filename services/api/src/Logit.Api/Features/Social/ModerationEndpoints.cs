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

    private static async Task<IResult> Block(string username, ClaimsPrincipal caller, AppDbContext db,
        Logit.Api.Features.Coach.CoachingEnd coaching, CancellationToken ct)
    {
        var callerId = caller.GetUserId();
        var target = await db.Users.FirstOrDefaultAsync(u => u.Username == username.ToLowerInvariant() && !u.IsSample);
        if (target is null) return Results.NotFound();
        if (target.Id == callerId) return Results.BadRequest(new { error = "Cannot block yourself." });

        // Canvas Z5: you can't be coached by someone you've blocked, so coaching between you ends
        // first, unused days refunded whichever side blocks. Requests just close.
        var now = DateTime.UtcNow;
        var coachingRels = await db.CoachClientRelationships.Include(r => r.Payment).Include(r => r.Coach)
            .Where(r => ((r.CoachId == callerId && r.ClientId == target.Id) || (r.CoachId == target.Id && r.ClientId == callerId))
                && r.Status != CoachClientStatus.Revoked)
            .ToListAsync(ct);
        foreach (var rel in coachingRels)
        {
            if (rel.Status == CoachClientStatus.Pending)
            {
                rel.Status = CoachClientStatus.Revoked;
                rel.UpdatedAt = now;
                continue;
            }
            var reason = rel.CoachId == callerId ? Logit.Api.Features.Coach.EndReason.CoachEnded : Logit.Api.Features.Coach.EndReason.ClientStopped;
            await coaching.EndAsync(rel, reason, Logit.Api.Features.Coach.Payments.RefundRule.Unused, now, ct);
            Logit.Api.Features.Coach.CoachIntake.Post(db, rel, callerId, Logit.Api.Features.Coach.CoachIntake.Events.Ended,
                "Coaching has ended.", null, null, now);
        }

        if (!await db.Blocks.AnyAsync(b => b.BlockerId == callerId && b.BlockedId == target.Id))
            db.Blocks.Add(new Block { BlockerId = callerId, BlockedId = target.Id });

        // Blocking severs the follow graph both ways.
        var follows = await db.Follows
            .Where(f => (f.FollowerId == callerId && f.FollowedId == target.Id)
                     || (f.FollowerId == target.Id && f.FollowedId == callerId))
            .ToListAsync();
        db.Follows.RemoveRange(follows);
        db.FollowRequests.RemoveRange(await db.FollowRequests
            .Where(r => (r.RequesterId == callerId && r.TargetId == target.Id)
                     || (r.RequesterId == target.Id && r.TargetId == callerId))
            .ToListAsync());

        // As on Instagram: their likes and comments on your posts go (replies to those comments
        // with them, as when a comment is deleted), and so do the notifications between you.
        var theirComments = await db.Comments
            .Where(c => c.AuthorId == target.Id && c.Post.AuthorId == callerId && c.DeletedAt == null)
            .ToListAsync();
        var gone = theirComments.Select(c => c.Id).ToList();
        theirComments.AddRange(await db.Comments
            .Where(c => c.ParentCommentId != null && gone.Contains(c.ParentCommentId.Value) && c.DeletedAt == null)
            .ToListAsync());
        foreach (var c in theirComments) c.DeletedAt = now;
        db.Likes.RemoveRange(await db.Likes.Where(l => l.UserId == target.Id && l.Post.AuthorId == callerId).ToListAsync());
        db.Notifications.RemoveRange(await db.Notifications
            .Where(n => (n.UserId == callerId && n.ActorId == target.Id) || (n.UserId == target.Id && n.ActorId == callerId))
            .ToListAsync());

        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> Unblock(string username, ClaimsPrincipal caller, AppDbContext db)
    {
        var callerId = caller.GetUserId();
        var target = await db.Users.FirstOrDefaultAsync(u => u.Username == username.ToLowerInvariant() && !u.IsSample);
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
        AppDbContext db,
        TimeProvider clock)
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
            // Someone else's message in a chat you're in.
            ReportTargetType.Message => await db.DirectMessages.AnyAsync(m => m.Id == req.TargetId && m.SenderId != callerId && m.DeletedAt == null
                && db.DmMembers.Any(x => x.ThreadId == m.ThreadId && x.UserId == callerId)),
            // Someone else's story you can see.
            ReportTargetType.Story => await StoryEndpoints.Visible(db, callerId, clock.GetUtcNow().UtcDateTime).AnyAsync(s => s.Id == req.TargetId && s.AuthorId != callerId),
            // A post or comment in a group you can read.
            ReportTargetType.GroupPost => await db.GroupPosts.AnyAsync(p => p.Id == req.TargetId && p.DeletedAt == null && p.AuthorId != callerId
                && (p.Group.Access != GroupAccess.InviteOnly || db.GroupMembers.Any(m => m.GroupId == p.GroupId && m.UserId == callerId))),
            ReportTargetType.GroupComment => await db.GroupComments.AnyAsync(c => c.Id == req.TargetId && c.DeletedAt == null && c.AuthorId != callerId
                && (c.Post.Group.Access != GroupAccess.InviteOnly || db.GroupMembers.Any(m => m.GroupId == c.Post.GroupId && m.UserId == callerId))),
            // A group you're in.
            ReportTargetType.Group => await db.GroupMembers.AnyAsync(m => m.GroupId == req.TargetId && m.UserId == callerId),
            _ => false,
        };
        if (!targetExists) return Results.NotFound();

        // One open report per reporter per target.
        var dup = await db.Reports.AnyAsync(r =>
            r.ReporterId == callerId && r.TargetType == targetType &&
            r.TargetId == req.TargetId && r.Status == ReportStatus.Open);
        if (dup) return Results.NoContent();

        // A message in a group's chat also goes to that group's moderators (canvas D3), without
        // saying who reported it.
        Guid? groupId = targetType switch
        {
            ReportTargetType.Message => await db.DirectMessages.Where(m => m.Id == req.TargetId).Select(m => m.Thread.GroupId).FirstOrDefaultAsync(),
            ReportTargetType.GroupPost => await db.GroupPosts.Where(p => p.Id == req.TargetId).Select(p => (Guid?)p.GroupId).FirstOrDefaultAsync(),
            ReportTargetType.GroupComment => await db.GroupComments.Where(c => c.Id == req.TargetId).Select(c => (Guid?)c.Post.GroupId).FirstOrDefaultAsync(),
            _ => null,
        };
        if (groupId is { } gid && !await db.Reports.AnyAsync(r => r.GroupId == gid && r.TargetId == req.TargetId && r.GroupResolvedAt == null))
        {
            var mods = await db.GroupMembers.Where(m => m.GroupId == gid && (m.Role == GroupRole.Organiser || m.Role == GroupRole.Moderator)).Select(m => m.UserId).ToListAsync();
            db.Notifications.AddRange(mods.Select(u => new Notification { UserId = u, ActorId = u, Type = NotificationType.GroupReport, GroupId = gid, CreatedAt = clock.GetUtcNow().UtcDateTime }));
        }
        db.Reports.Add(new Report
        {
            ReporterId = callerId,
            TargetType = targetType,
            TargetId = req.TargetId,
            GroupId = groupId,
            Reason = reason,
            Note = string.IsNullOrWhiteSpace(req.Note) ? null : req.Note.Trim(),
        });
        await db.SaveChangesAsync();
        return Results.NoContent();
    }
}
