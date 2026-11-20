import { createId } from "./ids";
import type { SessionBlock, WorkoutSession } from "./workout";

/**
 * Workout blocks from plugins (docs/plugin-workout-blocks.md, approved by Martin 2026-11-20).
 * A plugin *declares* a block: the fields of one entry (a round, a set, a climb), fields set
 * once per block, a timer pattern, a summary template. The app draws it with its own parts;
 * the plugin never ships screens. The data carries its own shape and summary, so history keeps
 * reading after the plugin is gone, on another phone, or on the web.
 *
 * A session block from a plugin has type `plugin:<pluginId>` and `PluginBlockData`.
 */
export const PLUGIN_BLOCK_PREFIX = "plugin:";
export const isPluginBlockType = (type: string) => type.startsWith(PLUGIN_BLOCK_PREFIX);
export const pluginBlockType = (pluginId: string) => `${PLUGIN_BLOCK_PREFIX}${pluginId}`;

export const BLOCK_FIELD_TYPES = ["number", "weight", "distance", "duration", "counter", "scale", "choice", "tags", "toggle", "text"] as const;
export type BlockFieldType = (typeof BLOCK_FIELD_TYPES)[number];

export type BlockField = {
  key: string;
  type: BlockFieldType;
  label: string;
  optional?: boolean;
  default?: BlockValue;
  /** number: what the number is (reps, m, km, bpm, cal). */
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  /** choice / tags: the options, or "list:<id>" for one of the plugin's lists. */
  options?: string[] | string;
  multiline?: boolean;
  /** text: offer values typed before. */
  suggestions?: "previous";
  /** Prefill from the last block of this kind. */
  remember?: boolean;
  /** Shown as a column in the entries table. */
  column?: boolean;
  /** duration: the timer's work length comes from this field. */
  timer?: "work";
  /** Renamed from this key in an earlier version (old data still reads). */
  was?: string;
};

export type BlockList = { label: string; items: string[]; add?: boolean; ordered?: boolean };

export type BlockDeclaration = {
  id: string;
  name: string;
  /** A name from the app's icon list, or the plugin's own checked SVG (later). */
  icon?: string;
  description?: string;
  entry: { one: string; many: string };
  blockFields: BlockField[];
  fields: BlockField[];
  timer?: { pattern: "none" | "rounds"; work?: string; rest?: { default: number; label?: string } };
  summary?: string;
  countsAs?: { activeMinutes?: string; distance?: string };
  lists?: Record<string, BlockList>;
  /** Declaration version; old blocks keep the version they were written with. */
  version?: number;
};

export type BlockValue = number | string | boolean | string[] | null;
export type PluginBlockEntry = { id: string; done?: boolean; values: Record<string, BlockValue> };
/** [key, type, label, column?] of every field, kept with the data. */
export type BlockShape = [string, BlockFieldType, string, boolean?][];

export type PluginBlockData = {
  v: number;
  /** The block's name when it was written (shown without the plugin). */
  name: string;
  entryName: { one: string; many: string };
  blockFields: Record<string, BlockValue>;
  entries: PluginBlockEntry[];
  shape: BlockShape;
  blockShape: BlockShape;
  summary: string;
};

const KEY_RE = /^[a-z][a-zA-Z0-9_]{0,31}$/;
const MAX_FIELDS = 20;

