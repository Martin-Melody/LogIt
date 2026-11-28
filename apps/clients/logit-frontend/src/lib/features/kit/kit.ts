// What you bring (canvas EQ4), kept per account and synced in the profile so a coach sees it.
import { writable } from "svelte/store";
import { getAccountItem, setAccountItem } from "$lib/data/accountStorage";
import { parseKit, type BringItem } from "@logit/core/domain/kit";

const KEY = "logit:kit";
export const kit = writable<BringItem[]>(load());

function load(): BringItem[] {
  try { return parseKit(getAccountItem(KEY)); } catch { return []; }
}
export function getKitJson(): string {
  return JSON.stringify(load());
}
export function setKit(next: BringItem[]): void {
  try { setAccountItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  kit.set(next);
}
export function setKitFromJson(json: string | null | undefined): void {
  if (json != null) setKit(parseKit(json));
}
/** "new" | "under2" | "2plus" | "compete" from the LogIt setup, or null. */
export function getExperience(): string | null {
  try { return (JSON.parse(getAccountItem("logit:onboarding:answers") ?? "{}") as { experience?: string }).experience ?? null; } catch { return null; }
}
