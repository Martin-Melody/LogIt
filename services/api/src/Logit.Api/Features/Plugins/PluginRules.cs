using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Logit.Api.Features.Plugins;

/// <summary>
/// The server's checks on a plugin people build here, and the manifest it serves for a version.
/// The dashboard runs the full checks (sandbox, view, timing) before it lets anyone publish;
/// these are the ones the server can do without running the code.
/// </summary>
public static partial class PluginRules
{
    public const int MaxSourceBytes = 256 * 1024;
    public const int MaxNameLength = 60;
    public const int MaxDescriptionLength = 500;
    public const int MaxNoteLength = 2000;

    public static readonly string[] Families =
    [
        "widget", "progression-algorithm", "mobility-progression", "analytics",
        "nutrition-algorithm", "nutrition-analytics", "exercise-pack", "mobility-pack", "program-pack", "workout-block",
        // Canvas Q1/W13: content coaches copy (meal plans, recipes) and cards for Today and Your month.
        "meal-plan-pack", "recipe-pack", "card-pack",
        // Canvas W8/W9: check-in questions a sport plugin brings.
        "question-pack",
    ];

    public static readonly HashSet<string> CodeFamilies =
    [
        "widget", "progression-algorithm", "mobility-progression", "analytics",
        "nutrition-algorithm", "nutrition-analytics", "card-pack",
    ];

    /// What a widget can ask for (core plugins/widgetView WidgetDataNeed).
    public static readonly HashSet<string> WidgetNeeds =
    [
        "workouts", "exercises", "session", "todaysPlan", "progressionTargets", "nutrition", "bodyweight", "habits", "mobility",
    ];

    // Prefixes for LogIt's own and built-in plugins. app.getlogit. is LogIt's published ones
    // (getlogit.app): only admins publish under it, so apps can show them as LogIt's.
    private static readonly string[] ReservedPrefixes = ["builtin.", "logit.", "com.logit.", "ie.logit."];
    public const string FirstPartyPrefix = "app.getlogit.";

    [GeneratedRegex(@"^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$")]
    private static partial Regex IdPattern();

    [GeneratedRegex(@"^(\d+)\.(\d+)\.(\d+)$")]
    private static partial Regex VersionPattern();

    /// Null when the id is usable, else why not.
    public static string? CheckId(string? id, bool admin = false)
    {
        if (string.IsNullOrWhiteSpace(id)) return "Give the plugin an id.";
        if (id.Length > 100) return "The id is too long (100 characters at most).";
        if (!IdPattern().IsMatch(id))
            return "Use a reverse-domain id in lower case, like com.yourname.weekly-swings.";
        if (ReservedPrefixes.Any(p => id.StartsWith(p, StringComparison.Ordinal))
            || (!admin && id.StartsWith(FirstPartyPrefix, StringComparison.Ordinal)))
            return "That id is reserved for LogIt's own plugins.";
        return null;
    }

    public static bool IsFamily(string? family) => family is not null && Families.Contains(family);

