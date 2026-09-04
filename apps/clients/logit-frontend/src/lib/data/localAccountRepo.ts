import { getDb } from "$lib/data/db/sqlite";
import { createId } from "@logit/core/domain/ids";
import { nowMs } from "@logit/core/domain/time";

export interface LocalAccount {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  avatarDataUrl: string | null;
  /** A single current progress photo — distinct from the identity avatar. Same storage pattern
   * (client-resized base64 data-URL, no object storage). See docs/architecture/
   * profile-progress-redesign.md — V1 is one photo, not a gallery/timeline. */
  progressPhotoDataUrl: string | null;
  height: number | null;
  heightUnit: "cm" | "in";
  weight: number | null;
  weightUnit: "kg" | "lbs";
  blocksCollapsedByDefault: boolean;
  restDefaultsJson: string;
  passwordHash: string | null;
  serverUserId: string | null;
  onboardingCompleted: boolean;
  onboardingStep: number;
  createdAtMs: number;
}

async function hashPassword(password: string): Promise<string> {
  const encoded = new TextEncoder().encode(password);
  const buffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyLocalPassword(account: LocalAccount, password: string): Promise<boolean> {
  if (!account.passwordHash) return true; // passwordless accounts always pass
  const hash = await hashPassword(password);
  return hash === account.passwordHash;
}

function rowToAccount(r: any): LocalAccount {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name ?? "",
    bio: r.bio ?? "",
    avatarDataUrl: r.avatar_data_url ?? null,
    progressPhotoDataUrl: r.progress_photo_data_url ?? null,
    height: r.height ?? null,
    heightUnit: (r.height_unit as "cm" | "in") ?? "cm",
    weight: r.weight ?? null,
    weightUnit: (r.weight_unit as "kg" | "lbs") ?? "kg",
    blocksCollapsedByDefault: r.blocks_collapsed_by_default === 1,
    restDefaultsJson: r.rest_defaults_json ?? "{}",
    passwordHash: r.password_hash ?? null,
    serverUserId: r.server_user_id ?? null,
    onboardingCompleted: r.onboarding_completed === 1,
    onboardingStep: r.onboarding_step ?? 0,
    createdAtMs: r.created_at_ms,
  };
}

