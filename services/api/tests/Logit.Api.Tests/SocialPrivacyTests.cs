using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features;
using Logit.Api.Features.Discover;
using Logit.Api.Features.Social;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Logit.Api.Tests;

public class SocialPrivacyTests
{
    private static async Task<(SqliteConnection, AppDbContext)> NewDb()
    {
        var conn = new SqliteConnection("Data Source=:memory:");
        conn.Open();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(conn).Options);
        await db.Database.EnsureCreatedAsync();
        return (conn, db);
    }

    private static User NewUser(string name, bool isPrivate = false, bool? discover = true, DateTime? created = null) => new()
    {
        Username = name, Email = $"{name}@example.com", DisplayName = char.ToUpper(name[0]) + name[1..], PasswordHash = "x",
        IsPrivate = isPrivate, ShowInDiscover = discover, CreatedAt = created ?? DateTime.UtcNow.AddYears(-1),
    };

    private static Post NewPost(User author, string body, DateTime? at = null, Post? repostOf = null) => new()
    {
        AuthorId = author.Id, Type = PostType.Text, Body = body, CreatedAt = at ?? DateTime.UtcNow.AddHours(-1),
        RepostOfId = repostOf?.Id,
    };

    [Fact]
    public async Task Private_accounts_are_seen_by_themselves_and_accepted_followers_only()
    {
        var (conn, db) = await NewDb();
        await using var _ = conn;
        var mark = NewUser("mark", isPrivate: true);
        var conor = NewUser("conor");
        var stranger = NewUser("stranger");
        var pub = NewUser("pub");
        db.Users.AddRange(mark, conor, stranger, pub);
        db.Follows.Add(new Follow { FollowerId = conor.Id, FollowedId = mark.Id });
        db.FollowRequests.Add(new FollowRequest { RequesterId = stranger.Id, TargetId = mark.Id });
        await db.SaveChangesAsync();

        Assert.True(await db.CanSeeAsync(mark.Id, mark));
        Assert.True(await db.CanSeeAsync(conor.Id, mark));
        Assert.False(await db.CanSeeAsync(stranger.Id, mark)); // a request isn't a follow
        Assert.False(await db.CanSeeAsync(null, mark));        // signed out
        Assert.True(await db.CanSeeAsync(null, pub));

        Assert.Equal([mark.Id], await db.HiddenAuthorsAsync(stranger.Id, [mark.Id, pub.Id]));
        Assert.Empty(await db.HiddenAuthorsAsync(conor.Id, [mark.Id, pub.Id]));
    }

    [Fact]
    public void Profile_and_repost_mapping_withhold_private_content()
    {
        var mark = NewUser("mark", isPrivate: true);
        mark.PublicProfileJson = "{\"widgets\":[]}";

        var stranger = mark.ToProfileDto(false, 5, 3, isFollowing: false, requested: true);
        Assert.Null(stranger.PublicProfileJson);
        Assert.False(stranger.CanSeeContent);
        Assert.Equal("requested", stranger.FollowStatus);
        Assert.Equal(5, stranger.FollowerCount); // counts stay visible

        var follower = mark.ToProfileDto(false, 5, 3, isFollowing: true);
        Assert.NotNull(follower.PublicProfileJson);
        Assert.Equal("following", follower.FollowStatus);
        Assert.Null(mark.ToProfileDto(true).FollowStatus);

        var original = NewPost(mark, "secret");
        original.Author = mark;
        var sarah = NewUser("sarah");
        var repost = NewPost(sarah, "look");
        repost.Author = sarah;
        repost.RepostOf = original;
        repost.RepostOfId = original.Id;

        var hidden = repost.ToDto(Guid.NewGuid(), new HashSet<Guid> { mark.Id });
        Assert.True(hidden.RepostOf!.Unavailable);
        Assert.True(hidden.RepostOf.Deleted); // older apps grey it out
        Assert.Null(hidden.RepostOf.Body);
        Assert.Equal("look", hidden.Body);

        var shown = repost.ToDto(Guid.NewGuid(), new HashSet<Guid>());
        Assert.Equal("secret", shown.RepostOf!.Body);
        Assert.True(shown.RepostOf.AuthorIsPrivate);
    }

    [Fact]
    public async Task Accepting_a_request_makes_a_follower_and_tells_them()
    {
        var (conn, db) = await NewDb();
        await using var _ = conn;
        var mark = NewUser("mark", isPrivate: true);
        var paul = NewUser("paul");
        db.Users.AddRange(mark, paul);
        var request = new FollowRequest { RequesterId = paul.Id, TargetId = mark.Id };
        db.FollowRequests.Add(request);
        db.Notifications.Add(new Notification { UserId = mark.Id, ActorId = paul.Id, Type = NotificationType.FollowRequest });
        await db.SaveChangesAsync();

        await db.AcceptAsync(request);
        await db.RemoveFollowRequestNotificationAsync(paul.Id, mark.Id);
        await db.SaveChangesAsync();

        Assert.True(await db.Follows.AnyAsync(f => f.FollowerId == paul.Id && f.FollowedId == mark.Id));
        Assert.False(await db.FollowRequests.AnyAsync());
        var left = await db.Notifications.SingleAsync();
        Assert.Equal(NotificationType.FollowAccepted, left.Type);
        Assert.Equal(paul.Id, left.UserId);
    }

    [Fact]
    public async Task Discover_shows_only_posts_it_may_and_says_why()
    {
        var (conn, db) = await NewDb();
        await using var _ = conn;
        var alex = NewUser("alex");
        var niamh = NewUser("niamh");
        var rory = NewUser("rory");            // followed by Niamh: friends of friends
        var jess = NewUser("jess");            // popular
        var dara = NewUser("dara", created: DateTime.UtcNow.AddDays(-3)); // new account
        var mark = NewUser("mark", isPrivate: true);
        var old = NewUser("old", discover: null);  // never answered the Discover question
        var quiet = NewUser("quiet", discover: false);
        var blocker = NewUser("blocker");
        var hidden = NewUser("hidden");
        db.Users.AddRange(alex, niamh, rory, jess, dara, mark, old, quiet, blocker, hidden);
        db.Follows.AddRange(
            new Follow { FollowerId = alex.Id, FollowedId = niamh.Id },
            new Follow { FollowerId = niamh.Id, FollowedId = rory.Id },
            new Follow { FollowerId = niamh.Id, FollowedId = mark.Id });
        db.Blocks.Add(new Block { BlockerId = blocker.Id, BlockedId = alex.Id });
        db.DiscoverDismissals.Add(new DiscoverDismissal { UserId = alex.Id, HiddenUserId = hidden.Id });

        var roryPost = NewPost(rory, "meet prep");
        var jessPost = NewPost(jess, "hip mobility", DateTime.UtcNow.AddHours(-5));
        var daraPost = NewPost(dara, "first week");
        var niamhPost = NewPost(niamh, "already followed");
        var markPost = NewPost(mark, "private");
        var oldPost = NewPost(old, "not asked");
        var quietPost = NewPost(quiet, "said no");
        var blockerPost = NewPost(blocker, "blocked");
        var hiddenPost = NewPost(hidden, "not interested");
        var repost = NewPost(jess, "", repostOf: roryPost);
        repost.Body = null;
        db.Posts.AddRange(roryPost, jessPost, daraPost, niamhPost, markPost, oldPost, quietPost, blockerPost, hiddenPost, repost);
        await db.SaveChangesAsync();
        db.Likes.AddRange(
            new Like { UserId = niamh.Id, PostId = jessPost.Id },
            new Like { UserId = rory.Id, PostId = jessPost.Id },
            new Like { UserId = dara.Id, PostId = jessPost.Id });
        await db.SaveChangesAsync();

        var config = new ConfigurationBuilder().Build();
        var discover = new DiscoverService(db, new DiscoverExperiment(config), TimeProvider.System);
        var (items, next, arm) = await discover.PostsAsync(alex.Id, 20, null);

        Assert.Equal("mix-v1", arm);
        Assert.Null(next);
        var byBody = items.ToDictionary(i => i.Post.Body ?? "", i => i);
        Assert.Equal(["first week", "hip mobility", "meet prep"], byBody.Keys.Order().ToArray());
        Assert.Equal("Niamh follows Rory", byBody["meet prep"].Reason);
        Assert.Equal("friends-of-friends", byBody["meet prep"].Recipe);
        Assert.Equal("Popular this week", byBody["hip mobility"].Reason);
        Assert.Equal("New to LogIt", byBody["first week"].Reason);

        // Every post shown is recorded once, with the recipe that picked it.
        await discover.PostsAsync(alex.Id, 20, null);
        Assert.Equal(3, await db.DiscoverImpressions.CountAsync(i => i.UserId == alex.Id));

        // Following someone later counts for the recipe that showed them.
        db.Follows.Add(new Follow { FollowerId = alex.Id, FollowedId = rory.Id, CreatedAt = DateTime.UtcNow.AddMinutes(1) });
        await db.SaveChangesAsync();
        var stats = await DiscoverStats.ComputeAsync(db, DateTime.UtcNow.AddDays(-1));
        var fof = stats.Single(r => r.Recipe == "friends-of-friends");
        Assert.Equal(1, fof.Shown);
        Assert.Equal(1, fof.Followed);
    }

    [Fact]
    public async Task People_suggestions_skip_follows_requests_and_people_hiding()
    {
        var (conn, db) = await NewDb();
        await using var _ = conn;
        var alex = NewUser("alex");
        var niamh = NewUser("niamh");
        var rory = NewUser("rory");
        var mark = NewUser("mark", isPrivate: true);
        var shy = NewUser("shy");
        shy.HideFromSuggestions = true;
        var asked = NewUser("asked", isPrivate: true);
        db.Users.AddRange(alex, niamh, rory, mark, shy, asked);
        db.Follows.AddRange(
            new Follow { FollowerId = alex.Id, FollowedId = niamh.Id },
            new Follow { FollowerId = niamh.Id, FollowedId = rory.Id },
            new Follow { FollowerId = niamh.Id, FollowedId = mark.Id },
            new Follow { FollowerId = niamh.Id, FollowedId = shy.Id },
            new Follow { FollowerId = niamh.Id, FollowedId = asked.Id });
        db.FollowRequests.Add(new FollowRequest { RequesterId = alex.Id, TargetId = asked.Id });
        await db.SaveChangesAsync();

        var discover = new DiscoverService(db, new DiscoverExperiment(new ConfigurationBuilder().Build()), TimeProvider.System);
        var (people, _) = await discover.PeopleAsync(alex.Id, 10);
        var names = people.Select(p => p.User.Username).Order().ToArray();
        Assert.Equal(["mark", "rory"], names); // a private account can be suggested; you'd ask
        Assert.All(people, p => Assert.Equal("Niamh follows", p.Reason));
    }

    [Fact]
    public void Interleave_takes_turns_skips_repeats_and_caps_each_author()
    {
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();
        var p1 = Guid.NewGuid(); var p2 = Guid.NewGuid(); var p3 = Guid.NewGuid(); var p4 = Guid.NewGuid();
        var lists = new List<(string, IReadOnlyList<PostCandidate>)>
        {
            ("one", [new(p1, a, 3, "r"), new(p2, a, 2, "r"), new(p3, a, 1, "r")]),
            ("two", [new(p1, a, 9, "r"), new(p4, b, 1, "r")]),
        };
        var merged = DiscoverService.Interleave(lists, c => c.PostId, c => c.AuthorId, 2);
        Assert.Equal([p1, p4, p2], merged.Select(m => m.Item.PostId).ToArray());
        Assert.Equal(["one", "two", "one"], merged.Select(m => m.Recipe).ToArray());
    }

    [Fact]
    public void Experiment_arms_split_accounts_by_weight_and_stay_put()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Discover:Salt"] = "test",
            ["Discover:Arms:0:Name"] = "a",
            ["Discover:Arms:0:Weight"] = "1",
            ["Discover:Arms:0:PostRecipes:0"] = "popular-week",
            ["Discover:Arms:1:Name"] = "b",
            ["Discover:Arms:1:Weight"] = "1",
            ["Discover:Arms:1:PostRecipes:0"] = "friends-of-friends",
            ["Discover:Arms:1:PostRecipes:1"] = "no-such-recipe",
        }).Build();
        var exp = new DiscoverExperiment(config);
        Assert.Equal(["friends-of-friends"], exp.Arms[1].PostRecipes);

        var ids = Enumerable.Range(0, 2000).Select(_ => Guid.NewGuid()).ToList();
        var inA = ids.Count(id => exp.ArmFor(id).Name == "a");
        Assert.InRange(inA, 850, 1150);
        Assert.All(ids.Take(50), id => Assert.Equal(exp.ArmFor(id).Name, exp.ArmFor(id).Name));
    }

    [Fact]
    public async Task A_plain_repost_shares_the_originals_likes_and_comments()
    {
        var (conn, db) = await NewDb();
        await using var _ = conn;
        var emma = NewUser("emma");
        var sarah = NewUser("sarah");
        var alex = NewUser("alex");
        db.Users.AddRange(emma, sarah, alex);
        var original = NewPost(emma, "my split");
        db.Posts.Add(original);
        var plain = new Post { AuthorId = sarah.Id, Type = PostType.Text, Body = null, RepostOfId = original.Id };
        var quote = new Post { AuthorId = sarah.Id, Type = PostType.Text, Body = "look at this", RepostOfId = original.Id };
        db.Posts.AddRange(plain, quote);
        await db.SaveChangesAsync();
        db.Likes.Add(new Like { UserId = alex.Id, PostId = original.Id });
        db.Comments.Add(new Comment { PostId = original.Id, AuthorId = alex.Id, Body = "nice" });
        await db.SaveChangesAsync();

        Assert.Equal(original.Id, await db.SharedPostIdAsync(plain.Id));
        Assert.Equal(quote.Id, await db.SharedPostIdAsync(quote.Id));     // a quote is its own post
        Assert.Equal(original.Id, await db.SharedPostIdAsync(original.Id));

        db.ChangeTracker.Clear();
        var rows = await db.Posts
            .Include(p => p.Author).Include(p => p.Likes).Include(p => p.Comments)
            .Include(p => p.RepostOf!).ThenInclude(r => r.Author)
            .Include(p => p.RepostOf!).ThenInclude(r => r.Likes)
            .Include(p => p.RepostOf!).ThenInclude(r => r.Comments)
            .ToDictionaryAsync(p => p.Id);
        var plainDto = rows[plain.Id].ToDto(alex.Id);
        Assert.Equal(1, plainDto.LikeCount);
        Assert.True(plainDto.IsLikedByMe);
        Assert.Equal(1, plainDto.CommentCount);
        var quoteDto = rows[quote.Id].ToDto(alex.Id);
        Assert.Equal(0, quoteDto.LikeCount);
        Assert.Equal(0, quoteDto.CommentCount);
    }
}
