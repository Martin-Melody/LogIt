import type {
  AnalyticsPluginCapability,
  ExercisePackPluginCapability,
  InstalledPlugin,
  PluginCapability,
  PluginDistribution,
  PluginFamily,
  PluginManifest,
  ProgressionAlgorithmPluginCapability,
  WidgetPluginCapability,
} from "./types";

export type PluginImportSource =
  | {
      kind: "url";
      url: string;
    }
  | {
      kind: "activitypub";
      actorUrl: string;
    }
  | {
      kind: "json";
      json: string;
    };

function isString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function toAbsoluteUrl(url: string, base: string): string {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

function extractUrlsFromString(value: string): string[] {
  const matches = value.match(/https?:\/\/[^\s"'<>)]*/g);
  return matches ? matches : [];
}

function extractCandidateUrls(value: unknown, baseUrl?: string): string[] {
  const urls = new Set<string>();

  function visit(node: unknown): void {
    if (!node) return;

    if (typeof node === "string") {
      for (const url of extractUrlsFromString(node)) {
        urls.add(baseUrl ? toAbsoluteUrl(url, baseUrl) : url);
      }
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }

    if (!isObject(node)) return;

    for (const [key, raw] of Object.entries(node)) {
      if (typeof raw === "string") {
        if (key === "href" || key === "url" || key === "manifestUrl") {
          urls.add(baseUrl ? toAbsoluteUrl(raw, baseUrl) : raw);
        }
        for (const url of extractUrlsFromString(raw)) {
          urls.add(baseUrl ? toAbsoluteUrl(url, baseUrl) : url);
        }
      } else if (Array.isArray(raw) || isObject(raw)) {
        visit(raw);
      }
    }
  }

  visit(value);
  return [...urls];
}

function pickFirstObject(value: unknown): Record<string, unknown> | null {
  if (isObject(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (isObject(item)) return item;
    }
  }
  return null;
}

function getIdOrString(value: unknown): string | null {
  if (isString(value)) return value;
  const object = pickFirstObject(value);
  if (object && isString(object.id)) return object.id;
  return null;
}

function isPluginFamily(v: unknown): v is PluginFamily {
  return (
    v === "widget" ||
    v === "progression-algorithm" ||
    v === "exercise-pack" ||
    v === "analytics" ||
    v === "nutrition-algorithm" ||
    v === "nutrition-analytics"
  );
}

function isPluginDistribution(v: unknown): v is PluginDistribution {
  if (!v || typeof v !== "object") return false;
  const record = v as Record<string, unknown>;
  switch (record.origin) {
    case "builtin":
      return true;
    case "manual":
      return true;
    case "url":
      return isString(record.manifestUrl);
    case "activitypub":
      return isString(record.actorUrl);
    case "inline":
      return record.data !== undefined && record.data !== null;
    default:
      return false;
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/activity+json, application/ld+json, application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url} (${res.status})`);
  }
  return (await res.json()) as unknown;
}

function isWidgetCapability(v: unknown): v is WidgetPluginCapability {
  if (!v || typeof v !== "object") return false;
  const record = v as Record<string, unknown>;
  return record.family === "widget" && isString(record.widgetId) && record.slot === "home";
}

function isProgressionCapability(
  v: unknown,
): v is ProgressionAlgorithmPluginCapability {
  if (!v || typeof v !== "object") return false;
  const record = v as Record<string, unknown>;
  return record.family === "progression-algorithm" && isString(record.algorithmId);
}

function isExercisePackCapability(v: unknown): v is ExercisePackPluginCapability {
  if (!v || typeof v !== "object") return false;
  const record = v as Record<string, unknown>;
  return record.family === "exercise-pack" && isString(record.exercisePackId);
}

function isAnalyticsCapability(v: unknown): v is AnalyticsPluginCapability {
  if (!v || typeof v !== "object") return false;
  const record = v as Record<string, unknown>;
  return record.family === "analytics" && isString(record.analyticsId);
}

function isNutritionAlgorithmCapability(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const record = v as Record<string, unknown>;
  return record.family === "nutrition-algorithm" && isString(record.algorithmId);
}

function isNutritionAnalyticsCapability(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const record = v as Record<string, unknown>;
  return record.family === "nutrition-analytics" && isString(record.analyticsId);
}

function isPluginCapability(v: unknown): v is PluginCapability {
  return (
    isWidgetCapability(v) ||
    isProgressionCapability(v) ||
    isExercisePackCapability(v) ||
    isAnalyticsCapability(v) ||
    isNutritionAlgorithmCapability(v) ||
    isNutritionAnalyticsCapability(v)
  );
}

export function isPluginManifest(v: unknown): v is PluginManifest {
  if (!v || typeof v !== "object") return false;
  const record = v as Record<string, unknown>;
  return (
    isString(record.id) &&
    isPluginFamily(record.family) &&
    isString(record.name) &&
    isString(record.description) &&
    isString(record.version) &&
    (record.integrity === undefined ||
      (typeof record.integrity === "string" && record.integrity.startsWith("sha256-"))) &&
    (record.minAppVersion === undefined || isString(record.minAppVersion)) &&
    isPluginDistribution(record.distribution) &&
    Array.isArray(record.capabilities) &&
    record.capabilities.every(isPluginCapability)
  );
}

export function normalizeImportedManifest(
  manifest: PluginManifest,
  source: PluginImportSource,
): PluginManifest {
  // A self-contained inline pack carries its own data — never rewrite its
  // distribution, no matter how it was imported.
  if (manifest.distribution.origin === "inline") {
    return manifest;
  }

  if (source.kind === "url") {
    return {
      ...manifest,
      sourceUrl: manifest.sourceUrl ?? source.url,
      distribution: {
        origin: "url",
        manifestUrl: source.url,
        bundleUrl:
          manifest.distribution.origin === "url"
            ? manifest.distribution.bundleUrl
            : undefined,
      },
    };
  }

  if (source.kind === "activitypub") {
    return {
      ...manifest,
      sourceUrl: manifest.sourceUrl ?? source.actorUrl,
      fediverse: {
        handle: manifest.fediverse?.handle,
        actorUrl: manifest.fediverse?.actorUrl ?? source.actorUrl,
        inboxUrl: manifest.fediverse?.inboxUrl,
        outboxUrl: manifest.fediverse?.outboxUrl,
        profileUrl: manifest.fediverse?.profileUrl ?? source.actorUrl,
      },
      distribution: {
        origin: "activitypub",
        actorUrl: source.actorUrl,
        manifestUrl:
          manifest.distribution.origin === "url"
            ? manifest.distribution.manifestUrl
            : manifest.distribution.origin === "activitypub"
              ? manifest.distribution.manifestUrl
              : source.actorUrl,
        bundleUrl:
          manifest.distribution.origin === "url"
            ? manifest.distribution.bundleUrl
            : manifest.distribution.origin === "activitypub"
              ? manifest.distribution.bundleUrl
              : undefined,
      },
    };
  }

  return {
    ...manifest,
    distribution:
      manifest.distribution.origin === "builtin"
        ? { origin: "manual" }
        : manifest.distribution.origin === "manual"
          ? manifest.distribution
          : {
              origin: "manual",
              sourceUrl: manifest.sourceUrl,
              bundleUrl:
                manifest.distribution.origin === "url"
                  ? manifest.distribution.bundleUrl
                  : manifest.distribution.origin === "activitypub"
                    ? manifest.distribution.bundleUrl
                    : undefined,
        },
  };
}

async function resolvePluginManifestFromActorUrl(actorUrl: string): Promise<PluginManifest> {
  const actor = pickFirstObject(await fetchJson(actorUrl));
  if (!actor) {
    throw new Error("Invalid ActivityPub actor");
  }

  const outboxUrl = getIdOrString(actor.outbox);
  const candidateUrls = new Set<string>();

  for (const url of extractCandidateUrls(actor, actorUrl)) {
    candidateUrls.add(url);
  }

  if (outboxUrl && isString(outboxUrl)) {
    const outbox = pickFirstObject(await fetchJson(toAbsoluteUrl(outboxUrl, actorUrl)));
    if (outbox) {
      const first = getIdOrString(outbox.first);
      const pageUrl = first ? toAbsoluteUrl(first, actorUrl) : null;
      if (pageUrl) {
        const page = pickFirstObject(await fetchJson(pageUrl));
        if (page?.orderedItems) {
          for (const url of extractCandidateUrls(page.orderedItems, actorUrl)) {
            candidateUrls.add(url);
          }
        }
      }
    }
  }

  for (const manifestUrl of candidateUrls) {
    try {
      const manifest = await resolvePluginManifest({ kind: "url", url: manifestUrl });
      return normalizeImportedManifest(manifest, { kind: "activitypub", actorUrl });
    } catch {
      continue;
    }
  }

  throw new Error("No plugin manifest found on ActivityPub actor");
}

export async function resolvePluginManifest(
  source: PluginImportSource,
): Promise<PluginManifest> {
  let payload: unknown;

  if (source.kind === "url") {
    payload = await fetchJson(source.url);
  } else if (source.kind === "activitypub") {
    return resolvePluginManifestFromActorUrl(source.actorUrl);
  } else {
    payload = JSON.parse(source.json) as unknown;
  }

  if (!isPluginManifest(payload)) {
    throw new Error("Invalid plugin manifest");
  }

  return normalizeImportedManifest(payload, source);
}

export function describeInstalledPlugin(plugin: InstalledPlugin): string {
  const origin = plugin.manifest.distribution.origin;
  switch (origin) {
    case "builtin":
      return "Built in";
    case "manual":
      return "Manual install";
    case "url":
      return "Imported from URL";
    case "activitypub":
      return "Imported from fediverse";
    case "inline":
      return "Imported from file";
  }
}
