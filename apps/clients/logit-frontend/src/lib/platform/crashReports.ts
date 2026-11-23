import { apiClient } from "@logit/core/api/client";
import { getServerMode } from "@logit/core/api/serverConfig";
import { formatLog, getLogEntries, onLogChange, type LogEntry } from "@logit/core/platform/log";
import { deviceInfoHeader, getDeviceInfo } from "./deviceInfo";

/**
 * Test builds (VITE_CRASH_REPORTS=auto, set by the Android release workflow for every Play track
 * but production) send each crash to the hosted service by themselves, also without an account:
 * the crash, the log lines before it and the device header. Production builds send nothing;
 * there the Send button in Settings › About › Diagnostics is the only way out. Self-hosted: never.
 */
export const crashReportsOn = import.meta.env.VITE_CRASH_REPORTS === "auto";

/** Keep in step with DiagnosticsLimits.MaxCrashLogChars on the server. */
export const MAX_CRASH_LOG_CHARS = 50_000;
const LINES_BEFORE = 30;
const MAX_PER_SESSION = 3;
const PENDING_KEY = "logit:crash:pending:v1";
const MAX_PENDING = 3;

interface CrashReport {
  appVersion: string;
  platform: string;
  log: string;
}

const sentThisSession = new Set<string>();

function readPending(): CrashReport[] {
  try {
    const list = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writePending(list: CrashReport[]): void {
  try {
    if (list.length) localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-MAX_PENDING)));
    else localStorage.removeItem(PENDING_KEY);
  } catch {}
}

/** Whether this log entry is a crash worth sending now: once per message, a few per session. */
export function shouldSend(entry: LogEntry | undefined, sent: Set<string>): boolean {
  return !!entry && entry.level === "error" && entry.area === "crash" && !sent.has(entry.msg) && sent.size < MAX_PER_SESSION;
}

async function post(report: CrashReport): Promise<"sent" | "offline" | "refused"> {
  try {
    await apiClient.fetch("/diagnostics/crashes", { method: "POST", body: JSON.stringify(report) });
    return "sent";
  } catch (e) {
    // An ApiError carries the status the server answered with; anything else means no answer.
    return typeof (e as { status?: unknown }).status === "number" ? "refused" : "offline";
  }
}

async function report(): Promise<void> {
  const info = await getDeviceInfo();
  let text = formatLog(deviceInfoHeader(info), getLogEntries().slice(-(LINES_BEFORE + 1)));
  if (text.length > MAX_CRASH_LOG_CHARS) text = text.slice(-MAX_CRASH_LOG_CHARS);
  const r: CrashReport = { appVersion: info.appVersion, platform: info.platform, log: text };
  // No signal (common in a gym): keep it for the next start.
  if ((await post(r)) === "offline") writePending([...readPending(), r]);
}

async function sendPending(): Promise<void> {
  const pending = readPending();
  if (!pending.length) return;
  const left: CrashReport[] = [];
  for (const r of pending) if ((await post(r)) === "offline") left.push(r);
  writePending(left);
}

let started = false;

/** Called once at app start (after captureGlobalErrors). Does nothing outside test builds. */
export function startCrashReports(): void {
  if (!crashReportsOn || started || getServerMode() === "selfhosted") return;
  started = true;
  void sendPending();
  onLogChange((entry) => {
    if (!shouldSend(entry, sentThisSession)) return;
    sentThisSession.add(entry!.msg);
    void report();
  });
}
