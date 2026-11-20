/**
 * Which LogIt exercise each name in an imported file is (design canvas I2). A name that is the
 * same once tidied ("bench press (barbell)", "Pull-ups" for "Pull Up") is matched without
 * asking; anything else gets the closest library name as a suggestion for the person to accept,
 * or is kept as their own exercise.
 */
export type LibraryEntry = { id: string; name: string };
export type ExerciseMatch =
  | { name: string; kind: "matched"; exerciseId: string; libraryName: string }
  | { name: string; kind: "unknown"; suggestion?: { exerciseId: string; libraryName: string } };

const EQUIPMENT_WORDS = ["barbell", "dumbbell", "cable", "machine", "kettlebell", "smith machine", "band", "bodyweight", "assisted", "weighted"];
const FILLER = new Set(["the", "a", "with", "on", "of", "and", "mine", "my"]);

// Gym shorthand, written out so "Incline DB Press" is "Incline Dumbbell Press".
const SHORTHAND: Record<string, string> = {
  db: "dumbbell", bb: "barbell", kb: "kettlebell", ssb: "safety bar", ohp: "overhead press",
  rdl: "romanian deadlift", sldl: "stiff leg deadlift", ez: "ez bar", bw: "bodyweight",
};

function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[()[\],/]/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .flatMap((t) => (SHORTHAND[t] ?? t).split(" "))
    .map((t) => (t.length >= 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t)) // pull-ups → pull up
    .filter((t) => t && !FILLER.has(t));
}

const key = (name: string) => [...new Set(tokens(name))].sort().join(" ");

/** "Bench Press (Barbell)" → also try "Bench Press", which is LogIt's barbell default. */
function variants(name: string): string[] {
  const m = name.match(/^(.*)\(([^)]*)\)\s*$/);
  if (!m) return [name];
  const base = m[1]!.trim();
  const inside = m[2]!.trim().toLowerCase();
  return EQUIPMENT_WORDS.includes(inside) ? [name, base, `${inside} ${base}`] : [name, base];
}

export function matchExercises(names: string[], library: LibraryEntry[]): ExerciseMatch[] {
  const byKey = new Map<string, LibraryEntry>();
  for (const e of library) if (!byKey.has(key(e.name))) byKey.set(key(e.name), e);
  const libTokens = library.map((e) => ({ e, t: new Set(tokens(e.name)) }));

  return names.map((name): ExerciseMatch => {
    // A library entry carrying the same equipment word wins over the bare base name.
    for (const v of variants(name).reverse()) {
      const hit = byKey.get(key(v));
      if (hit) return { name, kind: "matched", exerciseId: hit.id, libraryName: hit.name };
    }
    const mine = new Set(tokens(name));
    let best: { e: LibraryEntry; score: number } | null = null;
    for (const { e, t } of libTokens) {
      const shared = [...mine].filter((x) => t.has(x)).length;
      const score = shared / new Set([...mine, ...t]).size;
      if (shared > 0 && (!best || score > best.score)) best = { e, score };
    }
    return best && best.score >= 0.4
      ? { name, kind: "unknown", suggestion: { exerciseId: best.e.id, libraryName: best.e.name } }
      : { name, kind: "unknown" };
  });
}