function str(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function parseField(raw: unknown, where: string, lists: Record<string, BlockList>): BlockField {
  if (!raw || typeof raw !== "object") throw new Error(`${where}: each field must be an object.`);
  const f = raw as Record<string, unknown>;
  if (!str(f.key) || !KEY_RE.test(f.key)) throw new Error(`${where}: "${String(f.key)}" isn't a valid key (letters and digits, starting lower case).`);
  if (!BLOCK_FIELD_TYPES.includes(f.type as BlockFieldType)) throw new Error(`${where}: field "${f.key}" has unknown type "${String(f.type)}".`);
  if (!str(f.label)) throw new Error(`${where}: field "${f.key}" needs a label.`);
  const type = f.type as BlockFieldType;
  if (type === "choice" || type === "tags") {
    const o = f.options;
    if (typeof o === "string") {
      if (!o.startsWith("list:") || !lists[o.slice(5)]) throw new Error(`${where}: field "${f.key}" points at "${o}", which the plugin doesn't ship.`);
    } else if (!Array.isArray(o) || o.length === 0 || !o.every(str)) {
      throw new Error(`${where}: field "${f.key}" needs options.`);
    }
  }
  const out: BlockField = { key: f.key, type, label: f.label.trim() };
  for (const k of ["optional", "multiline", "remember", "column"] as const) if (f[k] === true) out[k] = true;
  for (const k of ["step", "min", "max"] as const) if (typeof f[k] === "number" && isFinite(f[k] as number)) out[k] = f[k] as number;
  if (str(f.unit)) out.unit = f.unit.trim();
  if (f.options !== undefined) out.options = f.options as string[] | string;
  if (f.suggestions === "previous") out.suggestions = "previous";
  if (f.timer === "work") out.timer = "work";
  if (str(f.was)) out.was = f.was;
  if (f.default !== undefined) out.default = f.default as BlockValue;
  return out;
}

/** Reads a plugin's declaration; throws a readable error for anything the app can't draw. */
export function parseBlockDeclaration(raw: unknown, expectedId?: string): BlockDeclaration {
  if (!raw || typeof raw !== "object") throw new Error("The block declaration must be an object.");
  const d = raw as Record<string, unknown>;
  if (!str(d.id)) throw new Error("The block needs an id.");
  if (expectedId && d.id !== expectedId) throw new Error(`The block's id "${d.id}" doesn't match the plugin "${expectedId}".`);
  if (!str(d.name)) throw new Error("The block needs a name.");
  const entry = d.entry as Record<string, unknown> | undefined;
  if (!entry || !str(entry.one) || !str(entry.many)) throw new Error('The block needs entry names, e.g. { "one": "Round", "many": "Rounds" }.');
  const lists: Record<string, BlockList> = {};
  if (d.lists && typeof d.lists === "object") {
    for (const [id, l] of Object.entries(d.lists as Record<string, unknown>)) {
      const list = l as Record<string, unknown>;
      if (!KEY_RE.test(id) || !list || !Array.isArray(list.items) || !list.items.every(str)) throw new Error(`List "${id}" needs a label and items.`);
      lists[id] = { label: str(list.label) ? list.label : id, items: (list.items as string[]).slice(0, 500), ...(list.add === true ? { add: true } : {}), ...(list.ordered === true ? { ordered: true } : {}) };
    }
  }
  const fields = Array.isArray(d.fields) ? d.fields.map((f, i) => parseField(f, `Field ${i + 1}`, lists)) : [];
  const blockFields = Array.isArray(d.blockFields) ? d.blockFields.map((f, i) => parseField(f, `Block field ${i + 1}`, lists)) : [];
  if (fields.length === 0) throw new Error("The block needs at least one field.");
  if (fields.length + blockFields.length > MAX_FIELDS) throw new Error(`At most ${MAX_FIELDS} fields.`);
  const keys = [...fields, ...blockFields].map((f) => f.key);
  const dup = keys.find((k, i) => keys.indexOf(k) !== i);
  if (dup) throw new Error(`Two fields share the key "${dup}".`);

  let timer: BlockDeclaration["timer"];
  const t = d.timer as Record<string, unknown> | undefined;
  if (t && t.pattern !== "none") {
    if (t.pattern !== "rounds") throw new Error(`Timer pattern "${String(t.pattern)}" isn't one LogIt runs yet (rounds).`);
    const work = fields.find((f) => f.key === t.work);
    if (!work || work.type !== "duration") throw new Error("A rounds timer's work must be a duration field.");
    const rest = t.rest as Record<string, unknown> | undefined;
    timer = { pattern: "rounds", work: work.key, ...(rest && typeof rest.default === "number" ? { rest: { default: rest.default, ...(str(rest.label) ? { label: rest.label } : {}) } } : {}) };
  }
  const countsAs = d.countsAs as Record<string, unknown> | undefined;
  return {
    id: d.id,
    name: d.name.trim(),
    ...(str(d.icon) ? { icon: d.icon } : {}),
    ...(str(d.description) ? { description: d.description.trim() } : {}),
    entry: { one: entry.one.trim(), many: entry.many.trim() },
    blockFields,
    fields,
    ...(timer ? { timer } : {}),
    ...(str(d.summary) ? { summary: d.summary } : {}),
    ...(countsAs ? { countsAs: {
      ...(str(countsAs.activeMinutes) && fields.some((f) => f.key === countsAs.activeMinutes && f.type === "duration") ? { activeMinutes: countsAs.activeMinutes } : {}),
      ...(str(countsAs.distance) && fields.some((f) => f.key === countsAs.distance && f.type === "distance") ? { distance: countsAs.distance } : {}),
    } } : {}),
    ...(Object.keys(lists).length ? { lists } : {}),
    ...(typeof d.version === "number" ? { version: d.version } : {}),
  };
}

/** A choice / tags field's options, with a list's items (and the person's own additions). */
export function fieldOptions(decl: BlockDeclaration, f: BlockField, ownItems: string[] = []): string[] {
  if (typeof f.options === "string") return [...(decl.lists?.[f.options.slice(5)]?.items ?? []), ...ownItems];
  return f.options ?? [];
}

function shapeOf(fields: BlockField[]): BlockShape {
  // Without any `column`, the first four entry fields are the table's columns.
  const anyColumn = fields.some((f) => f.column);
  return fields.map((f, i) => [f.key, f.type, f.label, anyColumn ? !!f.column : i < 4]);
}

function defaultsOf(fields: BlockField[], previous?: Record<string, BlockValue>): Record<string, BlockValue> {
  const out: Record<string, BlockValue> = {};
  for (const f of fields) {
    if (f.remember && previous && previous[f.key] !== undefined) out[f.key] = previous[f.key]!;
    else if (f.default !== undefined) out[f.key] = f.default;
    else if (f.type === "counter") out[f.key] = 0;
  }
  return out;
}

const n = (v: BlockValue | undefined) => (typeof v === "number" && isFinite(v) ? v : 0);

/**
 * The summary line: the plugin's template over the entries, or "6 rounds". Placeholders:
 * {count}, {sum:key}, {max:key}, {avg:key}, {first:key}, and a block field as {key}.
 */
export function renderSummary(data: Pick<PluginBlockData, "entries" | "blockFields" | "entryName">, template?: string): string {
  const done = data.entries.filter((e) => e.done !== false);
  const count = done.length;
  const one = data.entryName.one.toLowerCase();
  const many = data.entryName.many.toLowerCase();
  // "{count} rounds" reads "1 round" for one.
  const tpl = (template ?? `{count} ${many}`).replace(`{count} ${many}`, `{count} ${count === 1 ? one : many}`);
  const values = (key: string) => done.map((e) => n(e.values[key]));
  const round1 = (x: number) => String(Math.round(x * 10) / 10);
  return tpl.replace(/\{(\w+)(?::(\w+))?\}/g, (_m, a: string, b?: string) => {
    if (a === "count" && !b) return String(count);
    if (b) {
      const vs = values(b);
      if (a === "sum") return round1(vs.reduce((x, y) => x + y, 0));
      if (a === "max") return round1(vs.length ? Math.max(...vs) : 0);
      if (a === "avg") return round1(vs.length ? vs.reduce((x, y) => x + y, 0) / vs.length : 0);
      if (a === "first") { const v = done[0]?.values[b]; return v == null ? "" : String(v); }
      return "";
    }
    const v = data.blockFields[a];
    return v == null ? "" : Array.isArray(v) ? v.join(", ") : String(v);
  }).replace(/\s+·\s*$/, "").trim();
}

function withSummary(decl: BlockDeclaration, data: PluginBlockData): PluginBlockData {
  return { ...data, summary: renderSummary(data, decl.summary) };
}

/** A new block of this kind, with one empty entry; `previous` is the last block of the kind. */
export function newPluginBlockData(decl: BlockDeclaration, previous?: PluginBlockData | null): PluginBlockData {
  const lastEntry = previous?.entries.at(-1)?.values;
  return withSummary(decl, {
    v: decl.version ?? 1,
    name: decl.name,
    entryName: decl.entry,
    blockFields: defaultsOf(decl.blockFields, previous?.blockFields),
    entries: [{ id: createId("ent"), values: defaultsOf(decl.fields, lastEntry), done: false }],
    shape: shapeOf(decl.fields),
    blockShape: shapeOf(decl.blockFields),
    summary: "",
  });
}

export function addPluginBlock(session: WorkoutSession, decl: BlockDeclaration, previous?: PluginBlockData | null): WorkoutSession {
  const block: SessionBlock<PluginBlockData> = {
    id: createId("blk"),
    type: pluginBlockType(decl.id),
    orderIndex: session.blocks.length,
    data: newPluginBlockData(decl, previous),
  };
  return { ...session, blocks: [...session.blocks, block] };
}

/** Change one block's data (the summary follows). */
export function updatePluginBlock(
  session: WorkoutSession,
  blockId: string,
  decl: BlockDeclaration,
  fn: (d: PluginBlockData) => PluginBlockData,
): WorkoutSession {
  return {
    ...session,
    blocks: session.blocks.map((b) => (b.id === blockId ? { ...b, data: withSummary(decl, fn(b.data as PluginBlockData)) } : b)),
  };
}

export const setBlockFieldValue = (key: string, value: BlockValue) => (d: PluginBlockData): PluginBlockData =>
  ({ ...d, blockFields: { ...d.blockFields, [key]: value } });

export const setEntryValue = (entryId: string, key: string, value: BlockValue) => (d: PluginBlockData): PluginBlockData =>
  ({ ...d, entries: d.entries.map((e) => (e.id === entryId ? { ...e, values: { ...e.values, [key]: value } } : e)) });

export const setEntryDone = (entryId: string, done: boolean) => (d: PluginBlockData): PluginBlockData =>
  ({ ...d, entries: d.entries.map((e) => (e.id === entryId ? { ...e, done } : e)) });

export const removeEntry = (entryId: string) => (d: PluginBlockData): PluginBlockData =>
  ({ ...d, entries: d.entries.filter((e) => e.id !== entryId) });

/** Another entry, carrying `remember` fields and defaults from the one before. */
export const addEntry = (decl: BlockDeclaration) => (d: PluginBlockData): PluginBlockData =>
  ({ ...d, entries: [...d.entries, { id: createId("ent"), values: defaultsOf(decl.fields, d.entries.at(-1)?.values), done: false }] });

/** Seconds of active time the block adds (countsAs.activeMinutes), from finished entries. */
export function pluginBlockActiveSec(decl: Pick<BlockDeclaration, "countsAs"> | null, data: PluginBlockData): number {
  const key = decl?.countsAs?.activeMinutes;
  if (!key) return 0;
  return data.entries.filter((e) => e.done !== false).reduce((s, e) => s + n(e.values[key]), 0);
}
