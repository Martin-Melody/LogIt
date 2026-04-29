import { browser } from "$app/environment";
import type { PluginManifest } from "./types";
import {
  buildPluginPublishPackage,
  type PluginAnnouncementInput,
  type PluginPublishPackage,
} from "./publish";

const STORAGE_KEY = "logit:plugins:publish-queue:v1";

export type PublishQueueStatus = "queued" | "published";

export type PublishQueueItem = {
  id: string;
  createdAtMs: number;
  updatedAtMs: number;
  status: PublishQueueStatus;
  package: PluginPublishPackage;
};

export type EnqueuePublishInput = PluginAnnouncementInput & {
  pluginName?: string;
};

function load(): PublishQueueItem[] {
  if (!browser) return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PublishQueueItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(items: PublishQueueItem[]): void {
  if (!browser) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function makeId(): string {
  return `publish-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function listPublishQueue(): PublishQueueItem[] {
  return load();
}

export function getPublishQueueItem(id: string): PublishQueueItem | null {
  return load().find((item) => item.id === id) ?? null;
}

export function enqueuePublish(input: EnqueuePublishInput): PublishQueueItem {
  const items = load();
  const next: PublishQueueItem = {
    id: makeId(),
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    status: "queued",
    package: buildPluginPublishPackage({
      actorUrl: input.actorUrl,
      manifest: input.manifest,
    }),
  };

  save([next, ...items]);
  return next;
}

export function markPublishQueueItemPublished(id: string): PublishQueueItem | null {
  const items = load();
  let nextItem: PublishQueueItem | null = null;
  const next = items.map((item) => {
    if (item.id !== id) return item;
    nextItem = {
      ...item,
      status: "published",
      updatedAtMs: Date.now(),
    };
    return nextItem;
  });

  save(next);
  return nextItem;
}

export function removePublishQueueItem(id: string): void {
  const items = load();
  save(items.filter((item) => item.id !== id));
}

export function clearPublishQueue(): void {
  save([]);
}

export function serializePublishPackage(item: PublishQueueItem): string {
  return JSON.stringify(item.package, null, 2);
}

export function summarizePublishQueueItem(item: PublishQueueItem): string {
  const manifest = item.package.manifest;
  return `${manifest.name} (${manifest.family})`;
}

export function getPublishQueueManifest(item: PublishQueueItem): PluginManifest {
  return item.package.manifest;
}
