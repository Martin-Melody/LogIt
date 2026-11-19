using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Email;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Admin;

/// Who is making an admin request: an admin's account, or ADMIN_KEY (UserId null).
public sealed record AdminActor(Guid? UserId, string Name)
{
    public static readonly AdminActor Key = new(null, "admin key");
}

/// Writes the admin action log. Add() only stages the entry, so it is saved together with the
/// change it describes (one SaveChangesAsync, both or neither).
public static class AdminLog
{
    private const string ActorItem = "logit.admin.actor";

    public static void SetActor(HttpContext http, AdminActor actor) => http.Items[ActorItem] = actor;

    /// The actor the admin filter recorded. Only called inside /admin/api, where the filter has run.
    public static AdminActor Actor(HttpContext http) =>
        http.Items[ActorItem] as AdminActor ?? throw new InvalidOperationException("Admin actor missing.");

    public static void Add(AppDbContext db, HttpContext http, string action, User? target = null, string? detail = null) =>
        Add(db, Actor(http), action, target, detail);

    public static void Add(AppDbContext db, AdminActor actor, string action, User? target = null, string? detail = null) =>
        db.AdminActions.Add(new AdminAction
        {
            ActorUserId = actor.UserId,
            ActorName = actor.Name,
            Action = action,
            TargetUserId = target?.Id,
            TargetName = target?.Username,
            Detail = detail is { Length: > 500 } ? detail[..500] : detail,
        });

    /// How long the admin log is kept.
    public const int KeepDays = 365;

    public static Task<int> PruneAsync(AppDbContext db, DateTime now)
    {
        var cutoff = now.AddDays(-KeepDays);
        return db.AdminActions.Where(a => a.CreatedAt < cutoff).ExecuteDeleteAsync();
    }

    /// When an account is deleted, older entries stop naming it (the entry recording the
    /// deletion itself keeps the username, until the log is pruned).
    public static async Task ForgetAsync(AppDbContext db, Guid userId)
    {
        const string gone = "a deleted account";
        await db.AdminActions.Where(a => a.TargetUserId == userId).ExecuteUpdateAsync(s => s.SetProperty(a => a.TargetName, gone));
        await db.AdminActions.Where(a => a.ActorUserId == userId).ExecuteUpdateAsync(s => s.SetProperty(a => a.ActorName, gone));
    }

    /// Tells a person an admin changed their account, so nothing happens to it silently
    /// (a changed email, for one, would otherwise be a quiet way to take it over).
    public static async Task TellPersonAsync(IEmailSender email, ILogger logger, string? to, HttpContext http, string subject, string text)
    {
        if (!email.IsConfigured || string.IsNullOrWhiteSpace(to)) return;
        try
        {
            await email.SendAsync(to, subject,
                text + $"\n\nThis was done by an admin of {http.Request.Host}. If you didn't expect this, contact whoever runs that server.\n");
        }
        catch (Exception ex)
        {
            logger.LogWarning("Admin change email failed: {Reason}", ex.Message);
        }
    }

    /// Emails every admin (plus `alsoTo`, e.g. someone who just stopped being one) when the list of
    /// admins changes, so a takeover can't happen quietly. A failed email never undoes the change.
    public static async Task NotifyAdminsAsync(
        AppDbContext db, IEmailSender email, ILogger logger, string subject, string text, User? alsoTo = null)
    {
        if (!email.IsConfigured) return;
        var to = await db.Users.Where(u => u.IsAdmin && u.Email != "").Select(u => u.Email).ToListAsync();
        if (alsoTo is { Email.Length: > 0 } && !to.Contains(alsoTo.Email)) to.Add(alsoTo.Email);
        foreach (var address in to)
        {
            try { await email.SendAsync(address, subject, text); }
            catch (Exception ex) { logger.LogWarning("Admin change email failed: {Reason}", ex.Message); }
        }
    }
}
