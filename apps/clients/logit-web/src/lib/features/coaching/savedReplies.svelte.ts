import { coachApi } from "@logit/core/api/coachApi";
import { createId } from "@logit/core/domain/ids";
import { STARTER_REPLIES, type SavedReply } from "@logit/core/domain/savedReplies";

/** The coach's saved replies (canvas W10), loaded once and shared by every message box. */
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

  async save(next: SavedReply[]): Promise<void> {
    const before = this.list;
    this.list = next;
    try {
      this.list = await coachApi.saveSavedReplies(next);
    } catch (e) {
      this.list = before;
      throw e;
    }
  }

  /** The canvas examples, for a coach with none yet. */
  starters(): SavedReply[] {
    return STARTER_REPLIES.map((r) => ({ ...r, id: createId("reply") }));
  }
}

export const savedReplies = new SavedRepliesState();
