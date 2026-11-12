/**
 * Logit's diagnostic log. One small logger for the whole app: entries go to the console (all
 * levels in dev, warnings and errors in a build) and into a ring buffer kept in localStorage,
 * so a user can open Settings → Diagnostics after something went wrong and see, copy or save
 * what happened. Nothing here sends anything anywhere — uploading a report is a separate,
 * explicit action (see the Diagnostics screen), offered only on the hosted service.
 *
 * Entries are technical: what area, what failed, status codes, request ids, durations. Don't
 * log what people typed or logged (exercise names, food, messages, notes). As a backstop,
 * `data` is sanitised: secret-looking keys are dropped and JWTs / email addresses in strings
 * are masked.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  /** Time of the first occurrence (ms since epoch). */
  t: number;
  level: LogLevel;
  /** Short area name: "api", "sync", "app", "auth", "db", … */
  area: string;
  msg: string;
  data?: Record<string, unknown>;
  /** How many times this entry repeated (see REPEAT_WINDOW); absent means once. */
  n?: number;
  /** Time of the latest repeat. */
  tLast?: number;
}

const STORAGE_KEY = "logit:log:v1";
const VERBOSE_KEY = "logit:log:verbose";
const MAX_ENTRIES = 1000;
const MAX_STRING = 400;
const MAX_KEYS = 30;
const MAX_ITEMS = 20;
const MAX_DEPTH = 3;
const PERSIST_DELAY_MS = 1500;
/** An entry identical in level/area/message to one of the last REPEAT_WINDOW entries is
 * counted on that entry instead of added again, so a background sync failing every five
 * minutes doesn't push everything else out of the buffer. */
const REPEAT_WINDOW = 40;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const SECRET_KEY = /pass(word)?|token|secret|authori[sz]ation|cookie|e-?mail|api_?key|credential/i;
const JWT = /eyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]{5,}/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

// ── storage helpers (every access guarded: SSR, tests, private mode, quota) ──

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function loadEntries(): LogEntry[] {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as LogEntry[]).slice(-MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

let entries: LogEntry[] | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function buffer(): LogEntry[] {
  if (!entries) entries = loadEntries();
  return entries;
}

function persistNow(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  const store = storage();
  if (!store || !entries) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage full: keep the newer half rather than nothing.
    try {
      entries = entries.slice(-Math.floor(MAX_ENTRIES / 2));
      store.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {}
  }
}

function schedulePersist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(persistNow, PERSIST_DELAY_MS);
}

// ── sanitising ────────────────────────────────────────────────────────────

function cleanString(s: string): string {
  const masked = s.replace(JWT, "[token]").replace(EMAIL, "[email]");
  return masked.length > MAX_STRING ? `${masked.slice(0, MAX_STRING)}… (${masked.length} chars)` : masked;
}

/** A plain description of an Error (or ApiError-like object). */
export function describeError(e: unknown): Record<string, unknown> {
  if (e instanceof Error) {
    const out: Record<string, unknown> = { name: e.name, message: cleanString(e.message) };
    const status = (e as { status?: unknown }).status;
    if (typeof status === "number") out.status = status;
    if (e.stack) {
      out.stack = e.stack
        .split("\n")
        .slice(1, 7)
        .map((l) => cleanString(l.trim()))
        .join("\n");
    }
    return out;
  }
  return { message: cleanString(String(e)) };
}

function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return cleanString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (value instanceof Error) return describeError(value);
  if (depth >= MAX_DEPTH) return "[…]";
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map((v) => sanitize(v, depth + 1));
    if (value.length > MAX_ITEMS) items.push(`… ${value.length - MAX_ITEMS} more`);
    return items;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    const keys = Object.keys(value as object);
    for (const k of keys.slice(0, MAX_KEYS)) {
      out[k] = SECRET_KEY.test(k) ? "[hidden]" : sanitize((value as Record<string, unknown>)[k], depth + 1);
    }
    if (keys.length > MAX_KEYS) out["…"] = `${keys.length - MAX_KEYS} more keys`;
    return out;
  }
  return cleanString(String(value));
}

/** The `data` argument may be an Error, an object of fields, or anything else. */
function toData(data: unknown): Record<string, unknown> | undefined {
  if (data === undefined) return undefined;
  if (data instanceof Error) return { error: describeError(data) };
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return sanitize(data) as Record<string, unknown>;
  }
  return { value: sanitize(data) };
}

// ── settings ──────────────────────────────────────────────────────────────

let verboseCache: boolean | null = null;

/** Detailed logging keeps debug entries (every API request, sync step) in the buffer. */
export function isVerbose(): boolean {
  if (verboseCache === null) {
    try {
      verboseCache = storage()?.getItem(VERBOSE_KEY) === "true";
    } catch {
      verboseCache = false;
    }
  }
  return verboseCache;
}

export function setVerbose(on: boolean): void {
  verboseCache = on;
  try {
    if (on) storage()?.setItem(VERBOSE_KEY, "true");
    else storage()?.removeItem(VERBOSE_KEY);
  } catch {}
}

