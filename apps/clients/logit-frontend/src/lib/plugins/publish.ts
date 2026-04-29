import type { PluginManifest } from "./types";

export type PluginAnnouncementInput = {
  actorUrl: string;
  manifest: PluginManifest;
};

export type PluginAnnouncementPayload = {
  "@context": string;
  id: string;
  type: "Create";
  actor: string;
  to: string[];
  cc: string[];
  object: {
    id: string;
    type: "Note";
    name: string;
    content: string;
    url?: string;
    attachment: Array<{
      type: "Link";
      mediaType: string;
      name: string;
      href: string;
    }>;
  };
};

export type PluginPublishPackage = {
  version: 1;
  actorUrl: string;
  manifest: PluginManifest;
  announcement: PluginAnnouncementPayload;
};

function deriveManifestUrl(manifest: PluginManifest): string | null {
  if (manifest.sourceUrl) return manifest.sourceUrl;
  switch (manifest.distribution.origin) {
    case "url":
      return manifest.distribution.manifestUrl;
    case "activitypub":
      return manifest.distribution.manifestUrl ?? manifest.distribution.actorUrl;
    default:
      return null;
  }
}

export function buildPluginAnnouncement(
  input: PluginAnnouncementInput,
): PluginAnnouncementPayload {
  const manifestUrl = deriveManifestUrl(input.manifest);
  const pluginId = input.manifest.id;
  const postId = `${input.actorUrl.replace(/#.*$/, "")}#plugin-${pluginId}`;

  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: postId,
    type: "Create",
    actor: input.actorUrl,
    to: ["https://www.w3.org/ns/activitystreams#Public"],
    cc: [],
    object: {
      id: `${postId}:object`,
      type: "Note",
      name: `${input.manifest.name} plugin`,
      content:
        `New plugin published: ${input.manifest.name} (${input.manifest.family}) ` +
        `v${input.manifest.version}.`,
      url: manifestUrl ?? undefined,
      attachment: manifestUrl
        ? [
            {
              type: "Link",
              mediaType: "application/json",
              name: "Plugin manifest",
              href: manifestUrl,
            },
          ]
        : [],
    },
  };
}

export function buildPluginPublishPackage(
  input: PluginAnnouncementInput,
): PluginPublishPackage {
  return {
    version: 1,
    actorUrl: input.actorUrl,
    manifest: input.manifest,
    announcement: buildPluginAnnouncement(input),
  };
}
