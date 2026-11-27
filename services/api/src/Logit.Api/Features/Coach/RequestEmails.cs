using System.Security.Cryptography;
using System.Text;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Email;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Coach;

/// The email someone gets when a coach answers their request and they don't have the app yet
/// (canvas R7). Like a push it says who and what, never the message itself. Once they sign in
/// on the app (a push device), replies come as notifications instead. One email per unread run:
/// if an earlier coach message in the request is still unread, they already know.
public static class RequestEmails
{
    public static async Task MaybeSendAsync(AppDbContext db, IEmailSender email, IConfiguration config,
        Guid relationshipId, string? kind, Guid justSentMessageId)
    {
        if (!email.IsConfigured) return;
        var rel = await db.CoachClientRelationships.AsNoTracking().Include(r => r.Coach).Include(r => r.Client)
            .FirstOrDefaultAsync(r => r.Id == relationshipId && r.RequestedByClient
                && (r.Status == CoachClientStatus.Pending || r.Status == CoachClientStatus.Revoked));
        if (rel is null || rel.Client.IsSample || rel.Coach.IsSample || rel.Client.RequestEmailsOff) return;
        if (string.IsNullOrWhiteSpace(rel.Client.Email)) return;
        if (await db.PushDevices.AnyAsync(d => d.UserId == rel.ClientId)) return;
        // The coach's words before a card are sent a millisecond earlier: the same step.
        var sentMs = await db.CoachMessages.Where(m => m.Id == justSentMessageId).Select(m => m.CreatedAtMs).FirstOrDefaultAsync();
        var alreadyTold = await db.CoachMessages.AnyAsync(m => m.RelationshipId == rel.Id && m.SenderUserId == rel.CoachId
            && m.ReadAtMs == null && m.CreatedAtMs < sentMs - 1);
        if (alreadyTold) return;

        var coach = CoachIntake.NameOf(rel.Coach);
        var client = CoachIntake.NameOf(rel.Client);
        var (subject, line) = Wording(kind, coach);
        var web = config["Web:Origin"] ?? "http://localhost:3000";
        var open = $"{web}/my-coach?request={rel.Id}";
        var stop = $"{web}/stop-emails?u={rel.ClientId}&t={Token(config, rel.ClientId)}";
        try
        {
            await email.SendAsync(rel.Client.Email, subject,
                $"Hi {client},\n\n{line} Open LogIt to read it and reply.\n\n" +
                $"Open in LogIt: {open}\n\n" +
                "No app yet? The link opens LogIt in your browser, with a link to get the app.\n\n" +
                $"You get this because you asked {coach} to coach you and you don't have the LogIt app yet. " +
                "Once you sign in on the app, replies come as notifications instead.\n" +
                $"Stop these emails: {stop}\n\nLogIt");
        }
        catch
        {
            // An email that can't go out never fails the coach's action.
        }
    }

    public static (string Subject, string Line) Wording(string? kind, string coach) => kind switch
    {
        CoachIntake.Events.Offer => ($"{coach} offered you a coaching spot", $"{coach} offered you a spot."),
        CoachIntake.Events.OfferChanged => ($"{coach} changed their offer", $"{coach} changed the spot they offered you."),
        CoachIntake.Events.Waitlist => ($"You're on {coach}'s waiting list", $"{coach} put you on their waiting list."),
        CoachIntake.Events.Closed => ($"{coach} answered your coaching request", $"{coach} answered your request."),
        CoachIntake.Events.OfferWithdrawn => ($"{coach} withdrew their offer", $"{coach} withdrew the spot they offered you. Your request is still open."),
        CoachIntake.Events.Reopened => ($"{coach} reopened your coaching request", $"{coach} reopened your request."),
        _ => ($"{coach} replied to your coaching request", $"{coach} sent you a message about coaching."),
    };

    /// A link that only stops these emails for this person, with no sign-in.
    public static string Token(IConfiguration config, Guid userId)
    {
        var key = Encoding.UTF8.GetBytes(config["Jwt:Secret"] ?? "");
        var mac = HMACSHA256.HashData(key, Encoding.UTF8.GetBytes($"request-emails:{userId:N}"));
        return Convert.ToHexString(mac, 0, 16).ToLowerInvariant();
    }

    public record StopBody(Guid UserId, string Token);

    /// The web page /stop-emails posts here: the link in the email is the only key.
    public static void MapRequestEmailEndpoints(this IEndpointRouteBuilder app) =>
        app.MapPost("/email/stop-request-emails", async (StopBody body, AppDbContext db, IConfiguration config) =>
        {
            if (!CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(body.Token ?? ""), Encoding.ASCII.GetBytes(Token(config, body.UserId))))
                return Results.BadRequest(new { error = "This link isn't right. Copy the whole link from the email." });
            var user = await db.Users.FirstOrDefaultAsync(x => x.Id == body.UserId);
            if (user is not null && !user.RequestEmailsOff)
            {
                user.RequestEmailsOff = true;
                await db.SaveChangesAsync();
            }
            return Results.NoContent();
        }).AllowAnonymous().WithTags("Coach");
}
