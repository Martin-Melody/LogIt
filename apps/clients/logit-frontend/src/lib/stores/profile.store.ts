import { browser } from "$app/environment";
import { writable } from "svelte/store";
import { isNativePlatform } from "$lib/platform/isNative";
import { pushProfile, setProfileUpdatedAtMs, buildRemoteProfile } from "$lib/sync/syncService";

export type UserProfile = {
  name: string;
  bio: string;
  avatarDataUrl?: string;
  progressPhotoDataUrl?: string;
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
      progressPhotoDataUrl: string | null;
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
        progressPhotoDataUrl: account.progressPhotoDataUrl ?? undefined,
        height: account.height,
        heightUnit: account.heightUnit,
        weight: account.weight,
        weightUnit: account.weightUnit,
        blocksCollapsedByDefault: account.blocksCollapsedByDefault,
        restDefaults,
      });
    },

    save(patch: Partial<UserProfile>) {
      applyLocally(patch);

      if (browser) {
        // Async, so after applyLocally()'s store.update() above — buildRemoteProfile() reads
        // the store via get(profile), which must see the patched value, not the pre-patch
        // one. Built through the shared builder (not a one-off literal here) because the
        // server stores this as one replace-on-write blob: a literal missing a field (e.g.
        // activeSplitId, which this patch knows nothing about) would silently wipe that
        // field for the next puller.
        void (async () => {
          const remote = await buildRemoteProfile();
          pushProfile(remote);
          setProfileUpdatedAtMs(remote.updatedAtMs);
        })();
      }
    },

    /**
     * Apply a profile pulled from the server, without pushing it straight back.
     * pullAndApplyProfile() (syncService.ts) used to call save() for this, which — like
     * every local edit — always re-pushes with a fresh Date.now() timestamp. That meant
     * every routine background sync silently re-pushed the *just-downloaded* data stamped as
     * if it were newer, which could race with and clobber a real edit made around the same
     * time (this is exactly what let a widget-layout toggle vanish after a reinstall: a
     * background sync's pull-triggered re-push landed with a newer timestamp than the
     * user's own edit, using the state a moment before it). A pull should only ever update
     * local state — never fabricate a new "edit."
     */
    applyRemote(patch: Partial<UserProfile>) {
      applyLocally(patch);
    },
  };

  function applyLocally(patch: Partial<UserProfile>): void {
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
            if (patch.progressPhotoDataUrl !== undefined)    accountPatch.progressPhotoDataUrl = patch.progressPhotoDataUrl;
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

      return next;
    });
  }
}

export const profile = createProfileStore();
