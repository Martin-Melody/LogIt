// Places you train on this phone (My gym, design canvas G1–G10): kept per account, pushed to
// the server when they change and pulled on every sync, newest wins (server /sync/places,
// same rules as habits). A change made offline is remembered and pushed on the next sync.
//
// The first time this loads for an account with no places, the machines kept on exercises
// move into one place called "My gym" (core placeFromExerciseMachines), so nothing is lost.
import { browser } from "$app/environment";
import { getAccountItem, setAccountItem } from "$lib/data/accountStorage";
import { onActiveOwnerChange } from "$lib/data/activeOwner";
import { getExerciseRepo } from "$lib/data/repoProvider";
import { apiClient } from "@logit/core/api/client";
import { syncApi, type RemotePlace } from "@logit/core/api/syncApi";
import { log } from "@logit/core/platform/log";
import {
  activePlaces, defaultPlaceFor, machinesFor, placeFromExerciseMachines, type Place, type PlaceMachine,
} from "@logit/core/domain/place";

const KEY = "logit:places:v1";
/** Place ids changed here and not yet accepted by the server. */
const DIRTY_KEY = "logit:places-dirty:v1";
const PULLED_KEY = "logit:places-pulled-at:v1";
const MIGRATED_KEY = "logit:places-migrated:v1";
/** The place the last workout was at (no location is ever used). */
const LAST_USED_KEY = "logit:places-last-used:v1";
/** "Don't ask me this" on "Where are you today?" (G9). */
const ASK_KEY = "logit:places-ask:v1";

function read<T>(key: string, fallback: T): T {
  if (!browser) return fallback;
  try {
    const raw = getAccountItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    setAccountItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable: kept in memory for this run */
  }
}

function toRow(p: Place, deletedAtMs?: number): RemotePlace {
  return {
    id: p.id,
    createdAtMs: p.createdAtMs,
    updatedAtMs: p.updatedAtMs,
    dataJson: deletedAtMs ? null : JSON.stringify(p),
    deletedAtMs: deletedAtMs ?? null,
  };
}

function createPlacesStore() {
  let places = $state<Place[]>(read<Place[]>(KEY, []));

  function persist() {
    write(KEY, places);
  }

  function markDirty(id: string) {
    const dirty = new Set(read<string[]>(DIRTY_KEY, []));
    dirty.add(id);
    write(DIRTY_KEY, [...dirty]);
  }

  async function push(rows: RemotePlace[]): Promise<boolean> {
    if (!apiClient.isAuthenticated() || rows.length === 0) return rows.length === 0;
    try {
      await syncApi.pushPlaces(rows);
      const dirty = new Set(read<string[]>(DIRTY_KEY, []));
      for (const r of rows) dirty.delete(r.id);
      write(DIRTY_KEY, [...dirty]);
      return true;
    } catch (e) {
      log.warn("places", "push failed; will retry on the next sync", { error: e });
      return false;
    }
  }

  return {
    get all() { return places; },
    get active() { return activePlaces(places); },
    byId(id: string | null | undefined): Place | null {
      return id ? places.find((p) => p.id === id) ?? null : null;
    },

    /** Add or change a place (stamps updatedAtMs) and push it. */
    save(place: Place) {
      const next = { ...place, updatedAtMs: Date.now() };
      const i = places.findIndex((p) => p.id === next.id);
      places = i >= 0 ? places.map((p, j) => (j === i ? next : p)) : [...places, next];
      persist();
      markDirty(next.id);
      void push([toRow(next)]);
      return next;
    },

    /** The gym closed, or you moved: kept for history, no longer offered. */
    archive(id: string) {
      const p = this.byId(id);
      if (p) this.save({ ...p, archivedAtMs: Date.now() });
    },

    /** Gone for good (a place made by mistake). */
    remove(id: string) {
      const p = this.byId(id);
      if (!p) return;
      places = places.filter((x) => x.id !== id);
      persist();
      const now = Date.now();
      void push([toRow({ ...p, updatedAtMs: now }, now)]);
    },

    /** Machines at a place for an exercise (none without a place). */
    machinesFor(placeId: string | null | undefined, exerciseId: string): PlaceMachine[] {
      return machinesFor(this.byId(placeId), exerciseId);
    },

    /** The place a workout starts at before anyone is asked (G9). */
    defaultFor(date = new Date()): Place | null {
      const weekday = ((date.getDay() + 6) % 7) + 1;
      return defaultPlaceFor(places, weekday, read<string | null>(LAST_USED_KEY, null));
    },
    rememberUsed(placeId: string | null) {
      write(LAST_USED_KEY, placeId);
    },
    /** Whether to ask "Where are you today?": two or more places, and not turned off. */
    get shouldAsk() {
      return activePlaces(places).length >= 2 && read<boolean>(ASK_KEY, true);
    },
    /** The "Where are you today?" switch itself (Settings › Your places). */
    get askEnabled() {
      return read<boolean>(ASK_KEY, true);
    },
    setAsk(on: boolean) {
      write(ASK_KEY, on);
    },

    /** Moves machines kept on exercises into "My gym", once per account. */
    async migrateExerciseMachines(): Promise<Place | null> {
      if (read<boolean>(MIGRATED_KEY, false)) return null;
      write(MIGRATED_KEY, true);
      if (places.length > 0) return null;
      try {
        const exercises = await getExerciseRepo().list();
        const place = placeFromExerciseMachines(exercises);
        return place ? this.save(place) : null;
      } catch (e) {
        log.warn("places", "moving exercise machines into a place failed", { error: e });
        return null;
      }
    },

    /** Called by sync: push what's waiting, then pull and keep the newest of each place. */
    async sync(): Promise<boolean> {
      if (!apiClient.isAuthenticated()) return true;
      const dirty = new Set(read<string[]>(DIRTY_KEY, []));
      const waiting = places.filter((p) => dirty.has(p.id)).map((p) => toRow(p));
      if (waiting.length) await push(waiting);
      try {
        const since = read<number>(PULLED_KEY, 0);
        const { places: rows } = await syncApi.pullPlaces(since);
        let changed = false;
        for (const r of rows) {
          const i = places.findIndex((p) => p.id === r.id);
          if (r.deletedAtMs || !r.dataJson) {
            if (i >= 0) { places = places.filter((p) => p.id !== r.id); changed = true; }
            continue;
          }
          const remote = JSON.parse(r.dataJson) as Place;
          if (i >= 0 && places[i]!.updatedAtMs >= remote.updatedAtMs) continue;
          places = i >= 0 ? places.map((p, j) => (j === i ? remote : p)) : [...places, remote];
          changed = true;
        }
        if (changed) persist();
        write(PULLED_KEY, Date.now());
        return true;
      } catch (e) {
        log.warn("places", "pull failed", { error: e });
        return false;
      }
    },

    /** Everything on this phone, for when sync newly becomes available. */
    async pushAll(): Promise<void> {
      await push(places.map((p) => toRow(p)));
    },

    reload() {
      places = read<Place[]>(KEY, []);
    },
  };
}

export const placesStore = createPlacesStore();
if (browser) onActiveOwnerChange(() => placesStore.reload());
