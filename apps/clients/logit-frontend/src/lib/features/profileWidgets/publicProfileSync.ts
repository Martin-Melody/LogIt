// Your profile is one record on your account (design canvas row 21): name, bio, photo and which
// training cards show, in what order. The phone and the web app both edit that record; the phone
// keeps a copy for offline and fills in the cards' numbers, because only it has the training data.
//
// - saveProfile(): an edit made on this phone. Applied here at once, sent to the account, and
//   remembered until it's sent (offline, it goes with the next sync).
// - syncOwnProfile(): sends anything unsent, takes the account's name/bio/photo/card layout (an
//   edit made on the web wins), then sends fresh card numbers. Runs when Profile opens, after a
//   workout and after a weigh-in.
//
// Distinct from syncService.ts's pushProfile(), the *private* cross-device blob (nav layout,
// rest-timer defaults...). Nothing in that blob is visible to other people. This is.
import { get } from "svelte/store";
import { publishPhoto } from "@logit/core/api/photosApi";
import { socialApi, type ApiProfile, type PublicProfileData } from "@logit/core/api/socialApi";
import { log } from "@logit/core/platform/log";
import { authStore } from "$lib/api/authStore.svelte";
import { getAccountItem, setAccountItem } from "$lib/data/accountStorage";
import type { WidgetSlot } from "$lib/features/widgets/widget";
import { profile } from "$lib/stores/profile.store";
import { profileConfig } from "$lib/stores/profileConfig.store";
import { activeSplit } from "$lib/stores/activeSplit.store";
import { getPersonalRecords } from "$lib/usecases/getPersonalRecords";
import { computeWeightTrend, computeStreak, computeBadges } from "./progressStats";

export type ProfileChange = { name?: string; bio?: string; avatar?: string; slots?: WidgetSlot[] };

/** Edits made on this phone that the account doesn't have yet. */
type Pending = { name?: string; bio?: string; avatar?: string; layout?: boolean };
const PENDING_KEY = "logit:profile-unsent:v1";

function readPending(): Pending {
  try {
    return JSON.parse(getAccountItem(PENDING_KEY) ?? "{}") as Pending;
  } catch {
    return {};
  }
}

function writePending(p: Pending): void {
  setAccountItem(PENDING_KEY, JSON.stringify(p));
}

/** The cards' numbers as others see them; also what your own Training tab shows. */
export async function buildPublicProfileData(): Promise<PublicProfileData> {
  const p = get(profile);
  const [split, records, weightTrend, streak, badges] = await Promise.all([
    activeSplit.load(),
    getPersonalRecords(10),
    computeWeightTrend(),
    computeStreak(),
    computeBadges(),
  ]);
  return {
    widgets: get(profileConfig).slots.map((s) => ({ id: s.id, enabled: s.enabled, order: s.orderIndex })),
    bodyStats: { height: p.height, heightUnit: p.heightUnit, weight: p.weight, weightUnit: p.weightUnit },
    activeSplit: split
      ? {
          name: split.name,
          days: split.days.filter((d) => !d.rest).map((d) => ({
            name: d.name ?? `Day ${d.orderIndex + 1}`,
            exercises: d.blocks.filter((b) => b.type === "strength").map((b) => (b as { exerciseName: string }).exerciseName),
          })),
        }
      : null,
    personalRecords: records.map((r) => ({ exerciseName: r.exerciseName, weight: r.weight, reps: r.reps })),
    // `dataUrl` is the field's old name: on the server it holds a /photos/ address.
    progressPhoto: p.progressPhotoDataUrl ? { dataUrl: p.progressPhotoDataUrl, updatedAtMs: Date.now() } : null,
    weightTrend,
    streak,
    badges,
  };
}

