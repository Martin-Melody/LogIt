// The coach sandbox on the web: the sample clients, adding / resetting / removing them, and
// the loop that lets them act (sandboxDriver in core). Pages that show what samples do
// (requests, check-ins, messages, a client's programs) reload on onSampleActivity.
import { sandboxApi, type SandboxClient } from "@logit/core/api/sandboxApi";
import { addSampleClients, removeSampleClients, resetSampleClients, runSampleClients } from "@logit/core/guide/sandboxDriver";
import { SAMPLE_CLIENTS } from "@logit/core/guide/sandbox";
import { apiClient } from "@logit/core/api/client";
import { coachBadges } from "$lib/features/coaching/badges.svelte";

const TICK_MS = 4_000;
type Listener = () => void;
const listeners = new Set<Listener>();

/** Call to reload when a sample client did something (asked to join, sent a check-in, replied). */
export function onSampleActivity(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

class Sandbox {
  clients = $state<SandboxClient[]>([]);
  loaded = $state(false);
  busy = $state(false);
  error = $state<string | null>(null);
  private timer: ReturnType<typeof setInterval> | null = null;

  get on() {
    return this.clients.length > 0;
  }

  isSample(userId: string | undefined | null): boolean {
    return !!userId && this.clients.some((c) => c.userId === userId);
  }

  private refreshing: Promise<void> | null = null;

  /** Reloads the sample clients; concurrent calls share one request. */
  refresh(): Promise<void> {
    this.refreshing ??= this.doRefresh().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  private async doRefresh() {
    const before = practice.on;
    try {
      this.clients = await sandboxApi.list();
    } catch {
      this.clients = [];
    }
    this.loaded = true;
    this.loop();
    // Pages often load before this answers: if Practice view turned out different from what
    // they assumed, they load again (otherwise real people show in Practice view, or samples outside it).
    if (practice.on !== before) this.notify();
  }

  private async run<T>(work: () => Promise<T>) {
    this.busy = true;
    this.error = null;
    try {
      await work();
    } catch (e) {
      this.error = e instanceof Error ? e.message : "That didn't work. Try again.";
    } finally {
      this.busy = false;
      await this.refresh();
      this.notify();
    }
  }

  // Adding samples opens Practice view, to see them; removing them closes it.
  add = () => this.run(() => addSampleClients()).then(() => practice.set(true));
  reset = () => this.run(() => resetSampleClients());
  remove = () => this.run(() => removeSampleClients()).then(() => practice.set(false));

  notify() {
    void coachBadges.refresh(true, true);
    for (const l of listeners) l();
  }

  /** While there are samples, let them act every few seconds. */
  private loop() {
    if (this.on && !this.timer) {
      this.timer = setInterval(() => {
        if (document.hidden || this.busy) return;
        void runSampleClients()
          .then((acted) => {
            if (acted > 0) this.notify();
          })
          .catch(() => {});
      }, TICK_MS);
    } else if (!this.on && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const sandbox = new Sandbox();
export const SAMPLES = SAMPLE_CLIENTS;

const PRACTICE_KEY = "logit:practice-view";

/**
 * Practice view (canvas V1-V5): sample clients live on the coach's own account, but people
 * pages show either the samples or the real clients, never both. On: only samples. Off: no
 * samples anywhere, in lists, counts, badges or the client picker. The coach's programs,
 * forms, packages and links are the same in both. An account trying Studio coaches samples
 * only, so for it Practice view is always on.
 */
class Practice {
  private chosen = $state(typeof localStorage !== "undefined" && localStorage.getItem(PRACTICE_KEY) === "1");

  /** Trying Studio (below Studio on getlogit.app, samples only): no real clients to switch to. */
  get locked(): boolean {
    const tier = apiClient.getUser()?.tier;
    return sandbox.on && !!tier && tier !== "Studio" && !apiClient.isSelfHosted();
  }

  get on(): boolean {
    return sandbox.on && (this.locked || this.chosen);
  }

  set(on: boolean) {
    if (on === this.chosen) return;
    this.chosen = on;
    try {
      localStorage.setItem(PRACTICE_KEY, on ? "1" : "0");
    } catch {
      /* private mode: it lasts this visit */
    }
    sandbox.notify();
  }

  /** Whether something belonging to a client with this `isSample` is shown right now. */
  shows(isSample: boolean | undefined): boolean {
    return this.on ? !!isSample : !isSample;
  }
}

export const practice = new Practice();
