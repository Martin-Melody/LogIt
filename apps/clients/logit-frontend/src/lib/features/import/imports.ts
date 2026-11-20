// Importing workout history (design canvas I1, E1b, I2): saving what the person checked, and
// undoing it for 30 days. Reading and converting the file is core (import/workoutImport.ts).
import { getExerciseRepo, getWorkoutRepo } from "$lib/data/repoProvider";
import { getAccountItem, setAccountItem } from "$lib/data/accountStorage";
import { pushExercise, pushSessions } from "$lib/sync/syncService";
import { bumpProgression } from "$lib/progression/store";
import { blockKindOf, toSessions, type ParsedImport, type WeightUnit } from "@logit/core/import/workoutImport";
import { matchExercises, type ExerciseMatch } from "@logit/core/import/matchExercises";

const IMPORTS_KEY = "logit:imports";
const CHOICES_KEY = "logit:import-choices";
export const UNDO_DAYS = 30;

export type ImportRecord = { id: string; source: string; fileName: string; atMs: number; sessionIds: string[]; added: number };
/** Per name in a file: a library exercise, or "own" (made from the name). Remembered, so the
 * next import of the same app asks nothing it was told before. */
export type ExerciseChoice = { exerciseId: string } | "own";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = getAccountItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function listImports(nowMs = Date.now()): ImportRecord[] {
  return read<ImportRecord[]>(IMPORTS_KEY, []).filter((r) => nowMs - r.atMs < UNDO_DAYS * 86_400_000);
}

/** Strength exercises in the file matched against the library, with earlier choices applied. */
export async function matchFileExercises(parsed: ParsedImport): Promise<ExerciseMatch[]> {
  const names = [...new Set(parsed.workouts.flatMap((w) => w.exercises.filter((e) => blockKindOf(e) === "strength").map((e) => e.name)))];
  const library = (await getExerciseRepo().list({ query: "", limit: 5000 })).map((e) => ({ id: e.id, name: e.name }));
  const remembered = read<Record<string, ExerciseChoice>>(CHOICES_KEY, {});
  return matchExercises(names, library).map((m) => {
    const before = remembered[m.name.toLowerCase()];
    if (m.kind === "unknown" && before && before !== "own") {
      const hit = library.find((e) => e.id === before.exerciseId);
      if (hit) return { name: m.name, kind: "matched", exerciseId: hit.id, libraryName: hit.name };
    }
    return m;
  });
}

/** Saves the workouts not already here; returns the record (also kept for Undo). */
export async function runImport(
  parsed: ParsedImport,
  opts: { fileName: string; unit: WeightUnit; matches: ExerciseMatch[]; choices: Record<string, ExerciseChoice> },
): Promise<ImportRecord> {
  const exercises = getExerciseRepo();
  const ids = new Map<string, { exerciseId?: string; name: string }>();
  const remembered = read<Record<string, ExerciseChoice>>(CHOICES_KEY, {});
  for (const m of opts.matches) {
    const choice = opts.choices[m.name] ?? (m.kind === "matched" ? { exerciseId: m.exerciseId } : "own");
    remembered[m.name.toLowerCase()] = choice;
    if (choice !== "own") {
      const lib = await exercises.getById(choice.exerciseId);
      ids.set(m.name, { exerciseId: choice.exerciseId, name: lib?.name ?? m.name });
    } else {
      // Kept as their own: made from the name now; muscles are asked in a workout (FinishSetupCard).
      const own = await exercises.create(m.name);
      pushExercise(own);
      ids.set(m.name, { exerciseId: own.id, name: own.name });
    }
  }
  setAccountItem(CHOICES_KEY, JSON.stringify(remembered));

  const sessions = toSessions(parsed, { unit: opts.unit, exerciseFor: (name) => ids.get(name) ?? { name } });
  const repo = getWorkoutRepo();
  const have = new Set((await repo.listAllSessions()).map((s) => s.id));
  const fresh = sessions.filter((s) => !have.has(s.id));
  for (const s of fresh) await repo.saveSession(s);
  pushSessions(fresh);
  bumpProgression();

  const record: ImportRecord = {
    id: `import_${Date.now().toString(36)}`,
    source: parsed.source,
    fileName: opts.fileName,
    atMs: Date.now(),
    sessionIds: fresh.map((s) => s.id),
    added: fresh.length,
  };
  // Nothing new (the same file again): nothing to undo.
  if (record.added > 0) setAccountItem(IMPORTS_KEY, JSON.stringify([record, ...listImports()]));
  return record;
}

/** Deletes the workouts an import added (synced); the exercises made for it stay. */
export async function undoImport(id: string): Promise<number> {
  const record = listImports().find((r) => r.id === id);
  if (!record) return 0;
  const repo = getWorkoutRepo();
  const gone = [];
  for (const sid of record.sessionIds) {
    const s = await repo.getSession(sid);
    if (!s) continue;
    await repo.deleteSession(sid);
    gone.push(s);
  }
  pushSessions(gone, true);
  bumpProgression();
  setAccountItem(IMPORTS_KEY, JSON.stringify(listImports().filter((r) => r.id !== id)));
  return gone.length;
}
