<script lang="ts">
  import { goto } from "$app/navigation";
  import { back } from "$lib/navigation";
  import { ArrowLeft } from "lucide-svelte";
  import { Button } from "$lib/components/ui/button";
  import { BUILTIN_PROGRAMS } from "@logit/core/domain/builtinPrograms";

  // Permanent "pick a plan, or don't" entry point (adaptive-progression-engine.md
  // §2, §6) — reachable any time, not just at onboarding, so switching to or
  // between guided programs later doesn't require redoing onboarding.
</script>

<div class="flex flex-col pb-24">
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <Button variant="ghost" size="icon" class="h-8 w-8 shrink-0" onclick={() => back("/splits")}>
      <ArrowLeft class="h-4 w-4" />
    </Button>
    <div class="min-w-0 flex-1">
      <p class="text-sm font-semibold">Browse programs</p>
      <p class="text-xs text-muted-foreground">Day-by-day, week-by-week — no configuration needed.</p>
    </div>
  </div>

  <ul class="divide-y divide-border">
    {#each BUILTIN_PROGRAMS as program (program.id)}
      <li>
        <button
          type="button"
          class="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-muted/40 active:bg-muted/60 transition-colors"
          onclick={() => goto(`/programs/builtin/${program.id}`)}
        >
          <div class="min-w-0 flex-1">
            <span class="text-sm font-medium truncate">{program.name}</span>
            <p class="text-xs text-muted-foreground mt-0.5">{program.description}</p>
            <p class="text-xs text-muted-foreground/70 mt-0.5">
              {program.weeks[0]?.days.length ?? 0} day{(program.weeks[0]?.days.length ?? 0) === 1 ? "" : "s"}/week
            </p>
          </div>
          <span class="text-muted-foreground text-sm shrink-0">›</span>
        </button>
      </li>
    {/each}
  </ul>
</div>
