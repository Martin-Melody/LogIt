import { parseMealPlanPack, parseRecipePack } from "./nutritionPacks";
import { cardPackCards } from "./cardPack";
import { parseQuestionPack } from "./questionPack";
import { parsePhasePack } from "./phasePack";
import { parseProgramPack } from "./programPack";
import { parseBlockDeclaration } from "../domain/blockPlugin";
import { parseExercisePack } from "./exercisePack";
import { parseMobilityPack } from "./mobilityPack";
import { FAMILY_ENTRY, isCodeFamily, isWidgetNeed } from "./pluginInfo";
import { sampleFamilyInput, sampleWidgetInput } from "./sampleInputs";
import { extractEntryExport, type SandboxOp } from "./sandboxProtocol";
import { checkWidgetView } from "./widgetViewCheck";

/**
 * The checks the dashboard's builder runs on every change, and again before it lets anyone
 * publish: the same ground the registry linter covers (packages/plugin-tools), plus a dry run
 * of the plugin with sample data and with nothing logged.
 */

export type PluginCheck = {
  id: string;
  label: string;
  ok: boolean;
  /** What went wrong, in words the author can act on. */
  detail?: string;
};

/** Runs one sandbox op (core sandbox.runInSandbox in the apps; injectable for tests). */
export type SandboxRunner = (source: string, entry: string, op: SandboxOp) => Promise<unknown>;

export type CheckInput = {
  family: string;
  pluginId: string;
  source: string;
  run: SandboxRunner;
  now?: number;
};

export type CheckResult = {
  checks: PluginCheck[];
  /** True when every check passed. */
  ok: boolean;
  /** The bundle's metadata (id, name, needs, ...), when it loaded. */
  meta?: Record<string, unknown>;
  /** Milliseconds the sample run took. */
  ms?: number;
};

/** Over this, the app would cut the plugin off (the sandbox deadline is 300 ms). */
export const SLOW_MS = 150;

