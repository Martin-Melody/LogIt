import { browser } from "$app/environment";
import { writable } from "svelte/store";
import { isNativePlatform } from "$lib/platform/isNative";
import { pushProfile, setProfileUpdatedAtMs } from "$lib/sync/syncService";
import { getNavConfigJson } from "$lib/stores/navConfig.store";
import type { RemoteProfile } from "$lib/api/syncApi";

export type UserProfile = {
  name: string;
  bio: string;
  avatarDataUrl?: string;
  height: number | null;
  heightUnit: "cm" | "in";
  weight: number | null;
  weightUnit: "kg" | "lbs";
  blocksCollapsedByDefault: boolean;
  restDefaults: Record<string, number | undefined>;
};

const STORAGE_KEY = "logit:profile:v1";

const defaultRestDefaults: Record<string, number | undefined> = {
  normal:  90_000,
  warmup:  undefined,
  dropset: 30_000,
  amrap:   undefined,
  failure: 90_000,
};

export const defaultProfile: UserProfile = {
  name: "",
  bio: "",
  height: null,
  heightUnit: "cm",
  weight: null,
  weightUnit: "kg",
  blocksCollapsedByDefault: true,
  restDefaults: defaultRestDefaults,
};

function loadFromStorage(): UserProfile {
  if (!browser) return { ...defaultProfile };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultProfile };
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    return {
      ...defaultProfile,
      ...parsed,
      restDefaults: { ...defaultRestDefaults, ...(parsed.restDefaults ?? {}) },
    };
  } catch {
    return { ...defaultProfile };
  }
}

// Lazily imported on native to avoid loading SQLite on web
let _nativeRepo: typeof import("$lib/data/localAccountRepo") | null = null;
let _getOwnerId: (() => string | null) | null = null;

function createProfileStore() {
  const store = writable<UserProfile>(loadFromStorage());

  return {
    subscribe: store.subscribe,

    /** Called by initRepos() on native after SQLite and local account are ready. */
    initFromLocalAccount(account: {
      displayName: string;
      bio: string;
      avatarDataUrl: string | null;
      height: number | null;
      heightUnit: "cm" | "in";
      weight: number | null;
      weightUnit: "kg" | "lbs";
      blocksCollapsedByDefault: boolean;
      restDefaultsJson: string;
    }, nativeRepo: typeof import("$lib/data/localAccountRepo"), getOwnerId: () => string | null) {
      _nativeRepo = nativeRepo;
      _getOwnerId = getOwnerId;

      let restDefaults: Record<string, number | undefined> = { ...defaultRestDefaults };
      try { restDefaults = { ...restDefaults, ...JSON.parse(account.restDefaultsJson) }; } catch {}

      store.set({
        name: account.displayName,
        bio: account.bio,
        avatarDataUrl: account.avatarDataUrl ?? undefined,
        height: account.height,
        heightUnit: account.heightUnit,
        weight: account.weight,
        weightUnit: account.weightUnit,
        blocksCollapsedByDefault: account.blocksCollapsedByDefault,
        restDefaults,
      });
    },

    save(patch: Partial<UserProfile>) {
      store.update((p) => {
        const next = { ...p, ...patch };

        if (browser) {
          if (isNativePlatform() && _nativeRepo && _getOwnerId) {
            const ownerId = _getOwnerId();
            if (ownerId) {
              const accountPatch: Record<string, unknown> = {};
              if (patch.name !== undefined)                    accountPatch.displayName = patch.name;
              if (patch.bio !== undefined)                     accountPatch.bio = patch.bio;
              if (patch.avatarDataUrl !== undefined)           accountPatch.avatarDataUrl = patch.avatarDataUrl;
              if (patch.height !== undefined)                  accountPatch.height = patch.height;
              if (patch.heightUnit !== undefined)              accountPatch.heightUnit = patch.heightUnit;
              if (patch.weight !== undefined)                  accountPatch.weight = patch.weight;
              if (patch.weightUnit !== undefined)              accountPatch.weightUnit = patch.weightUnit;
              if (patch.blocksCollapsedByDefault !== undefined) accountPatch.blocksCollapsedByDefault = patch.blocksCollapsedByDefault;
              if (patch.restDefaults !== undefined)            accountPatch.restDefaultsJson = JSON.stringify(patch.restDefaults);

              _nativeRepo.updateLocalAccount(ownerId, accountPatch as Parameters<typeof _nativeRepo.updateLocalAccount>[1]).catch(console.error);
            }
          } else {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          }
        }

        if (browser) {
          const updatedAtMs = Date.now();
          const remote: RemoteProfile = {
            displayName: next.name,
            bio: next.bio,
            avatarDataUrl: next.avatarDataUrl ?? null,
            height: next.height,
            heightUnit: next.heightUnit,
            weight: next.weight,
            weightUnit: next.weightUnit,
            blocksCollapsedByDefault: next.blocksCollapsedByDefault,
            restDefaultsJson: JSON.stringify(next.restDefaults),
            navConfigJson: getNavConfigJson(),
            updatedAtMs,
          };
          pushProfile(remote);
          setProfileUpdatedAtMs(updatedAtMs);
        }

        return next;
      });
    },
  };
}

export const profile = createProfileStore();
