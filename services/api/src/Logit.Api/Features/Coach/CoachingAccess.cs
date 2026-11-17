using Logit.Api.Data.Entities;

namespace Logit.Api.Features.Coach;

/// Who may coach clients: Studio on getlogit.app, everyone on a self-hosted server (which
/// includes every feature; its accounts stay on the Free tier, so a tier check alone would
/// switch coaching off there).
public static class CoachingAccess
{
    public static bool CanCoach(User coach, IConfiguration config) =>
        coach.Tier == UserTier.Studio || config.GetValue<bool>("Deployment:SelfHosted");
}
