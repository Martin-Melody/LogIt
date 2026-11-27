using System.Text.Json.Nodes;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Plugins;
using Logit.Api.Features.Sync;

namespace Logit.Api.Tests;

public class PluginPublishingTests
{
    private const string WidgetSource = "export const pluginBundle = { formatVersion: 1, pluginId: \"com.alex.swings\", family: \"widget\", entryExport: \"widget\" };\nexport const widget = { id: \"com.alex.swings\", needs: [\"workouts\"], compute() { return { title: \"x\", body: [] }; } };";

    private static HostedPlugin Plugin(string family = "widget", string? source = WidgetSource, string manifest = """{"name":"Weekly swings","description":"Swings this week.","needs":["workouts"]}""") => new()
    {
        PluginId = "com.alex.swings",
        Family = family,
        Name = "Weekly swings",
        DraftManifestJson = manifest,
        DraftSource = source ?? "",
        DraftToken = "draft-token",
        Owner = new User { Username = "alex", Email = "alex@example.com" },
    };

    [Theory]
    [InlineData("com.alex.weekly-swings", null)]
    [InlineData("io.github.rory.rpe", null)]
    [InlineData("swings", "reverse-domain")]
    [InlineData("Com.Alex.Swings", "reverse-domain")]
    [InlineData("com..alex", "reverse-domain")]
    [InlineData("builtin.widget.recap", "reserved")]
    [InlineData("com.logit.recap", "reserved")]
    [InlineData("app.getlogit.rounds", "reserved")]
    [InlineData("", "Give the plugin an id")]
    public void Ids_are_reverse_domain_and_not_reserved(string id, string? errorContains)
    {
        var error = PluginRules.CheckId(id);
        if (errorContains is null) Assert.Null(error);
        else Assert.Contains(errorContains, error);
    }

    [Fact]
    public void Only_admins_publish_under_LogIts_own_prefix()
    {
        Assert.Null(PluginRules.CheckId("app.getlogit.rounds", admin: true));
        Assert.Contains("reserved", PluginRules.CheckId("com.logit.recap", admin: true));
    }

    [Fact]
    public void A_draft_needs_a_name_and_only_known_widget_needs()
    {
        Assert.Contains("name", PluginRules.ReadDraft("widget", """{"name":"  "}""", "x").Error);
        Assert.Contains("\"location\"", PluginRules.ReadDraft("widget", """{"name":"A","needs":["workouts","location"]}""", "x").Error);
        Assert.Contains("JSON object", PluginRules.ReadDraft("widget", "[1]", "x").Error);
        Assert.Contains("too big", PluginRules.ReadDraft("widget", """{"name":"A"}""", new string('x', PluginRules.MaxSourceBytes + 1)).Error);

        var (fields, error) = PluginRules.ReadDraft("widget", """{"name":" Swings ","needs":["workouts","workouts","habits"]}""", "x");
        Assert.Null(error);
        Assert.Equal("Swings", fields.Name);
        Assert.Equal(["workouts", "habits"], fields.Needs);
        // Other families don't declare needs: theirs are fixed by the family.
        Assert.Null(PluginRules.ReadDraft("analytics", """{"name":"A","needs":["anything"]}""", "x").Error);
    }

    [Fact]
    public void Publishing_for_Browse_waits_for_review_and_replaces_an_older_pending_version()
    {
        var p = Plugin();
        var now = new DateTime(2026, 11, 16, 12, 0, 0, DateTimeKind.Utc);

        var first = PluginPublishing.CreateRelease(p, "1.0.0", "First version.", listed: true, now);
        Assert.Null(first.Error);
        Assert.Equal(PluginReleaseStatus.Pending, first.Release!.Status);
        Assert.Null(p.LinkToken);
        Assert.Equal(PluginRules.Integrity(WidgetSource), first.Release.Integrity);
        Assert.StartsWith("sha256-", first.Release.Integrity);

        var manifest = JsonNode.Parse(first.Release.ManifestJson)!.AsObject();
        Assert.Equal("com.alex.swings", (string?)manifest["id"]);
        Assert.Equal("@alex", (string?)manifest["author"]);
        Assert.Equal("1.0.0", (string?)manifest["version"]);
        Assert.Equal("workouts", (string?)manifest["needs"]![0]);
        var cap = manifest["capabilities"]![0]!.AsObject();
        Assert.Equal("com.alex.swings", (string?)cap["widgetId"]);
        Assert.Equal("home", (string?)cap["slot"]);

        var second = PluginPublishing.CreateRelease(p, "1.0.1", null, listed: true, now);
        Assert.Null(second.Error);
        Assert.Equal(PluginReleaseStatus.Withdrawn, first.Release.Status);
        Assert.Equal(PluginReleaseStatus.Pending, second.Release!.Status);
    }

