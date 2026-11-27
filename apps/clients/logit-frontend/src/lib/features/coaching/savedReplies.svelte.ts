import { coachApi } from "@logit/core/api/coachApi";
import type { SavedReply } from "@logit/core/domain/savedReplies";

/** A coach's saved replies on the phone (canvas W6, W10), loaded once; made on the web. */
class SavedRepliesState {
  list = $state<SavedReply[]>([]);
  loaded = $state(false);
  private loading: Promise<void> | null = null;
  load(): Promise<void> {
    this.loading ??= coachApi.getSavedReplies().then(
      (r) => { this.list = r; this.loaded = true; },
      () => { this.loaded = true; this.loading = null; },
    );
    return this.loading;
  }
}
export const savedReplies = new SavedRepliesState();
