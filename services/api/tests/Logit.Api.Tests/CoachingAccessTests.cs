using Logit.Api.Data.Entities;
using Logit.Api.Features.Coach;
using Microsoft.Extensions.Configuration;

namespace Logit.Api.Tests;

/// Self-hosted servers include coaching, though their accounts stay on the Free tier: coach
/// links used to read "off" there and inviting by username was refused.
public class CoachingAccessTests
{
    private static IConfiguration Config(bool selfHosted) =>
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Deployment:SelfHosted"] = selfHosted.ToString() }).Build();

    [Fact]
    public void On_getlogit_app_only_Studio_coaches()
    {
        Assert.True(CoachingAccess.CanCoach(new User { Tier = UserTier.Studio }, Config(false)));
        Assert.False(CoachingAccess.CanCoach(new User { Tier = UserTier.Pro }, Config(false)));
        Assert.False(CoachingAccess.CanCoach(new User { Tier = UserTier.Free }, Config(false)));
    }

    [Fact]
    public void On_a_self_hosted_server_everyone_can_coach()
    {
        Assert.True(CoachingAccess.CanCoach(new User { Tier = UserTier.Free }, Config(true)));
    }
}
