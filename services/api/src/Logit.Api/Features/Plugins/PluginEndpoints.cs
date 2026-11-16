using System.Security.Claims;
using System.Text.Json.Nodes;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Email;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Plugins;

/// <summary>
/// Plugins built on the dashboard and published through this server.
///
/// Public (no sign-in; the app fetches these like any static registry):
///   GET /plugins/registry.json                       approved plugins, newest version each
///   GET /plugins/r/{id}                              one listed plugin, with its versions
///   GET /plugins/r/{id}/{version}/manifest.json      a version's manifest (with integrity)
///   GET /plugins/r/{id}/{version}/bundle             its code or data
///   GET /plugins/link/{token}                        the version shared "by link"
///   GET /plugins/draft/{token}/manifest.json|bundle  the owner's draft, for trying on a phone
///
/// The owner's (Pro): /plugins/mine[...] to create, save, delete and publish.
/// Reviews: /admin/api/plugins (see MapPluginAdmin).
/// </summary>
public static class PluginEndpoints
{
    public static void MapPluginEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/plugins").WithTags("Plugins");

        group.MapGet("/registry.json", GetRegistry);
        group.MapGet("/r/{pluginId}", GetListed);
        group.MapGet("/r/{pluginId}/{version}/manifest.json", GetReleaseManifest);
        group.MapGet("/r/{pluginId}/{version}/bundle", GetReleaseBundle);
        group.MapGet("/link/{token}", GetByLink);
        group.MapGet("/draft/{token}/manifest.json", GetDraftManifest);
        group.MapGet("/draft/{token}/bundle", GetDraftBundle);