function done(checks: PluginCheck[], extra: Partial<CheckResult> = {}): CheckResult {
  return { checks, ok: checks.every((c) => c.ok), ...extra };
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function runPluginChecks(input: CheckInput): Promise<CheckResult> {
  const { family, pluginId, source } = input;
  const now = input.now ?? Date.now();

  if (!isCodeFamily(family)) return checkPack(family, pluginId, source);

  const checks: PluginCheck[] = [];
  const { entry: defaultEntry, method } = FAMILY_ENTRY[family]!;
  const entry = extractEntryExport(source) ?? defaultEntry;

  const hasImports = /^\s*import\s[^;]*from\s/m.test(source);
  checks.push({
    id: "single-file",
    label: "One file, no imports",
    ok: !hasImports,
    detail: hasImports ? "The sandbox can't load other files. Put everything in this one, or bundle it first (esbuild --bundle)." : undefined,
  });

  // 1. It loads, and says who it is.
  let meta: Record<string, unknown> | undefined;
  try {
    const value = await input.run(source, entry, { kind: "meta" });
    meta = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    checks.push({ id: "loads", label: "Loads in the sandbox", ok: true });
  } catch (e) {
    checks.push({ id: "loads", label: "Loads in the sandbox", ok: false, detail: message(e) });
    return done(checks);
  }

  const idOk = meta.id === pluginId;
  checks.push({
    id: "id",
    label: "Its id matches the plugin",
    ok: idOk,
    detail: idOk ? undefined : `The code says id ${JSON.stringify(meta.id ?? null)}; this plugin is "${pluginId}".`,
  });

  // Card packs (canvas W13) list their cards; each is computed on its own.
  if (family === "card-pack") {
    const cards = cardPackCards(meta);
    checks.push({ id: "cards", label: cards.length ? `Lists ${cards.length} ${cards.length === 1 ? "card" : "cards"}` : "Lists its cards", ok: cards.length > 0, detail: cards.length ? undefined : 'Add cards: [{ id: "roster", name: "Months with you" }].' });
  }

  if (family === "widget") {
    const needs = Array.isArray(meta.needs) ? meta.needs : [];
    const unknown = needs.filter((n) => typeof n !== "string" || !isWidgetNeed(n));
    checks.push({
      id: "needs",
      label: "Asks only for data LogIt has",
      ok: Array.isArray(meta.needs) && unknown.length === 0,
      detail: !Array.isArray(meta.needs)
        ? 'Add a needs list, e.g. needs: ["workouts"] (or needs: [] for none).'
        : unknown.length
          ? `${unknown.map((n) => JSON.stringify(n)).join(", ")} isn't something a widget can ask for.`
          : undefined,
    });
  }

  // 2. The family's method, with sample data.
  const needs = Array.isArray(meta.needs) ? (meta.needs.filter((n) => typeof n === "string") as string[]) : [];
  const firstCard = family === "card-pack" ? (cardPackCards(meta)[0]?.id ?? "") : "";
  const sample = family === "widget" ? sampleWidgetInput(needs, now) : family === "card-pack" ? { ...(sampleFamilyInput(family, now) as object), card: firstCard } : sampleFamilyInput(family, now);
  let output: unknown;
  let ms: number | undefined;
  try {
    const start = performance.now();
    output = await input.run(source, entry, { kind: "call", method, input: sample });
    ms = Math.round(performance.now() - start);
    checks.push({ id: "runs", label: `Has ${method}() and it runs`, ok: true });
  } catch (e) {
    checks.push({ id: "runs", label: `Has ${method}() and it runs`, ok: false, detail: message(e) });
    return done(checks, { meta });
  }

  if (family === "widget" || family === "card-pack") {
    const problems = checkWidgetView(output);
    checks.push({
      id: "view",
      label: "Uses only card parts LogIt knows",
      ok: problems.length === 0,
      detail: problems.length ? problems.slice(0, 5).join("\n") + (problems.length > 5 ? `\n…and ${problems.length - 5} more` : "") : undefined,
    });
  } else if (!output || typeof output !== "object") {
    checks.push({ id: "view", label: "Returns a result", ok: false, detail: `${method}() returned ${JSON.stringify(output ?? null)}.` });
  }

  checks.push({
    id: "fast",
    label: ms !== undefined ? `Finishes in ${ms} ms (limit 300 ms)` : "Finishes in time",
    ok: ms === undefined || ms <= SLOW_MS,
    detail: ms !== undefined && ms > SLOW_MS ? "Slower phones take longer; keep it well under the limit." : undefined,
  });

  // 3. Nothing logged yet: new accounts are the first people to install anything.
  try {
    const empty = family === "widget" ? sampleWidgetInput(needs, now, true) : family === "card-pack" ? { ...(sampleFamilyInput(family, now, true) as object), card: firstCard } : sampleFamilyInput(family, now, true);
    const out = await input.run(source, entry, { kind: "call", method, input: empty });
    const problems = family === "widget" || family === "card-pack" ? checkWidgetView(out) : [];
    checks.push({
      id: "empty",
      label: "Works with nothing logged",
      ok: problems.length === 0,
      detail: problems.length ? problems.slice(0, 3).join("\n") : undefined,
    });
  } catch (e) {
    checks.push({ id: "empty", label: "Works with nothing logged", ok: false, detail: message(e) });
  }

  return done(checks, { meta, ms });
}

function checkPack(family: string, pluginId: string, source: string): CheckResult {
  const checks: PluginCheck[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(source);
    checks.push({ id: "json", label: "Valid JSON", ok: true });
  } catch (e) {
    checks.push({ id: "json", label: "Valid JSON", ok: false, detail: message(e) });
    return done(checks);
  }
  if (family === "phase-pack") {
    try {
      const p = parsePhasePack(raw, pluginId);
      checks.push({ id: "pack", label: `"${p.phase.name}", ${p.phase.weeks} ${p.phase.weeks === 1 ? "week" : "weeks"}, with ${p.includes.length} ${p.includes.length === 1 ? "part" : "parts"}, readable`, ok: true });
    } catch (e) {
      checks.push({ id: "pack", label: "The phase is readable", ok: false, detail: message(e) });
    }
    return done(checks);
  }
  if (family === "workout-block") {
    try {
      const d = parseBlockDeclaration(raw, pluginId);
      checks.push({ id: "pack", label: `"${d.name}" with ${d.fields.length} ${d.fields.length === 1 ? "field" : "fields"}, readable`, ok: true });
    } catch (e) {
      checks.push({ id: "pack", label: "The block is readable", ok: false, detail: message(e) });
    }
    return done(checks);
  }
  try {
    const count =
      family === "mobility-pack"
        ? parseMobilityPack(raw, pluginId).drills.length
        : family === "program-pack"
          ? parseProgramPack(raw, pluginId).programs.length
          : family === "meal-plan-pack"
            ? parseMealPlanPack(raw, pluginId).plans.length
            : family === "question-pack"
              ? parseQuestionPack(raw, pluginId).questions.length
            : family === "recipe-pack"
              ? parseRecipePack(raw, pluginId).recipes.length
              : parseExercisePack(raw, pluginId).exercises.length;
    const what = family === "mobility-pack" ? "drills" : family === "program-pack" ? "programs" : family === "meal-plan-pack" ? "meal plans" : family === "recipe-pack" ? "recipes" : family === "question-pack" ? "questions" : "exercises";
    checks.push({ id: "pack", label: `${count} ${what}, all readable`, ok: true });
  } catch (e) {
    checks.push({ id: "pack", label: "Every entry is readable", ok: false, detail: message(e) });
  }
  return done(checks);
}
