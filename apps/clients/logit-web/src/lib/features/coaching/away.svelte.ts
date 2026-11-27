// The coach's own away (canvas Z7): loaded once, opened from the profile menu, ⌘K or Today.
import { coachApi, type CoachAway } from "@logit/core/api/coachApi";

class Away {
  value = $state<CoachAway | null>(null);
  loaded = $state(false);
  dialogOpen = $state(false);
  private loading: Promise<void> | null = null;

  load(force = false): Promise<void> {
    if (this.loaded && !force) return Promise.resolve();
    this.loading ??= coachApi.getAway().then(
      (a) => { this.value = a; this.loaded = true; },
      () => { this.loaded = true; },
    ).finally(() => (this.loading = null));
    return this.loading;
  }

  async set(input: Parameters<typeof coachApi.setAway>[0]) {
    this.value = await coachApi.setAway(input);
  }

  async end() {
    await coachApi.endAway();
    this.value = null;
  }
}

export const coachAway = new Away();