    [Fact]
    public void Versions_must_go_up()
    {
        var p = Plugin();
        var now = DateTime.UtcNow;
        Assert.Null(PluginPublishing.CreateRelease(p, "1.9.0", null, listed: false, now).Error);
        Assert.Contains("after 1.9.0", PluginPublishing.CreateRelease(p, "1.9.0", null, listed: false, now).Error);
        Assert.Contains("after 1.9.0", PluginPublishing.CreateRelease(p, "1.2.0", null, listed: false, now).Error);
        Assert.Contains("like 1.0.0", PluginPublishing.CreateRelease(p, "2", null, listed: false, now).Error);
        // Numbers, not text: 1.10.0 is after 1.9.0.
        Assert.Null(PluginPublishing.CreateRelease(p, "1.10.0", null, listed: false, now).Error);
    }

    [Fact]
    public void Sharing_by_link_is_live_straight_away_and_keeps_its_link()
    {
        var p = Plugin();
        var r = PluginPublishing.CreateRelease(p, "0.1.0", null, listed: false, DateTime.UtcNow);
        Assert.Equal(PluginReleaseStatus.Unlisted, r.Release!.Status);
        var token = p.LinkToken;
        Assert.False(string.IsNullOrEmpty(token));

        PluginPublishing.CreateRelease(p, "0.2.0", null, listed: false, DateTime.UtcNow);
        Assert.Equal(token, p.LinkToken);
    }

    [Fact]
    public void Nothing_to_publish_or_a_broken_pack_is_refused()
    {
        Assert.Contains("no code", PluginPublishing.CreateRelease(Plugin(source: "  "), "1.0.0", null, true, DateTime.UtcNow).Error);
        Assert.Contains("isn't valid JSON", PluginPublishing.CreateRelease(
            Plugin(family: "exercise-pack", source: "{oops", manifest: """{"name":"Home gym"}"""), "1.0.0", null, true, DateTime.UtcNow).Error);
        Assert.Null(PluginPublishing.CreateRelease(
            Plugin(family: "exercise-pack", source: """{"exercises":[]}""", manifest: """{"name":"Home gym"}"""), "1.0.0", null, true, DateTime.UtcNow).Error);
    }

    [Fact]
    public void Reviews_need_a_note_to_turn_down_and_only_apply_to_pending_versions()
    {
        var p = Plugin();
        var r = PluginPublishing.CreateRelease(p, "1.0.0", null, listed: true, DateTime.UtcNow).Release!;

        Assert.Contains("what needs to change", PluginPublishing.Review(r, approve: false, note: " ", DateTime.UtcNow));
        Assert.Null(PluginPublishing.Review(r, approve: false, note: "Handle an empty week.", DateTime.UtcNow));
        Assert.Equal(PluginReleaseStatus.Rejected, r.Status);
        Assert.Equal("Handle an empty week.", r.ReviewNote);
        Assert.NotNull(r.ReviewedAt);
        Assert.NotNull(PluginPublishing.Review(r, approve: true, note: null, DateTime.UtcNow));

        var next = PluginPublishing.CreateRelease(p, "1.0.1", null, listed: true, DateTime.UtcNow).Release!;
        Assert.Null(PluginPublishing.Review(next, approve: true, note: null, DateTime.UtcNow));
        Assert.Equal(PluginReleaseStatus.Approved, next.Status);
    }

    [Fact]
    public void The_served_manifest_says_where_to_download_and_what_hash_to_check()
    {
        var p = Plugin();
        var r = PluginPublishing.CreateRelease(p, "1.0.0", null, listed: true, DateTime.UtcNow).Release!;
        var served = PluginRules.Served(r.ManifestJson, r.Integrity, "https://api/m.json", "https://api/b");
        Assert.Equal(r.Integrity, (string?)served["integrity"]);
        Assert.Equal("url", (string?)served["distribution"]!["origin"]);
        Assert.Equal("https://api/b", (string?)served["distribution"]!["bundleUrl"]);
    }

    [Fact]
    public void The_community_plugins_switch_merges_like_goals()
    {
        var older = """{"community":{"enabled":true,"acknowledgedRisk":true,"updatedAtMs":100}}""";
        var newer = """{"community":{"enabled":false,"acknowledgedRisk":true,"updatedAtMs":200}}""";
        Assert.Contains("\"enabled\":false", SyncEndpoints.MergeByTimestamp(newer, older, "updatedAtMs"));
        Assert.Contains("\"enabled\":false", SyncEndpoints.MergeByTimestamp(older, newer, "updatedAtMs"));
    }
}
