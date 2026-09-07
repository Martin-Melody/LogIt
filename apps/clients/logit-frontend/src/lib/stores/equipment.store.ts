import { browser } from "$app/environment";
import { writable } from "svelte/store";
import type { BarbellConfig } from "@logit/core/domain/plates";
import { DEFAULT_BARBELL } from "@logit/core/domain/plates";

/**
 * Gym equipment config — barbell weight + available plates. Kept in localStorage,
 * NOT synced through the profile: it's device / gym specific, and the profile
 * sync path (account row → remote → .NET API) isn't worth the plumbing for it.
 * All weights are kg (canonical); the UI converts for display.
 */

export type EquipmentConfig = {
  barbell: BarbellConfig;
};

const STORAGE_KEY = "logit:equipment:v1";

export const defaultEquipment: EquipmentConfig = {
  barbell: { ...DEFAULT_BARBELL, platesKg: [...DEFAULT_BARBELL.platesKg] },
};

function load(): EquipmentConfig {
  if (!browser) return defaultEquipment;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultEquipment;
    const parsed = JSON.parse(raw) as { barbell?: Partial<BarbellConfig> };
    const bar: Partial<BarbellConfig> = parsed.barbell ?? {};
    return {
      barbell: {
        barKg: typeof bar.barKg === "number" && bar.barKg > 0 ? bar.barKg : DEFAULT_BARBELL.barKg,
        platesKg:
          Array.isArray(bar.platesKg) && bar.platesKg.length > 0
            ? bar.platesKg.filter((p): p is number => typeof p === "number" && p > 0)
            : [...DEFAULT_BARBELL.platesKg],
      },
    };
  } catch {
    return defaultEquipment;
  }
}

function createEquipmentStore() {
  const store = writable<EquipmentConfig>(load());

  return {
    subscribe: store.subscribe,
    save(patch: Partial<EquipmentConfig>) {
      store.update((cur) => {
        const next = { ...cur, ...patch };
        if (browser) {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {}
        }
        return next;
      });
    },
    reset() {
      this.save({ barbell: { ...DEFAULT_BARBELL, platesKg: [...DEFAULT_BARBELL.platesKg] } });
    },
  };
}

export const equipment = createEquipmentStore();
