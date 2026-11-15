using Logit.Api.Data;

namespace Logit.Api.Features.Discover;

/// What a recipe gets to work with: who's asking and who must never be suggested to them.
/// Recipes only rank; the rules about who may appear (privacy, blocks, "not interested",
/// the "Show my posts in Discover" switch) are applied by DiscoverService before and after,
/// so a new recipe can't get them wrong.
public sealed class DiscoverContext
{
    public required AppDbContext Db { get; init; }
    public required Guid ViewerId { get; init; }
    /// People the viewer follows.
    public required IReadOnlySet<Guid> Following { get; init; }
    /// Never suggest these: the viewer, people they follow or asked to follow, blocks both
    /// ways, and people they marked "Not interested".
    public required IReadOnlySet<Guid> Excluded { get; init; }
    public required DateTime Now { get; init; }
}

/// A post a recipe picked, best first. `Reason` is shown on the card ("Popular this week").
public sealed record PostCandidate(Guid PostId, Guid AuthorId, double Score, string Reason);

/// A person a recipe picked, best first.
public sealed record PersonCandidate(Guid UserId, double Score, string Reason);

/// One way of choosing posts for Discover. Add a class, register it in DiscoverRecipes.All,
/// and name it in an experiment arm (appsettings "Discover:Arms") to try it.
public interface IDiscoverPostRecipe
{
    string Name { get; }
    /// `posts` is already limited to posts Discover may show (DiscoverService.EligiblePosts).
    Task<IReadOnlyList<PostCandidate>> PickPostsAsync(DiscoverContext ctx, IQueryable<Data.Entities.Post> posts, int max);
}

/// One way of choosing "People you might know".
public interface IDiscoverPeopleRecipe
{
    string Name { get; }
    /// `people` is already limited to accounts that may be suggested (DiscoverService.EligiblePeople).
    Task<IReadOnlyList<PersonCandidate>> PickPeopleAsync(DiscoverContext ctx, IQueryable<Data.Entities.User> people, int max);
}
