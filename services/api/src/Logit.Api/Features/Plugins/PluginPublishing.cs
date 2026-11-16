using System.Text.Json;
using Logit.Api.Data.Entities;

namespace Logit.Api.Features.Plugins;

/// Publishing and reviewing versions; pure rules on loaded entities so tests can cover them.
public static class PluginPublishing
{
    public record Outcome(PluginRelease? Release, string? Error);

    /// <summary>
    /// Freeze the plugin's current draft as a new version. <paramref name="listed"/> asks for a
    /// spot in Browse (waits for review); otherwise it's shared by link straight away. Needs
    /// <c>p.Releases</c> and <c>p.Owner</c> loaded.
    /// </summary>
    public static Outcome CreateRelease(HostedPlugin p, string? version, string? changeNote, bool listed, DateTime now)
    {
        var parsed = PluginRules.ParseVersion(version);
        if (parsed is null) return new(null, "Use a version like 1.0.0.");
        var newest = p.Releases.Select(r => PluginRules.ParseVersion(r.Version)).Where(v => v is not null).Max();
        if (newest is { } n && parsed.Value.CompareTo(n) <= 0)
            return new(null, $"Use a version after {n.Item1}.{n.Item2}.{n.Item3}.");

        var note = changeNote?.Trim();
        if (note is { Length: > PluginRules.MaxNoteLength })
            return new(null, $"\"What's new\" is too long ({PluginRules.MaxNoteLength} characters at most).");

        var (fields, error) = PluginRules.ReadDraft(p.Family, p.DraftManifestJson, p.DraftSource);
        if (error is not null) return new(null, error);
        if (string.IsNullOrWhiteSpace(p.DraftSource)) return new(null, "There's no code to publish yet.");
        if (!PluginRules.CodeFamilies.Contains(p.Family))
        {
            try { using var _ = JsonDocument.Parse(p.DraftSource); }
            catch (JsonException) { return new(null, "The pack isn't valid JSON."); }
        }

        if (listed)
        {
            // Only the newest submission waits for review.
            foreach (var pending in p.Releases.Where(r => r.Status == PluginReleaseStatus.Pending))
                pending.Status = PluginReleaseStatus.Withdrawn;
        }
        else
        {
            p.LinkToken ??= PluginRules.NewToken();
        }

        var release = new PluginRelease
        {
            HostedPluginId = p.Id,
            Plugin = p,
            Version = version!,
            ManifestJson = PluginRules.StoredManifest(p.PluginId, p.Family, version!, $"@{p.Owner.Username}", fields),
            Source = p.DraftSource,
            Integrity = PluginRules.Integrity(p.DraftSource),
            Status = listed ? PluginReleaseStatus.Pending : PluginReleaseStatus.Unlisted,
            ChangeNote = string.IsNullOrEmpty(note) ? null : note,
            SubmittedAt = now,
        };
        p.Releases.Add(release);
        return new(release, null);
    }

    /// Approve or turn down a pending version. Turning one down needs a note saying what to change.
    public static string? Review(PluginRelease r, bool approve, string? note, DateTime now)
    {
        if (r.Status != PluginReleaseStatus.Pending) return "Only versions waiting for review can be reviewed.";
        var trimmed = note?.Trim();
        if (!approve && string.IsNullOrEmpty(trimmed)) return "Say what needs to change.";
        if (trimmed is { Length: > PluginRules.MaxNoteLength }) return "The note is too long.";

        r.Status = approve ? PluginReleaseStatus.Approved : PluginReleaseStatus.Rejected;
        r.ReviewNote = string.IsNullOrEmpty(trimmed) ? null : trimmed;
        r.ReviewedAt = now;
        return null;
    }
}