        var mine = group.MapGroup("/mine").RequireAuthorization().RequireTier(UserTier.Pro);
        mine.MapGet("", ListMine);
        mine.MapPost("", CreatePlugin);
        mine.MapGet("/{pluginId}", GetMine);
        mine.MapPut("/{pluginId}", SaveDraft);
        mine.MapDelete("/{pluginId}", DeletePlugin);
        mine.MapPost("/{pluginId}/releases", Publish);
    }

    private static string BaseUrl(HttpRequest req) => $"{req.Scheme}://{req.Host}{req.PathBase}";

    private static string ReleaseManifestUrl(HttpRequest req, string pluginId, string version) =>
        $"{BaseUrl(req)}/plugins/r/{Uri.EscapeDataString(pluginId)}/{Uri.EscapeDataString(version)}/manifest.json";

    private static JsonObject ServedRelease(HttpRequest req, string pluginId, PluginRelease r)
    {
        var baseUrl = $"{BaseUrl(req)}/plugins/r/{Uri.EscapeDataString(pluginId)}/{Uri.EscapeDataString(r.Version)}";
        return PluginRules.Served(r.ManifestJson, r.Integrity, $"{baseUrl}/manifest.json", $"{baseUrl}/bundle");
    }

    // Newest-first by version number (strings would put 1.10.0 before 1.9.0).
    private static IEnumerable<PluginRelease> NewestFirst(IEnumerable<PluginRelease> releases) =>
        releases.OrderByDescending(r => PluginRules.ParseVersion(r.Version) ?? (0, 0, 0));

    // ── Public ───────────────────────────────────────────────────────────────

    private static async Task<IResult> GetRegistry(HttpRequest req, AppDbContext db)
    {
        var approved = await db.PluginReleases
            .AsNoTracking()
            .Where(r => r.Status == PluginReleaseStatus.Approved)
            .Select(r => new { Release = r, r.Plugin.PluginId, r.Plugin.Family, OwnerUsername = r.Plugin.Owner.Username })
            .ToListAsync();

        var entries = approved
            .GroupBy(x => x.PluginId)
            .Select(g =>
            {
                var latest = g.OrderByDescending(x => PluginRules.ParseVersion(x.Release.Version) ?? (0, 0, 0)).First();
                var manifest = JsonNode.Parse(latest.Release.ManifestJson) as JsonObject ?? new JsonObject();
                return new
                {
                    id = latest.PluginId,
                    name = (string?)manifest["name"] ?? latest.PluginId,
                    description = (string?)manifest["description"] ?? "",
                    family = latest.Family,
                    author = $"@{latest.OwnerUsername}",
                    manifestUrl = ReleaseManifestUrl(req, latest.PluginId, latest.Release.Version),
                    version = latest.Release.Version,
                    needs = manifest["needs"] is JsonArray a ? a.Select(n => (string?)n).OfType<string>().ToList() : null,
                    changeNote = latest.Release.ChangeNote,
                    reviewedAt = latest.Release.ReviewedAt,
                    reviewed = true,
                };
            })
            .OrderBy(e => e.name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return Results.Ok(entries);
    }

    private static async Task<IResult> GetListed(string pluginId, HttpRequest req, AppDbContext db)
    {
        var plugin = await db.HostedPlugins
            .AsNoTracking()
            .Include(p => p.Owner)
            .Include(p => p.Releases.Where(r => r.Status == PluginReleaseStatus.Approved))
            .FirstOrDefaultAsync(p => p.PluginId == pluginId);
        if (plugin is null || plugin.Releases.Count == 0) return Results.NotFound(new { error = "No such plugin." });

        var versions = NewestFirst(plugin.Releases).ToList();
        return Results.Ok(new
        {
            manifest = ServedRelease(req, plugin.PluginId, versions[0]),
            author = $"@{plugin.Owner.Username}",
            versions = versions.Select(r => new { r.Version, r.ChangeNote, r.ReviewedAt }),
        });
    }

    private static async Task<PluginRelease?> FindServable(AppDbContext db, string pluginId, string version) =>
        await db.PluginReleases
            .AsNoTracking()
            .Include(r => r.Plugin)
            .FirstOrDefaultAsync(r => r.Plugin.PluginId == pluginId && r.Version == version
                && (r.Status == PluginReleaseStatus.Approved || r.Status == PluginReleaseStatus.Unlisted));

    private static async Task<IResult> GetReleaseManifest(string pluginId, string version, HttpRequest req, AppDbContext db)
    {
        var r = await FindServable(db, pluginId, version);
        return r is null
            ? Results.NotFound(new { error = "No such version." })
            : Results.Ok(ServedRelease(req, pluginId, r));
    }

    private static async Task<IResult> GetReleaseBundle(string pluginId, string version, AppDbContext db)
    {
        var r = await FindServable(db, pluginId, version);
        return r is null
            ? Results.NotFound(new { error = "No such version." })
            : Results.Text(r.Source, PluginRules.ContentType(r.Plugin.Family));
    }

    private static async Task<IResult> GetByLink(string token, HttpRequest req, AppDbContext db)
    {
        var plugin = await db.HostedPlugins
            .AsNoTracking()
            .Include(p => p.Owner)
            .Include(p => p.Releases.Where(r => r.Status == PluginReleaseStatus.Approved || r.Status == PluginReleaseStatus.Unlisted))
            .FirstOrDefaultAsync(p => p.LinkToken == token);
        if (plugin is null || plugin.Releases.Count == 0) return Results.NotFound(new { error = "This link doesn't work any more." });

        var latest = NewestFirst(plugin.Releases).First();
        return Results.Ok(new
        {
            manifest = ServedRelease(req, plugin.PluginId, latest),
            author = $"@{plugin.Owner.Username}",
            reviewed = latest.Status == PluginReleaseStatus.Approved,
            changeNote = latest.ChangeNote,
        });
    }

    private static async Task<IResult> GetDraftManifest(string token, HttpRequest req, AppDbContext db)
    {
        var p = await db.HostedPlugins.AsNoTracking().Include(x => x.Owner).FirstOrDefaultAsync(x => x.DraftToken == token);
        if (p is null) return Results.NotFound(new { error = "No such draft." });
        return Results.Ok(DraftManifest(req, p));
    }

    /// The draft as an installable manifest. The bundle URL carries the hash so a changed draft
    /// is a new URL (no stale caches) and the phone refetches when the manifest changes.
    public static JsonObject DraftManifest(HttpRequest req, HostedPlugin p)
    {
        var (fields, _) = PluginRules.ReadDraft(p.Family, p.DraftManifestJson, p.DraftSource);
        var draftVersion = DraftVersion(p.DraftManifestJson);
        var stored = PluginRules.StoredManifest(p.PluginId, p.Family, draftVersion, $"@{p.Owner.Username}",
            fields with { Name = fields.Name.Length > 0 ? fields.Name : p.Name });
        var integrity = PluginRules.Integrity(p.DraftSource);
        var baseUrl = $"{BaseUrl(req)}/plugins/draft/{p.DraftToken}";
        var v = Uri.EscapeDataString(integrity[7..19]);
        return PluginRules.Served(stored, integrity, $"{baseUrl}/manifest.json", $"{baseUrl}/bundle?v={v}");
    }

    private static string DraftVersion(string manifestJson)
    {
        try
        {
            var v = (string?)(JsonNode.Parse(manifestJson) as JsonObject)?["version"];
            if (PluginRules.ParseVersion(v) is not null) return v!;
        }
        catch (System.Text.Json.JsonException) { }
        return "0.1.0";
    }

    private static async Task<IResult> GetDraftBundle(string token, AppDbContext db)
    {
        var p = await db.HostedPlugins.AsNoTracking().FirstOrDefaultAsync(x => x.DraftToken == token);
        return p is null ? Results.NotFound(new { error = "No such draft." }) : Results.Text(p.DraftSource, PluginRules.ContentType(p.Family));
    }

    // ── The owner's ──────────────────────────────────────────────────────────

    private static object MineDto(HostedPlugin p, HttpRequest req, bool withDraft) => new
    {
        pluginId = p.PluginId,
        family = p.Family,
        name = p.Name,
        draftUpdatedAtMs = p.DraftUpdatedAtMs,
        draftManifestJson = withDraft ? p.DraftManifestJson : null,
        draftSource = withDraft ? p.DraftSource : null,
        // What "Try on my phone" installs.
        draftManifest = withDraft ? DraftManifest(req, p) : null,
        linkToken = p.LinkToken,
        releases = NewestFirst(p.Releases).Select(r => new
        {
            r.Id,
            r.Version,
            status = r.Status.ToString().ToLowerInvariant(),
            r.ChangeNote,
            r.ReviewNote,
            r.SubmittedAt,
            r.ReviewedAt,
        }),
    };

    private static async Task<IResult> ListMine(ClaimsPrincipal caller, HttpRequest req, AppDbContext db)
    {
        var userId = caller.GetUserId();
        var plugins = await db.HostedPlugins
            .AsNoTracking()
            .Include(p => p.Owner)
            .Include(p => p.Releases)
            .Where(p => p.OwnerId == userId)
            .OrderByDescending(p => p.DraftUpdatedAtMs)
            .ToListAsync();
        return Results.Ok(new { plugins = plugins.Select(p => MineDto(p, req, withDraft: false)) });
    }

    private static Task<HostedPlugin?> FindMine(AppDbContext db, Guid userId, string pluginId) =>
        db.HostedPlugins
            .Include(p => p.Owner)
            .Include(p => p.Releases)
            .FirstOrDefaultAsync(p => p.OwnerId == userId && p.PluginId == pluginId);

    private static async Task<IResult> GetMine(string pluginId, ClaimsPrincipal caller, HttpRequest req, AppDbContext db)
    {
        var p = await FindMine(db, caller.GetUserId(), pluginId);
        return p is null ? Results.NotFound(new { error = "No such plugin." }) : Results.Ok(MineDto(p, req, withDraft: true));
    }

    private static async Task<IResult> CreatePlugin(
        [FromBody] CreatePluginRequest body, ClaimsPrincipal caller, HttpRequest req, AppDbContext db)
    {
        var userId = caller.GetUserId();
        if (PluginRules.CheckId(body.PluginId) is { } idError) return Results.BadRequest(new { error = idError });
        if (!PluginRules.IsFamily(body.Family)) return Results.BadRequest(new { error = "Pick a plugin type." });
        var (fields, error) = PluginRules.ReadDraft(body.Family, body.ManifestJson, body.Source);
        if (error is not null) return Results.BadRequest(new { error });

        if (await db.HostedPlugins.AnyAsync(p => p.PluginId == body.PluginId))
            return Results.Conflict(new { error = "Someone already has a plugin with that id. Try another." });

        var plugin = new HostedPlugin
        {
            OwnerId = userId,
            PluginId = body.PluginId,
            Family = body.Family,
            Name = fields.Name,
            DraftManifestJson = body.ManifestJson ?? "{}",
            DraftSource = body.Source ?? "",
            DraftUpdatedAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DraftToken = PluginRules.NewToken(),
        };
        db.HostedPlugins.Add(plugin);
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException)
        {
            return Results.Conflict(new { error = "Someone already has a plugin with that id. Try another." });
        }

        var created = await FindMine(db, userId, body.PluginId);
        return Results.Ok(MineDto(created!, req, withDraft: true));
    }

    private static async Task<IResult> SaveDraft(
        string pluginId, [FromBody] SaveDraftRequest body, ClaimsPrincipal caller, HttpRequest req, AppDbContext db)
    {
        var p = await FindMine(db, caller.GetUserId(), pluginId);
        if (p is null) return Results.NotFound(new { error = "No such plugin." });

        // Saving an older copy over a newer one (two tabs) would lose work; say so instead.
        if (body.BaseUpdatedAtMs is { } baseMs && baseMs < p.DraftUpdatedAtMs)
            return Results.Conflict(new { error = "This plugin was saved somewhere else since you opened it. Reload to see the newer copy." });

        var (fields, error) = PluginRules.ReadDraft(p.Family, body.ManifestJson, body.Source);
        if (error is not null) return Results.BadRequest(new { error });

        p.Name = fields.Name;
        p.DraftManifestJson = body.ManifestJson ?? "{}";
        p.DraftSource = body.Source ?? "";
        p.DraftUpdatedAtMs = Math.Max(p.DraftUpdatedAtMs + 1, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        await db.SaveChangesAsync();
        return Results.Ok(MineDto(p, req, withDraft: true));
    }

    private static async Task<IResult> DeletePlugin(string pluginId, ClaimsPrincipal caller, AppDbContext db)
    {
        var p = await FindMine(db, caller.GetUserId(), pluginId);
        if (p is null) return Results.NotFound(new { error = "No such plugin." });
        db.HostedPlugins.Remove(p);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> Publish(
        string pluginId, [FromBody] PublishRequest body, ClaimsPrincipal caller, HttpRequest req, AppDbContext db)
    {
        var p = await FindMine(db, caller.GetUserId(), pluginId);
        if (p is null) return Results.NotFound(new { error = "No such plugin." });

        var result = PluginPublishing.CreateRelease(p, body.Version, body.ChangeNote, body.Listed, DateTime.UtcNow);
        if (result.Error is not null) return Results.BadRequest(new { error = result.Error });

        // Added to its table explicitly: found only through the tracked plugin's list, EF takes
        // a row that already has its Guid for an existing one and UPDATEs nothing.
        db.PluginReleases.Add(result.Release!);
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException)
        {
            return Results.Conflict(new { error = "That version was just published from somewhere else. Use a newer one." });
        }
        return Results.Ok(MineDto(p, req, withDraft: true));
    }

    // ── Reviews (admin) ──────────────────────────────────────────────────────

    public static void MapPluginAdmin(RouteGroupBuilder api)
    {
        api.MapGet("/plugins", ListForReview);
        api.MapGet("/plugins/releases/{id:guid}", GetForReview);
        api.MapPost("/plugins/releases/{id:guid}/review", Review);
    }

    private static async Task<IResult> ListForReview(AppDbContext db, string? status)
    {
        var q = db.PluginReleases.AsNoTracking();
        if (status != "all") q = q.Where(r => r.Status == PluginReleaseStatus.Pending);
        var rows = await q
            .OrderBy(r => r.SubmittedAt)
            .Take(200)
            .Select(r => new
            {
                r.Id,
                r.Plugin.PluginId,
                r.Plugin.Family,
                r.Plugin.Name,
                r.Version,
                Status = r.Status.ToString(),
                r.ChangeNote,
                r.ReviewNote,
                r.SubmittedAt,
                r.ReviewedAt,
                Owner = r.Plugin.Owner.Username,
                Chars = r.Source.Length,
            })
            .ToListAsync();
        return Results.Ok(new { releases = rows });
    }

    private static async Task<IResult> GetForReview(Guid id, AppDbContext db)
    {
        var r = await db.PluginReleases
            .AsNoTracking()
            .Where(x => x.Id == id)
            .Select(x => new
            {
                x.Id,
                x.HostedPluginId,
                x.Plugin.PluginId,
                x.Plugin.Family,
                x.Version,
                Status = x.Status.ToString(),
                x.ManifestJson,
                x.Source,
                x.Integrity,
                x.ChangeNote,
                x.ReviewNote,
                x.SubmittedAt,
                Owner = x.Plugin.Owner.Username,
            })
            .FirstOrDefaultAsync();
        if (r is null) return Results.NotFound(new { error = "No such version." });

        // The last approved version, so a reviewer can see what changed. A second query: as a
        // subquery it needs SQL APPLY, which SQLite (self-hosted servers) doesn't have.
        var previous = await db.PluginReleases
            .AsNoTracking()
            .Where(o => o.HostedPluginId == r.HostedPluginId && o.Id != r.Id && o.Status == PluginReleaseStatus.Approved)
            .OrderByDescending(o => o.SubmittedAt)
            .Select(o => new { o.Version, o.Source })
            .FirstOrDefaultAsync();

        return Results.Ok(new
        {
            r.Id, r.PluginId, r.Family, r.Version, r.Status, r.ManifestJson, r.Source, r.Integrity,
            r.ChangeNote, r.ReviewNote, r.SubmittedAt, r.Owner, Previous = previous,
        });
    }

    private static async Task<IResult> Review(
        Guid id, [FromBody] ReviewRequest body, AppDbContext db, IEmailSender email, ILoggerFactory loggerFactory)
    {
        var r = await db.PluginReleases.Include(x => x.Plugin).ThenInclude(p => p.Owner).FirstOrDefaultAsync(x => x.Id == id);
        if (r is null) return Results.NotFound(new { error = "No such version." });

        var error = PluginPublishing.Review(r, body.Approve, body.Note, DateTime.UtcNow);
        if (error is not null) return Results.BadRequest(new { error });
        await db.SaveChangesAsync();

        // Tell the owner. A failed email doesn't undo the review: they also see it on My plugins.
        var owner = r.Plugin.Owner;
        if (email.IsConfigured && !string.IsNullOrWhiteSpace(owner.Email))
        {
            try
            {
                var subject = body.Approve
                    ? $"{r.Plugin.Name} {r.Version} is now in LogIt's plugins"
                    : $"{r.Plugin.Name} {r.Version} needs a change before it's listed";
                var text = body.Approve
                    ? $"Hi {owner.DisplayName},\n\nYour plugin {r.Plugin.Name} (version {r.Version}) passed review and is now listed in Browse on the phone and the dashboard.\n"
                      + (string.IsNullOrWhiteSpace(r.ReviewNote) ? "" : $"\nNote from the review:\n{r.ReviewNote}\n")
                    : $"Hi {owner.DisplayName},\n\nYour plugin {r.Plugin.Name} (version {r.Version}) wasn't listed yet. What to change:\n\n{r.ReviewNote}\n\nOpen it from Plugins > My plugins on the dashboard, fix it and publish a new version.\n";
                await email.SendAsync(owner.Email, subject, text);
            }
            catch (Exception ex)
            {
                loggerFactory.CreateLogger("Logit.Plugins").LogWarning(
                    "Plugin review email to {UserId} failed: {Reason}", owner.Id, ex.Message);
            }
        }
        return Results.NoContent();
    }
}

public record CreatePluginRequest(string PluginId, string Family, string? ManifestJson, string? Source);
public record SaveDraftRequest(string? ManifestJson, string? Source, long? BaseUpdatedAtMs = null);
public record PublishRequest(string Version, string? ChangeNote, bool Listed);
public record ReviewRequest(bool Approve, string? Note);
