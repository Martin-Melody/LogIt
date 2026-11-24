using System.Security.Claims;
using System.Security.Cryptography;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Social;

/// "Invite a friend" (design canvas T3): a link or QR that, once accepted, makes the two people
/// follow each other. Accepting counts as approval on both sides (decided 24 Nov): the inviter
/// chose to invite, the friend chose to accept, so a private account on either side follows at
/// once. Never across a block.
public static class FriendInviteEndpoints
{
    public static void MapFriendInviteEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/friends").WithTags("Social");
        g.MapGet("/invite", MyInvite).RequireAuthorization();
        g.MapPost("/invite/new", NewInvite).RequireAuthorization();
        g.MapGet("/invites/{code}", Preview).AllowAnonymous().RequireRateLimiting("social-write");
        g.MapPost("/invites/{code}/accept", Accept).RequireAuthorization().RequireRateLimiting("social-write");
    }

    public record InviteDto(string Code);
    public record InvitePreviewDto(string Username, string DisplayName, string? AvatarUrl);

    private static string NewCode()
    {
        const string letters = "abcdefghjkmnpqrstuvwxyz23456789";
        return string.Concat(RandomNumberGenerator.GetItems<char>(letters, 12));
    }

    private static async Task<IResult> MyInvite(ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var invite = await db.FriendInvites.FirstOrDefaultAsync(i => i.InviterId == me);
        if (invite is null)
        {
            db.FriendInvites.Add(invite = new FriendInvite { Code = NewCode(), InviterId = me });
            await db.SaveChangesAsync();
        }
        return Results.Ok(new InviteDto(invite.Code));
    }

    /// The old link stops working (shared somewhere public by mistake).
    private static async Task<IResult> NewInvite(ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        db.FriendInvites.RemoveRange(await db.FriendInvites.Where(i => i.InviterId == me).ToListAsync());
        var invite = new FriendInvite { Code = NewCode(), InviterId = me };
        db.FriendInvites.Add(invite);
        await db.SaveChangesAsync();
        return Results.Ok(new InviteDto(invite.Code));
    }

    /// Who invited you, for the link's page before signing in: name and photo only.
    private static async Task<IResult> Preview(string code, AppDbContext db)
    {
        var inviter = await db.FriendInvites.Where(i => i.Code == code && !i.Inviter.IsSample)
            .Select(i => new InvitePreviewDto(i.Inviter.Username, i.Inviter.DisplayName, i.Inviter.AvatarUrl))
            .FirstOrDefaultAsync();
        return inviter is null ? Results.NotFound(new { error = "This invite link doesn't work any more." }) : Results.Ok(inviter);
    }

    private static async Task<IResult> Accept(string code, ClaimsPrincipal caller, AppDbContext db)
    {
        var me = caller.GetUserId();
        var invite = await db.FriendInvites.Include(i => i.Inviter).FirstOrDefaultAsync(i => i.Code == code && !i.Inviter.IsSample);
        if (invite is null) return Results.NotFound(new { error = "This invite link doesn't work any more." });
        var them = invite.InviterId;
        if (them == me) return Results.BadRequest(new { error = "That's your own invite. Send it to a friend." });
        if (await db.Blocks.AnyAsync(b => (b.BlockerId == me && b.BlockedId == them) || (b.BlockerId == them && b.BlockedId == me)))
            return Results.NotFound(new { error = "This invite link doesn't work any more." });

        var iFollowed = await FollowAsync(db, me, them);
        await FollowAsync(db, them, me);
        if (iFollowed) db.AddFollow(me, them); // "X followed you" for the inviter; none for the one who accepted
        await db.SaveChangesAsync();
        return Results.Ok(new { invite.Inviter.Username });
    }

    /// Follows if not already, dropping any request that was waiting. Returns whether it's new.
    private static async Task<bool> FollowAsync(AppDbContext db, Guid follower, Guid followed)
    {
        var waiting = await db.FollowRequests.Where(r => r.RequesterId == follower && r.TargetId == followed).ToListAsync();
        db.FollowRequests.RemoveRange(waiting);
        if (waiting.Count > 0) await db.RemoveFollowRequestNotificationAsync(follower, followed);
        if (await db.Follows.AnyAsync(f => f.FollowerId == follower && f.FollowedId == followed)) return false;
        db.Follows.Add(new Follow { FollowerId = follower, FollowedId = followed });
        return true;
    }
}
