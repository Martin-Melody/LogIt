using System.Text.Json;
using Logit.Api.Features;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace Logit.Api.Tests;

/// Every endpoint behind a Pro or Studio lock, read from the running app, must match
/// docs/generated/tier-gates.json. The docs' feature list (packages/core/src/guide) is checked
/// against that file, so a lock added, removed or moved to another plan can't slip past the docs.
///
/// Changed a lock on purpose? Regenerate the file and commit it:
///   UPDATE_TIER_GATES=1 dotnet test --filter TierGateSnapshotTests
public class TierGateSnapshotTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _api;
    public TierGateSnapshotTests(ApiFactory api) => _api = api;

    public record Gate(string Method, string Route, string Plan, bool OrActivelyCoached);

    public static string RepoFile(params string[] parts)
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "packages", "core")))
            dir = dir.Parent;
        if (dir is null) throw new InvalidOperationException("Couldn't find the repository root from " + AppContext.BaseDirectory);
        return Path.Combine([dir.FullName, .. parts]);
    }

    private List<Gate> ReadGates()
    {
        _ = _api.CreateClient(); // starts the app so its endpoints exist
        var sources = _api.Services.GetRequiredService<IEnumerable<EndpointDataSource>>();
        return sources.SelectMany(s => s.Endpoints).OfType<RouteEndpoint>()
            .Select(e => (e, tier: e.Metadata.GetMetadata<TierRequirement>()))
            .Where(x => x.tier is not null)
            .SelectMany(x => (x.e.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods ?? ["ANY"])
                .Select(m => new Gate(m, "/" + x.e.RoutePattern.RawText!.TrimStart('/'), x.tier!.MinimumTier.ToString(), x.tier.OrActivelyCoached)))
            .OrderBy(g => g.Route, StringComparer.Ordinal).ThenBy(g => g.Method, StringComparer.Ordinal)
            .ToList();
    }

    [Fact]
    public void Locked_endpoints_match_the_committed_list()
    {
        var gates = ReadGates();
        Assert.NotEmpty(gates);
        var json = JsonSerializer.Serialize(gates, new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true }) + "\n";
        var path = RepoFile("docs", "generated", "tier-gates.json");

        if (Environment.GetEnvironmentVariable("UPDATE_TIER_GATES") == "1")
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path, json);
            return;
        }

        Assert.True(File.Exists(path), $"{path} is missing. Run UPDATE_TIER_GATES=1 dotnet test --filter TierGateSnapshotTests");
        var committed = File.ReadAllText(path).Replace("\r\n", "\n");
        Assert.True(committed == json,
            "The Pro/Studio locks changed. If that's on purpose, run UPDATE_TIER_GATES=1 dotnet test --filter TierGateSnapshotTests, "
            + "commit docs/generated/tier-gates.json, and update packages/core/src/guide so the docs say the same.");
    }
}
