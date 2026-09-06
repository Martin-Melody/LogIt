<script lang="ts">
  import { goto } from "$app/navigation";
  import { ChevronRight, Dumbbell, Trophy, CalendarDays, Activity, Cpu, LayoutDashboard, Flame } from "lucide-svelte";
  import type { ApiPost } from "@logit/core/api/socialApi";

  const { post }: { post: ApiPost } = $props();

  // The card is a preview — tapping opens the full breakdown (and the "Copy to mine" button
  // lives there now, not inline here).
  function openDetail(e: MouseEvent) {
    e.stopPropagation();
    void goto(`/social/post/${post.id}/content`);
  }

  const payload = $derived.by(() => {
    if (!post.payloadJson) return null;
    try {
      return JSON.parse(post.payloadJson) as Record<string, unknown> & {
        duration?: number;
        exercises?: { name: string; sets: number }[];
        exerciseName?: string;
        weight?: number;
        unit?: string;
        reps?: number;
        name?: string;
        days?: { name?: string; blocks?: unknown[] }[];
        notes?: string;
        family?: string;
        description?: string;
        author?: string;
        cadence?: { kind: "daily" } | { kind: "days"; days: number[] } | { kind: "weekly"; timesPerWeek: number };
      };
    } catch {
      return null;
    }
  });

  const icon = $derived(
    post.type === "WorkoutSession" ? Dumbbell
    : post.type === "PersonalRecord" ? Trophy
    : post.type === "Split" ? CalendarDays
    : post.type === "Exercise" ? Activity
    : post.type === "Algorithm" ? Cpu
    : post.type === "Widget" ? LayoutDashboard
    : post.type === "Habit" ? Flame
    : null,
  );

  const label = $derived(
    post.type === "WorkoutSession" ? "Workout"
    : post.type === "PersonalRecord" ? "Personal record"
    : post.type === "Split" ? "Split"
    : post.type === "Exercise" ? "Exercise"
    : post.type === "Algorithm" ? "Algorithm"
    : post.type === "Widget" ? "Widget"
    : post.type === "Habit" ? "Habit"
    : null,
  );

  function cadenceLabel(c: NonNullable<NonNullable<typeof payload>["cadence"]>): string {
    if (c.kind === "daily") return "Every day";
    if (c.kind === "weekly") return `${c.timesPerWeek}x per week`;
    return `${c.days.length} day${c.days.length === 1 ? "" : "s"}/week`;
  }
</script>

{#if payload && icon && label}
  {@const Icon = icon}
  <button
    type="button"
    class="w-full text-left rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs flex flex-col gap-1 hover:bg-muted/50 transition-colors"
    onclick={openDetail}
  >
    <div class="flex items-center justify-between gap-1.5 text-muted-foreground">
      <span class="flex items-center gap-1.5">
        <Icon class="h-3 w-3" />
        <span class="uppercase tracking-wide text-[10px] font-medium">{label}</span>
      </span>
      <ChevronRight class="h-3.5 w-3.5 shrink-0" />
    </div>

    {#if post.type === "WorkoutSession"}
      {#if payload.duration}
        <span class="text-sm font-medium text-foreground">{Math.round(payload.duration / 60000)} min</span>
      {/if}
      {#if payload.exercises?.length}
        <span class="text-muted-foreground">
          {payload.exercises.map((e) => `${e.name} (${e.sets})`).join(" · ")}
        </span>
      {/if}

    {:else if post.type === "PersonalRecord" && payload.exerciseName}
      <span class="text-sm font-medium text-foreground">{payload.exerciseName}</span>
      <span class="text-muted-foreground">
        {#if payload.weight}{payload.weight}{payload.unit ?? "kg"}{/if}
        {#if payload.reps} × {payload.reps} reps{/if}
      </span>

    {:else if post.type === "Split" && payload.name}
      <span class="text-sm font-medium text-foreground">{payload.name}</span>
      {#if payload.days?.length}
        <span class="text-muted-foreground">
          {payload.days.map((d) => `${d.name ?? "Day"}${d.blocks?.length ? ` (${d.blocks.length})` : ""}`).join(" · ")}
        </span>
      {/if}

    {:else if post.type === "Exercise" && payload.name}
      <span class="text-sm font-medium text-foreground">{payload.name}</span>
      {#if payload.notes}<span class="text-muted-foreground">{payload.notes}</span>{/if}

    {:else if post.type === "Algorithm" && payload.name}
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-foreground">{payload.name}</span>
        {#if payload.family}
          <span class="capitalize rounded border border-border px-1.5 py-0.5 text-[10px]">{payload.family}</span>
        {/if}
      </div>
      {#if payload.description}<span class="text-muted-foreground">{payload.description}</span>{/if}
      {#if payload.author}<span class="text-muted-foreground/60">by {payload.author}</span>{/if}

    {:else if post.type === "Widget" && payload.name}
      <span class="text-sm font-medium text-foreground">{payload.name}</span>
      {#if payload.description}<span class="text-muted-foreground">{payload.description}</span>{/if}

    {:else if post.type === "Habit" && payload.name}
      <span class="text-sm font-medium text-foreground">{payload.name}</span>
      {#if payload.cadence}<span class="text-muted-foreground">{cadenceLabel(payload.cadence)}</span>{/if}
    {/if}
  </button>
{/if}