export async function createLocalAccount(
  opts: Partial<Omit<LocalAccount, "id" | "createdAtMs" | "passwordHash">> & { username: string; password?: string },
): Promise<LocalAccount> {
  const db = getDb();
  const passwordHash = opts.password ? await hashPassword(opts.password) : null;

  const account: LocalAccount = {
    id: createId("lacct"),
    username: opts.username,
    displayName: opts.displayName ?? opts.username,
    bio: opts.bio ?? "",
    avatarDataUrl: opts.avatarDataUrl ?? null,
    progressPhotoDataUrl: opts.progressPhotoDataUrl ?? null,
    height: opts.height ?? null,
    heightUnit: opts.heightUnit ?? "cm",
    weight: opts.weight ?? null,
    weightUnit: opts.weightUnit ?? "kg",
    blocksCollapsedByDefault: opts.blocksCollapsedByDefault ?? true,
    restDefaultsJson: opts.restDefaultsJson ?? "{}",
    passwordHash,
    serverUserId: opts.serverUserId ?? null,
    onboardingCompleted: opts.onboardingCompleted ?? false,
    onboardingStep: opts.onboardingStep ?? 0,
    createdAtMs: nowMs(),
  };

  await db.run(
    `INSERT INTO local_accounts(
       id, username, display_name, bio, avatar_data_url, progress_photo_data_url,
       height, height_unit, weight, weight_unit,
       blocks_collapsed_by_default, rest_defaults_json,
       password_hash, server_user_id,
       onboarding_completed, onboarding_step,
       created_at_ms
     ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      account.id, account.username, account.displayName, account.bio, account.avatarDataUrl,
      account.progressPhotoDataUrl,
      account.height, account.heightUnit, account.weight, account.weightUnit,
      account.blocksCollapsedByDefault ? 1 : 0, account.restDefaultsJson,
      account.passwordHash, account.serverUserId,
      account.onboardingCompleted ? 1 : 0, account.onboardingStep,
      account.createdAtMs,
    ],
  );

  // Seed the bundled core algorithm as this profile's progression default — it ships with
  // the app, so a brand-new profile shouldn't start with the Progression widget (and Today's
  // Plan/Quick Start's suggestions) sitting empty until the user finds Settings and picks
  // one themselves. Written once, here, rather than defaulted at read time in getConfig() —
  // that would make Settings' "Disable suggestions" (which deletes this row) a no-op, since
  // the next read would just re-apply the same default and look identical to "never chosen."
  // Seeding it as a real row means disabling it later is a real, respected, persisted choice.
  await db.run(
    `INSERT INTO progression_config(owner_id, data) VALUES(?, ?)`,
    [account.id, JSON.stringify({ algorithmId: "linear-progression" })],
  );

  // Permanent marker so ensureLocalAccount() knows this device has had at least one
  // account and won't auto-create a new one after the user deletes all accounts.
  localStorage.setItem("logit:had_account", "1");

  return account;
}

export async function getLocalAccount(id: string): Promise<LocalAccount | null> {
  const db = getDb();
  const res = await db.query(`SELECT * FROM local_accounts WHERE id = ?`, [id]);
  const r = res.values?.[0];
  return r ? rowToAccount(r) : null;
}

export async function getLocalAccountByServerUserId(serverUserId: string): Promise<LocalAccount | null> {
  const db = getDb();
  const res = await db.query(`SELECT * FROM local_accounts WHERE server_user_id = ?`, [serverUserId]);
  const r = res.values?.[0];
  return r ? rowToAccount(r) : null;
}

export async function listLocalAccounts(): Promise<LocalAccount[]> {
  const db = getDb();
  const res = await db.query(`SELECT * FROM local_accounts ORDER BY created_at_ms ASC`, []);
  return (res.values ?? []).map(rowToAccount);
}

export async function updateLocalAccount(
  id: string,
  patch: Partial<Omit<LocalAccount, "id" | "createdAtMs">> & { password?: string },
): Promise<void> {
  const db = getDb();
  const sets: string[] = [];
  const params: unknown[] = [];

  if (patch.username !== undefined)                 { sets.push("username = ?");                    params.push(patch.username); }
  if (patch.displayName !== undefined)              { sets.push("display_name = ?");                params.push(patch.displayName); }
  if (patch.bio !== undefined)                      { sets.push("bio = ?");                         params.push(patch.bio); }
  if (patch.avatarDataUrl !== undefined)            { sets.push("avatar_data_url = ?");             params.push(patch.avatarDataUrl); }
  if (patch.progressPhotoDataUrl !== undefined)     { sets.push("progress_photo_data_url = ?");     params.push(patch.progressPhotoDataUrl); }
  if (patch.height !== undefined)                   { sets.push("height = ?");                      params.push(patch.height); }
  if (patch.heightUnit !== undefined)               { sets.push("height_unit = ?");                 params.push(patch.heightUnit); }
  if (patch.weight !== undefined)                   { sets.push("weight = ?");                      params.push(patch.weight); }
  if (patch.weightUnit !== undefined)               { sets.push("weight_unit = ?");                 params.push(patch.weightUnit); }
  if (patch.blocksCollapsedByDefault !== undefined) { sets.push("blocks_collapsed_by_default = ?"); params.push(patch.blocksCollapsedByDefault ? 1 : 0); }
  if (patch.restDefaultsJson !== undefined)         { sets.push("rest_defaults_json = ?");          params.push(patch.restDefaultsJson); }
  if (patch.serverUserId !== undefined)             { sets.push("server_user_id = ?");              params.push(patch.serverUserId); }
  if (patch.onboardingCompleted !== undefined)      { sets.push("onboarding_completed = ?");         params.push(patch.onboardingCompleted ? 1 : 0); }
  if (patch.onboardingStep !== undefined)           { sets.push("onboarding_step = ?");              params.push(patch.onboardingStep); }
  if (patch.password !== undefined) {
    const hash = patch.password?.trim() ? await hashPassword(patch.password.trim()) : null;
    sets.push("password_hash = ?");
    params.push(hash);
  }

  if (sets.length === 0) return;
  params.push(id);
  await db.run(`UPDATE local_accounts SET ${sets.join(", ")} WHERE id = ?`, params);
}

/**
 * Where the `/accounts` switcher should send the user right after activating a profile.
 * `loginOfflineAccount()` only ever flips the local `owner_id` — there's no per-profile stored
 * server session to restore (`apiClient` holds one global token, not one per profile; see
 * docs/bugs/account-switching.md #1), so a profile that was previously synced lands back in
 * offline mode. Route straight to sign-in with that username prefilled instead of landing on
 * "/" and letting the user discover it's not actually synced.
 */
export function postSwitchDestination(account: Pick<LocalAccount, "serverUserId" | "username">): string {
  return account.serverUserId ? `/auth?resume=${encodeURIComponent(account.username)}` : "/";
}

/**
 * Decide who should receive any row still sitting at `owner_id IS NULL` right before a new
 * local profile is created. Every sqlite repo's read queries fall back to `owner_id IS NULL`
 * (`WHERE owner_id = ? OR owner_id IS NULL`) — see docs/architecture/account-model.md §5 — so
 * leaving a row orphaned here would leak into the *new* profile's view the moment it reads
 * anything, regardless of who (if anyone) later calls {@link claimOrphanedData}. There are
 * exactly two safe outcomes, never a third:
 *
 * - True first launch (no accounts existed before this one): give them to the new profile
 *   itself — this is the one legitimate use of the sweep, adopting pre-multi-profile legacy
 *   data (docs/architecture/account-model.md §3 row 1).
 * - Any later "add a profile": give them to whichever profile was active immediately before
 *   this one was created — never to the new profile, which must start with a clean slate
 *   (§3 row 2; this is what closes docs/bugs/account-switching.md #2).
 *
 * Returns null when there's no one to claim for (a later profile created with no prior active
 * owner — shouldn't happen in practice, but there's nothing safe to do about it here).
 */
export function orphanClaimTarget(
  accountsBeforeCreate: number,
  activeOwnerIdBeforeCreate: string | null,
  newAccountId: string,
): string | null {
  return accountsBeforeCreate === 0 ? newAccountId : activeOwnerIdBeforeCreate;
}

export async function claimOrphanedData(ownerId: string): Promise<void> {
  const db = getDb();
  await db.run(`UPDATE sessions SET owner_id = ? WHERE owner_id IS NULL`, [ownerId]);
  await db.run(`UPDATE splits SET owner_id = ? WHERE owner_id IS NULL`, [ownerId]);
  await db.run(`UPDATE exercises SET owner_id = ? WHERE owner_id IS NULL AND is_core = 0`, [ownerId]);
}