/** An edit on this phone: shown here at once, then sent (or kept until it can be). */
export async function saveProfile(change: ProfileChange): Promise<void> {
  const local: Parameters<typeof profile.save>[0] = {};
  if (change.name !== undefined) local.name = change.name;
  if (change.bio !== undefined) local.bio = change.bio;
  // "" = no photo (undefined would leave the stored one in place).
  if (change.avatar !== undefined) local.avatarDataUrl = change.avatar;
  if (Object.keys(local).length) profile.save(local);
  if (change.slots) profileConfig.setSlots(change.slots);

  if (!authStore.isAuthenticated) return;
  const pending = readPending();
  if (change.name !== undefined) pending.name = change.name;
  if (change.bio !== undefined) pending.bio = change.bio;
  if (change.avatar !== undefined) pending.avatar = change.avatar;
  if (change.slots) pending.layout = true;
  writePending(pending);
  await syncOwnProfile();
}

/** Sends the name/bio/photo edits still waiting. False when it couldn't (offline). */
async function sendPending(): Promise<boolean> {
  const pending = readPending();
  if (pending.name === undefined && pending.bio === undefined && pending.avatar === undefined) return true;
  try {
    // Uploaded once as a server photo; "" clears it there.
    const avatarUrl = pending.avatar === undefined ? undefined : (await publishPhoto(pending.avatar)) ?? "";
    await socialApi.updateMe({ displayName: pending.name, bio: pending.bio, avatarUrl });
    // From now on the phone holds the photo's address, the same as the account.
    if (avatarUrl !== undefined && get(profile).avatarDataUrl === pending.avatar) profile.applyRemote({ avatarDataUrl: avatarUrl });
    writePending({ layout: readPending().layout });
    return true;
  } catch (e) {
    log.warn("profile", "Profile edit not sent yet", e);
    return false;
  }
}

/** Takes the account's version of what this phone has no unsent edit for. Doesn't push back. */
function adopt(me: ApiProfile): void {
  const pending = readPending();
  const p = get(profile);
  const patch: Parameters<typeof profile.applyRemote>[0] = {};
  if (pending.name === undefined && me.displayName && me.displayName !== p.name) patch.name = me.displayName;
  if (pending.bio === undefined && (me.bio ?? "") !== p.bio) patch.bio = me.bio ?? "";
  if (pending.avatar === undefined && (me.avatarUrl ?? "") !== (p.avatarDataUrl ?? "")) {
    patch.avatarDataUrl = me.avatarUrl ?? "";
  }
  if (Object.keys(patch).length) profile.applyRemote(patch);

  if (pending.layout || !me.publicProfileJson) return;
  try {
    const widgets = (JSON.parse(me.publicProfileJson) as PublicProfileData).widgets;
    if (Array.isArray(widgets) && widgets.length) {
      profileConfig.applyRemote({ slots: widgets.map((w) => ({ id: w.id, enabled: w.enabled, orderIndex: w.order })) });
    }
  } catch {
    // a broken snapshot: keep the phone's layout, the next push replaces it
  }
}

async function run(): Promise<void> {
  const username = authStore.user?.username;
  if (!authStore.isAuthenticated || !username) return;
  if (!(await sendPending())) return;
  try {
    adopt(await socialApi.getProfile(username));
    const data = await buildPublicProfileData();
    data.progressPhoto = data.progressPhoto ? { ...data.progressPhoto, dataUrl: (await publishPhoto(data.progressPhoto.dataUrl)) ?? "" } : null;
    if (data.progressPhoto && !data.progressPhoto.dataUrl) data.progressPhoto = null;
    await socialApi.updateMe({ publicProfileJson: JSON.stringify(data) });
    const pending = readPending();
    if (pending.layout) writePending({ ...pending, layout: undefined });
  } catch (e) {
    // Offline or the server said no: others keep the last cards until the next sync.
    log.warn("profile", "Profile cards not sent", e);
  }
}

let running: Promise<void> | null = null;
let again = false;

/** One at a time; a call while one runs makes it run once more after. */
export function syncOwnProfile(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await run();
    } while (again);
  })().finally(() => (running = null));
  return running;
}
