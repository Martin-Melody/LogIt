using System.Security.Cryptography;
using System.Text;

namespace Logit.Api.Features.Discover;

/// One way Discover can be put together: which recipes, in what order. Each account is placed
/// in one arm for good (until `Salt` changes), so two arms can be compared fairly.
public sealed class DiscoverArm
{
    public string Name { get; set; } = "";
    /// Relative share of accounts: arms weighted 1 and 1 split accounts in half.
    public int Weight { get; set; } = 1;
    public string[] PostRecipes { get; set; } = [];
    public string[] PeopleRecipes { get; set; } = [];
}

/// appsettings "Discover": { "Salt": "...", "Arms": [ { "Name", "Weight", "PostRecipes", "PeopleRecipes" } ] }.
/// Without it every account gets DefaultArm. Change Salt to reshuffle accounts into arms when
/// starting a new experiment.
public sealed class DiscoverExperiment
{
    public static readonly DiscoverArm DefaultArm = new()
    {
        Name = "mix-v1",
        PostRecipes = ["friends-of-friends", "popular-week", "new-accounts"],
        PeopleRecipes = ["friends-of-friends", "popular-week", "new-accounts"],
    };

    public string Salt { get; }
    public IReadOnlyList<DiscoverArm> Arms { get; }

    public DiscoverExperiment(IConfiguration config)
    {
        var section = config.GetSection("Discover");
        Salt = section["Salt"] ?? "discover-1";
        var arms = section.GetSection("Arms").Get<List<DiscoverArm>>() ?? [];
        // Arms naming a recipe that doesn't exist would quietly show less; drop the names instead.
        foreach (var arm in arms)
        {
            arm.PostRecipes = arm.PostRecipes.Where(n => DiscoverRecipes.Posts.Any(r => r.Name == n)).ToArray();
            arm.PeopleRecipes = arm.PeopleRecipes.Where(n => DiscoverRecipes.People.Any(r => r.Name == n)).ToArray();
        }
        arms = arms.Where(a => a.Weight > 0 && !string.IsNullOrWhiteSpace(a.Name)).ToList();
        Arms = arms.Count > 0 ? arms : [DefaultArm];
    }

    public DiscoverArm ArmFor(Guid userId)
    {
        var total = Arms.Sum(a => a.Weight);
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes($"{Salt}:{userId}"));
        var slot = (int)(BitConverter.ToUInt32(hash, 0) % (uint)total);
        foreach (var arm in Arms)
        {
            if (slot < arm.Weight) return arm;
            slot -= arm.Weight;
        }
        return Arms[^1];
    }
}