    /// Parses "x.y.z"; null when it isn't one.
    public static (int, int, int)? ParseVersion(string? version)
    {
        var m = VersionPattern().Match(version ?? "");
        if (!m.Success) return null;
        try
        {
            return (int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value), int.Parse(m.Groups[3].Value));
        }
        catch (OverflowException) { return null; }
    }

    public static string Integrity(string source) =>
        "sha256-" + Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(source)));

    /// Name, description and needs from a draft manifest, checked. Error is null when it's fine.
    public static (DraftFields Fields, string? Error) ReadDraft(string family, string? manifestJson, string? source)
    {
        JsonObject? obj = null;
        try { obj = JsonNode.Parse(manifestJson ?? "{}") as JsonObject; }
        catch (JsonException) { }
        if (obj is null) return (DraftFields.Empty, "The manifest isn't a JSON object.");

        var name = (obj["name"] as JsonValue)?.TryGetValue<string>(out var n) == true ? n.Trim() : "";
        var description = (obj["description"] as JsonValue)?.TryGetValue<string>(out var d) == true ? d.Trim() : "";
        var needs = new List<string>();
        if (obj["needs"] is JsonArray arr)
            foreach (var item in arr)
                if ((item as JsonValue)?.TryGetValue<string>(out var need) == true && !needs.Contains(need))
                    needs.Add(need);

        var fields = new DraftFields(name, description, needs);
        if (name.Length == 0) return (fields, "Give the plugin a name.");
        if (name.Length > MaxNameLength) return (fields, $"The name is too long ({MaxNameLength} characters at most).");
        if (description.Length > MaxDescriptionLength)
            return (fields, $"The description is too long ({MaxDescriptionLength} characters at most).");
        if (family == "widget" && needs.FirstOrDefault(x => !WidgetNeeds.Contains(x)) is { } unknown)
            return (fields, $"\"{unknown}\" isn't something a widget can ask for.");
        if (Encoding.UTF8.GetByteCount(source ?? "") > MaxSourceBytes)
            return (fields, $"The code is too big ({MaxSourceBytes / 1024} KB at most).");
        return (fields, null);
    }

    /// The capability entry the app's plugin runtime looks for, per family.
    public static JsonObject Capability(string family, string pluginId) => family switch
    {
        "widget" => new JsonObject
        {
            ["family"] = family, ["widgetId"] = pluginId, ["slot"] = "home",
            ["defaultEnabled"] = true, ["defaultOrder"] = 100,
        },
        "analytics" or "nutrition-analytics" => new JsonObject { ["family"] = family, ["analyticsId"] = pluginId },
        "exercise-pack" => new JsonObject { ["family"] = family, ["exercisePackId"] = pluginId },
        "mobility-pack" => new JsonObject { ["family"] = family, ["mobilityPackId"] = pluginId },
        // Programs coaches copy into their own (canvas PG1/PG5 "Community").
        "program-pack" => new JsonObject { ["family"] = family, ["programPackId"] = pluginId },
        // A kind of workout block, declared as data (docs/plugin-workout-blocks.md); coaches put it in programs (canvas Q4).
        "workout-block" => new JsonObject { ["family"] = family, ["blockId"] = pluginId },
        "meal-plan-pack" => new JsonObject { ["family"] = family, ["mealPlanPackId"] = pluginId },
        "recipe-pack" => new JsonObject { ["family"] = family, ["recipePackId"] = pluginId },
        "card-pack" => new JsonObject { ["family"] = family, ["cardPackId"] = pluginId, ["slot"] = "coaching" },
        "question-pack" => new JsonObject { ["family"] = family, ["questionPackId"] = pluginId },
        _ => new JsonObject { ["family"] = family, ["algorithmId"] = pluginId },
    };

    /// The stored part of a version's manifest (no distribution/integrity).
    public static string StoredManifest(string pluginId, string family, string version, string author, DraftFields f)
    {
        var obj = new JsonObject
        {
            ["id"] = pluginId,
            ["family"] = family,
            ["name"] = f.Name,
            // The app treats an empty description as a broken manifest; the name stands in.
            ["description"] = f.Description.Length > 0 ? f.Description : f.Name,
            ["version"] = version,
            ["author"] = author,
            ["capabilities"] = new JsonArray(Capability(family, pluginId)),
        };
        if (family == "widget") obj["needs"] = new JsonArray(f.Needs.Select(x => (JsonNode)JsonValue.Create(x)!).ToArray());
        return obj.ToJsonString();
    }

    /// A stored manifest plus where to download it from and the hash to check.
    public static JsonObject Served(string storedManifestJson, string integrity, string manifestUrl, string bundleUrl)
    {
        var obj = JsonNode.Parse(storedManifestJson) as JsonObject ?? new JsonObject();
        obj["integrity"] = integrity;
        obj["distribution"] = new JsonObject
        {
            ["origin"] = "url",
            ["manifestUrl"] = manifestUrl,
            ["bundleUrl"] = bundleUrl,
        };
        return obj;
    }

    public static string NewToken() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(18)).Replace('+', '-').Replace('/', '_');

    public static string ContentType(string family) =>
        CodeFamilies.Contains(family) ? "text/javascript; charset=utf-8" : "application/json; charset=utf-8";
}

public record DraftFields(string Name, string Description, List<string> Needs)
{
    public static readonly DraftFields Empty = new("", "", []);
}
