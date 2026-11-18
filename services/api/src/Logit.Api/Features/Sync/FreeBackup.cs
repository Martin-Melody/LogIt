using Logit.Api.Data.Entities;
using Microsoft.AspNetCore.Http;

namespace Logit.Api.Features.Sync;

/// Free accounts back up one phone (decision A, 2026-11-17): the /sync endpoints that need Pro
/// also let a Free account through from the phone that holds its backup. The phone sends a
/// stable id in the X-Logit-Device header; the first phone to back up holds it, and signing in
/// on another phone moves it there. Syncing several phones and the web dashboard stay Pro.
/// Self-hosted servers include everything and never get here.
public static class FreeBackup
{
    public const string DeviceHeader = "X-Logit-Device";
    public const string OtherDeviceCode = "backup_other_device";
    public const string OtherDeviceMessage =
        "Your free backup is on another phone. Sign in on this phone to move it here, or get Pro to sync both.";
    private const int MaxDeviceIdLength = 64;

    public enum Decision
    {
        /// Not a Free backup request: the normal plan check decides.
        NotApplicable,
        /// From the phone that holds this account's backup.
        Allowed,
        /// No phone holds the backup yet: this one takes it.
        Claim,
        /// Another phone holds the backup.
        OtherDevice,
    }

    public static Decision Check(User user, UserTier minimumTier, PathString path, string? deviceId)
    {
        if (minimumTier != UserTier.Pro || user.Tier >= UserTier.Pro) return Decision.NotApplicable;
        if (!path.StartsWithSegments("/sync")) return Decision.NotApplicable;
        var device = Normalize(deviceId);
        if (device is null) return Decision.NotApplicable;
        if (user.BackupDeviceId is null) return Decision.Claim;
        return user.BackupDeviceId == device ? Decision.Allowed : Decision.OtherDevice;
    }

    /// Signing in or up on a phone makes it the one that holds the backup.
    public static void MoveTo(User user, string? deviceId)
    {
        var device = Normalize(deviceId);
        if (device is not null) user.BackupDeviceId = device;
    }

    public static string? Normalize(string? deviceId)
    {
        var trimmed = deviceId?.Trim();
        if (string.IsNullOrEmpty(trimmed)) return null;
        return trimmed.Length > MaxDeviceIdLength ? trimmed[..MaxDeviceIdLength] : trimmed;
    }
}