function mirrorToConsole(level: LogLevel): boolean {
  const env = (import.meta as { env?: { DEV?: boolean; MODE?: string } }).env;
  if (env?.MODE === "test") return false;
  return env?.DEV === true || LEVEL_ORDER[level] >= LEVEL_ORDER.warn;
}

// ── writing ───────────────────────────────────────────────────────────────

function write(level: LogLevel, area: string, msg: string, data?: unknown): void {
  let cleanData: Record<string, unknown> | undefined;
  try {
    cleanData = toData(data);
  } catch {
    cleanData = { note: "data could not be recorded" };
  }

  if (mirrorToConsole(level)) {
    const fn = level === "debug" ? console.debug : level === "info" ? console.info : level === "warn" ? console.warn : console.error;
    if (cleanData) fn(`[${area}] ${msg}`, cleanData);
    else fn(`[${area}] ${msg}`);
  }

  if (level === "debug" && !isVerbose()) return;

  const list = buffer();
  const now = Date.now();
  const message = cleanString(msg);

  for (let i = list.length - 1; i >= Math.max(0, list.length - REPEAT_WINDOW); i--) {
    const e = list[i]!;
    if (e.level === level && e.area === area && e.msg === message) {
      e.n = (e.n ?? 1) + 1;
      e.tLast = now;
      if (cleanData) e.data = cleanData; // keep the latest details
      // Move it to the end so the list stays in order of latest activity.
      list.splice(i, 1);
      list.push(e);
      afterWrite(level);
      return;
    }
  }

  const entry: LogEntry = { t: now, level, area, msg: message };
  if (cleanData) entry.data = cleanData;
  list.push(entry);
  if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES);
  afterWrite(level);
}

function afterWrite(level: LogLevel): void {
  // An error may be followed by a crash or the app being killed: save it straight away.
  if (level === "error") persistNow();
  else schedulePersist();
  for (const fn of listeners) {
    try {
      fn();
    } catch {}
  }
}

export const log = {
  debug: (area: string, msg: string, data?: unknown) => write("debug", area, msg, data),
  info: (area: string, msg: string, data?: unknown) => write("info", area, msg, data),
  warn: (area: string, msg: string, data?: unknown) => write("warn", area, msg, data),
  error: (area: string, msg: string, data?: unknown) => write("error", area, msg, data),
};

// ── reading ───────────────────────────────────────────────────────────────

/** A copy of the buffer, oldest first. */
export function getLogEntries(): LogEntry[] {
  return buffer().map((e) => ({ ...e }));
}

export function clearLog(): void {
  entries = [];
  persistNow();
  for (const fn of listeners) {
    try {
      fn();
    } catch {}
  }
}

/** Called after every new or repeated entry. Returns an unsubscribe function. */
export function onLogChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Write any pending entries to storage now (e.g. when the app goes to the background). */
export function flushLog(): void {
  if (entries) persistNow();
}

// ── formatting ────────────────────────────────────────────────────────────

function iso(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").replace("Z", "");
}

export function formatLogEntry(e: LogEntry): string {
  const repeat = e.n && e.n > 1 ? ` (×${e.n}, last ${iso(e.tLast ?? e.t)})` : "";
  const data = e.data ? ` ${JSON.stringify(e.data)}` : "";
  return `${iso(e.t)} ${e.level.toUpperCase().padEnd(5)} ${e.area.padEnd(8)} ${e.msg}${repeat}${data}`;
}

/** The whole log as text, with a header of key: value lines (device, app version, …). Times
 * are UTC. */
export function formatLog(header: Record<string, string | number | boolean | null | undefined>, list = getLogEntries()): string {
  const lines = ["Logit diagnostics", `Created: ${iso(Date.now())} UTC`];
  for (const [k, v] of Object.entries(header)) {
    if (v !== undefined && v !== null && v !== "") lines.push(`${k}: ${cleanString(String(v))}`);
  }
  lines.push(`Entries: ${list.length}`, "", ...list.map(formatLogEntry));
  return lines.join("\n") + "\n";
}

// ── crash capture ─────────────────────────────────────────────────────────

let captureInstalled = false;

/** Record uncaught errors and unhandled promise rejections, and save the log when the page is
 * hidden or closed. Safe to call more than once. */
export function captureGlobalErrors(): void {
  if (captureInstalled || typeof window === "undefined") return;
  captureInstalled = true;

  window.addEventListener("error", (event) => {
    // Resource load failures (an <img> 404) arrive here too, without an error object.
    if (!(event instanceof ErrorEvent)) return;
    log.error("crash", event.message || "Uncaught error", {
      error: event.error ?? undefined,
      at: event.filename ? `${event.filename.split("/").pop()}:${event.lineno}:${event.colno}` : undefined,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const msg = reason instanceof Error ? reason.message : "Unhandled promise rejection";
    log.error("crash", `Unhandled rejection: ${msg}`, reason instanceof Error ? reason : { reason });
  });

  window.addEventListener("pagehide", flushLog);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushLog();
  });
}

/** For tests: forget everything in memory and storage. */
export function _resetLogForTests(): void {
  entries = null;
  verboseCache = null;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  listeners.clear();
  try {
    storage()?.removeItem(STORAGE_KEY);
    storage()?.removeItem(VERBOSE_KEY);
  } catch {}
}
