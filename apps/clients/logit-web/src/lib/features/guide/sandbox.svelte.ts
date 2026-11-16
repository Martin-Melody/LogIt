// The coach sandbox on the web: the sample clients, adding / resetting / removing them, and
// the loop that lets them act (sandboxDriver in core). Pages that show what samples do
// (requests, check-ins, messages, a client's programs) reload on onSampleActivity.
import { sandboxApi, type SandboxClient } from "@logit/core/api/sandboxApi";
import { addSampleClients, removeSampleClients, resetSampleClients, runSampleClients } from "@logit/core/guide/sandboxDriver";
import { SAMPLE_CLIENTS } from "@logit/core/guide/sandbox";
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
    try {
      this.clients = await sandboxApi.list();
    } catch {
      this.clients = [];
    }
    this.loaded = true;
    this.loop();
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

  add = () => this.run(() => addSampleClients());
  reset = () => this.run(() => resetSampleClients());
  remove = () => this.run(() => removeSampleClients());

  private notify() {
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
