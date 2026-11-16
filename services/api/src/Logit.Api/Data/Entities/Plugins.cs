namespace Logit.Api.Data.Entities;

// Plugins people build on the dashboard and publish through this server, plus the
// per-account list of installed plugins that syncs between the phone and the web.

/// <summary>
/// A plugin someone is building. Holds the working draft (edited on the dashboard, tried on
/// the owner's phone through <see cref="DraftToken"/>) and its published versions. The
/// manifest id (<see cref="PluginId"/>) is unique on this server.
/// </summary>
public class HostedPlugin
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid OwnerId { get; set; }
    public User Owner { get; set; } = null!;

    /// Manifest id, e.g. "com.alex.weekly-swings".
    public string PluginId { get; set; } = string.Empty;
    public string Family { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;

    /// The draft manifest as the builder sends it (no distribution or integrity: the server
    /// fills those in when it serves a version).
    public string DraftManifestJson { get; set; } = "{}";
    /// The draft code bundle (code families) or data file (packs).
    public string DraftSource { get; set; } = string.Empty;
    public long DraftUpdatedAtMs { get; set; }

    /// Unguessable token in the draft's URLs, so the owner's phone can fetch the draft
    /// without signing the request. Rotates never; the draft is only reachable through it.
    public string DraftToken { get; set; } = string.Empty;

    /// Set once the owner shares a version by link; the link installs the newest version
    /// published "by link" or approved for Browse.
    public string? LinkToken { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<PluginRelease> Releases { get; set; } = [];
}

public enum PluginReleaseStatus
{
    /// Waiting for a LogIt review before it shows in Browse.
    Pending,
    /// Reviewed and listed in Browse (and installable by link).
    Approved,
    /// Not listed; ReviewNote says what to change.
    Rejected,
    /// Published "people with the link": installable by link, never in Browse, not reviewed.
    Unlisted,
    /// A pending version replaced by a newer submission before anyone reviewed it.
    Withdrawn,
}

/// One published version of a <see cref="HostedPlugin"/>. Immutable once created except for
/// its review status.
public class PluginRelease
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid HostedPluginId { get; set; }
    public HostedPlugin Plugin { get; set; } = null!;

    public string Version { get; set; } = string.Empty;
    /// Manifest without distribution/integrity (filled in when served).
    public string ManifestJson { get; set; } = "{}";
    public string Source { get; set; } = string.Empty;
    /// "sha256-&lt;base64&gt;" of <see cref="Source"/> as UTF-8.
    public string Integrity { get; set; } = string.Empty;

    public PluginReleaseStatus Status { get; set; }
    public string? ChangeNote { get; set; }
    public string? ReviewNote { get; set; }

    public DateTime SubmittedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ReviewedAt { get; set; }
}

/// One installed plugin on an account: { manifest, enabled, installedAtMs, preferences?, source }
/// as JSON, keyed by the plugin's manifest id. Synced through /sync/plugins like habits.
public class SyncedPluginInstall : ISyncedClientRow
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string ClientId { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public long CreatedAtMs { get; set; }
    public long UpdatedAtMs { get; set; }
    public string DataJson { get; set; } = string.Empty;
    public long? DeletedAtMs { get; set; }
    public DateTime SyncedAt { get; set; } = DateTime.UtcNow;
}
