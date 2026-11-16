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
  const sample = family === "widget" ? sampleWidgetInput(needs, now) : sampleFamilyInput(family, now);
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

  if (family === "widget") {
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
    const empty = family === "widget" ? sampleWidgetInput(needs, now, true) : sampleFamilyInput(family, now, true);
    const out = await input.run(source, entry, { kind: "call", method, input: empty });
    const problems = family === "widget" ? checkWidgetView(out) : [];
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
  try {
    const count =
      family === "mobility-pack"
        ? parseMobilityPack(raw, pluginId).drills.length
        : parseExercisePack(raw, pluginId).exercises.length;
    checks.push({ id: "pack", label: `${count} ${family === "mobility-pack" ? "drills" : "exercises"}, all readable`, ok: true });
  } catch (e) {
    checks.push({ id: "pack", label: "Every entry is readable", ok: false, detail: message(e) });
  }
  return done(checks);
}
