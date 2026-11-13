using Logit.Api.Features.Admin;

namespace Logit.Api.Tests;

public class AdminKeyGuardTests
{
    private static readonly DateTime T0 = new(2026, 11, 13, 12, 0, 0, DateTimeKind.Utc);
    private const string Key = "correct-horse-battery-staple-42";

    [Theory]
    [InlineData(Key, true)]
    [InlineData("correct-horse-battery-staple-4", false)]
    [InlineData("correct-horse-battery-staple-421", false)]
    [InlineData("CORRECT-HORSE-BATTERY-STAPLE-42", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void Only_the_exact_key_matches(string? provided, bool expected)
    {
        Assert.Equal(expected, new AdminKeyGuard(Key).KeyMatches(provided));
    }

    [Fact]
    public void An_address_is_locked_out_after_too_many_wrong_keys()
    {
        var guard = new AdminKeyGuard(Key);
        for (var i = 1; i < AdminKeyGuard.MaxFailures; i++)
        {
            Assert.False(guard.RecordFailure("1.2.3.4", T0.AddSeconds(i)));
            Assert.Null(guard.LockedUntil("1.2.3.4", T0.AddSeconds(i)));
        }

        Assert.True(guard.RecordFailure("1.2.3.4", T0.AddSeconds(30)));
        Assert.Equal(T0.AddSeconds(30) + AdminKeyGuard.Window, guard.LockedUntil("1.2.3.4", T0.AddSeconds(31)));
    }

    [Fact]
    public void Other_addresses_are_not_affected_by_a_lockout()
    {
        var guard = new AdminKeyGuard(Key);
        for (var i = 0; i < AdminKeyGuard.MaxFailures; i++) guard.RecordFailure("1.2.3.4", T0);

        Assert.NotNull(guard.LockedUntil("1.2.3.4", T0));
        Assert.Null(guard.LockedUntil("5.6.7.8", T0));
    }

    [Fact]
    public void The_lockout_ends_after_the_window()
    {
        var guard = new AdminKeyGuard(Key);
        for (var i = 0; i < AdminKeyGuard.MaxFailures; i++) guard.RecordFailure("1.2.3.4", T0);

        Assert.NotNull(guard.LockedUntil("1.2.3.4", T0 + AdminKeyGuard.Window - TimeSpan.FromSeconds(1)));
        Assert.Null(guard.LockedUntil("1.2.3.4", T0 + AdminKeyGuard.Window));
    }

    [Fact]
    public void After_a_lockout_ends_the_count_starts_again()
    {
        var guard = new AdminKeyGuard(Key);
        for (var i = 0; i < AdminKeyGuard.MaxFailures; i++) guard.RecordFailure("1.2.3.4", T0);

        var later = T0 + AdminKeyGuard.Window + TimeSpan.FromMinutes(1);
        Assert.False(guard.RecordFailure("1.2.3.4", later));
        Assert.Null(guard.LockedUntil("1.2.3.4", later));
    }

    [Fact]
    public void Failures_spread_out_beyond_the_window_never_lock_out()
    {
        var guard = new AdminKeyGuard(Key);
        var t = T0;
        for (var i = 0; i < AdminKeyGuard.MaxFailures * 3; i++)
        {
            t += AdminKeyGuard.Window / (AdminKeyGuard.MaxFailures - 2);
            Assert.False(guard.RecordFailure("1.2.3.4", t));
        }
        Assert.Null(guard.LockedUntil("1.2.3.4", t));
    }

    [Fact]
    public void Pruning_forgets_only_expired_addresses()
    {
        var guard = new AdminKeyGuard(Key);
        guard.RecordFailure("old", T0);
        for (var i = 0; i < AdminKeyGuard.MaxFailures; i++) guard.RecordFailure("locked", T0 + TimeSpan.FromMinutes(10));

        guard.Prune(T0 + TimeSpan.FromMinutes(20));

        // "locked" is still locked; "old" is gone (a new failure starts a fresh count).
        Assert.NotNull(guard.LockedUntil("locked", T0 + TimeSpan.FromMinutes(20)));
        for (var i = 1; i < AdminKeyGuard.MaxFailures; i++)
            Assert.False(guard.RecordFailure("old", T0 + TimeSpan.FromMinutes(20)));
    }
}
