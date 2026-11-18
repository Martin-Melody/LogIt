using Logit.Api.Data.Entities;
using Logit.Api.Features.Sync;
using Microsoft.AspNetCore.Http;

namespace Logit.Api.Tests;

/// Free accounts back up one phone (Features/Sync/FreeBackup.cs).
public class FreeBackupTests
{
    private static User Free(string? device = null) => new() { Tier = UserTier.Free, BackupDeviceId = device };

    [Fact]
    public void The_first_phone_to_back_up_claims_the_backup()
    {
        Assert.Equal(FreeBackup.Decision.Claim, FreeBackup.Check(Free(), UserTier.Pro, "/sync/splits", "phone-a"));
    }

    [Fact]
    public void The_phone_holding_the_backup_is_let_through()
    {
        Assert.Equal(FreeBackup.Decision.Allowed, FreeBackup.Check(Free("phone-a"), UserTier.Pro, "/sync/sessions", "phone-a"));
    }

    [Fact]
    public void Another_phone_is_refused()
    {
        Assert.Equal(FreeBackup.Decision.OtherDevice, FreeBackup.Check(Free("phone-a"), UserTier.Pro, "/sync/sessions", "phone-b"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Without_a_device_id_the_plan_decides_so_the_web_dashboard_stays_pro(string? device)
    {
        Assert.Equal(FreeBackup.Decision.NotApplicable, FreeBackup.Check(Free(), UserTier.Pro, "/sync/splits", device));
    }

    [Fact]
    public void Only_sync_routes_count_as_backup()
    {
        Assert.Equal(FreeBackup.Decision.NotApplicable, FreeBackup.Check(Free(), UserTier.Pro, "/insights/charts", "phone-a"));
    }

    [Fact]
    public void Paid_plans_and_studio_only_endpoints_are_left_to_the_plan_check()
    {
        var pro = new User { Tier = UserTier.Pro };
        Assert.Equal(FreeBackup.Decision.NotApplicable, FreeBackup.Check(pro, UserTier.Pro, "/sync/splits", "phone-a"));
        Assert.Equal(FreeBackup.Decision.NotApplicable, FreeBackup.Check(Free(), UserTier.Studio, "/sync/splits", "phone-a"));
    }

    [Fact]
    public void Signing_in_on_a_phone_moves_the_backup_there()
    {
        var user = Free("phone-a");
        FreeBackup.MoveTo(user, "phone-b");
        Assert.Equal("phone-b", user.BackupDeviceId);

        FreeBackup.MoveTo(user, null); // the web: nothing moves
        Assert.Equal("phone-b", user.BackupDeviceId);
    }

    [Fact]
    public void Device_ids_are_trimmed_and_capped()
    {
        Assert.Equal("abc", FreeBackup.Normalize("  abc "));
        Assert.Equal(64, FreeBackup.Normalize(new string('x', 100))!.Length);
    }
}
