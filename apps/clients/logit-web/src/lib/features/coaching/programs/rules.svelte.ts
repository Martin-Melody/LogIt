// Your rules (canvas PG10): progression rules built from blocks, the same recipes lifters build
// on the phone (Settings › Progression › Build), synced through /sync/progression-recipes. A
// program uses one by carrying its blocks (ProgramRule "own"), so clients' phones can run it.
import { syncApi } from "@logit/core/api/syncApi";
import { normalizeRecipe, toSharedRecipe, type ProgressionRecipe } from "@logit/core/domain/progressionRecipe";
import type { ProgramRule } from "@logit/core/domain/CoachProgram";

class Rules {
  list = $state<ProgressionRecipe[]>([]);
  loaded = $state(false);
  private loading: Promise<void> | null = null;

  load(force = false): Promise<void> {
    if (this.loaded && !force) return Promise.resolve();
    this.loading ??= syncApi.pullProgressionRecipes(0).then(({ recipes }) => {
      this.list = recipes
        .filter((r) => !r.deletedAtMs && r.dataJson)
        .map((r) => { try { return normalizeRecipe({ ...JSON.parse(r.dataJson!), id: r.id }); } catch { return null; } })
        .filter((r): r is ProgressionRecipe => !!r && !r.deletedAtMs)
        .sort((a, b) => a.name.localeCompare(b.name));
      this.loaded = true;
    }).finally(() => (this.loading = null));
    return this.loading;
  }

  async save(r: ProgressionRecipe): Promise<void> {
    const next = { ...normalizeRecipe(r), updatedAtMs: Date.now() };
    await syncApi.pushProgressionRecipes([{ id: next.id, createdAtMs: next.createdAtMs, updatedAtMs: next.updatedAtMs, dataJson: JSON.stringify(next) }]);
    this.list = [...this.list.filter((x) => x.id !== next.id), next].sort((a, b) => a.name.localeCompare(b.name));
  }

  async remove(r: ProgressionRecipe): Promise<void> {
    const now = Date.now();
    await syncApi.pushProgressionRecipes([{ id: r.id, createdAtMs: r.createdAtMs, updatedAtMs: now, dataJson: JSON.stringify({ ...r, deletedAtMs: now }), deletedAtMs: now }]);
    this.list = this.list.filter((x) => x.id !== r.id);
  }
}

export const rules = new Rules();

/** A program rule for one of your recipes: its blocks travel with the program. */
export function ownRule(r: ProgressionRecipe): ProgramRule {
  return { kind: "own", ruleId: r.id, name: r.name, recipe: toSharedRecipe(r) };
}
