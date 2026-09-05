<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import {
    ArrowLeft, Loader2, Download, Dumbbell, Trophy, CalendarDays,
    Activity, Cpu, LayoutDashboard, Flame,
  } from "lucide-svelte";
  import { socialApi, type ApiPost, type PostType } from "@logit/core/api/socialApi";
  import { ApiError } from "@logit/core/api/client";
  import { authStore } from "$lib/api/authStore.svelte";
  import { toast } from "svelte-sonner";
  import {
    copyAlgorithmToMine, copyWidgetToMine, copySplitToMine, copyExerciseToMine, copyHabitToMine,
    type AlgorithmFamily, type CopyableSplit, type CopyableExercise, type CopyableHabit,
  } from "$lib/features/social/copyToMine";

  const id = $derived(page.params.id ?? "");

  let post = $state<ApiPost | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(true);
  let copying = $state(false);

  // A repost carries a copy of the original's type/payload, but the *authoritative* content
  // and attribution belong to the original — prefer repostOf when present.
  const source = $derived.by(() => {
    if (!post) return null;
    const s = post.repostOf ?? post;
    return { type: s.type as PostType, payloadJson: s.payloadJson, authorUsername: s.authorUsername, deleted: post.repostOf?.deleted ?? false };
  });

  const payload = $derived.by((): Record<string, any> | null => {
    if (!source?.payloadJson) return null;
    try { return JSON.parse(source.payloadJson); } catch { return null; }
  });

  const copyable = $derived(
    !!source && ["Split", "Exercise", "Algorithm", "Habit", "Widget"].includes(source.type),
  );

  const meta = $derived.by(() => {
    switch (source?.type) {
      case "WorkoutSession": return { icon: Dumbbell, label: "Workout" };
      case "PersonalRecord": return { icon: Trophy, label: "Personal record" };
      case "Split": return { icon: CalendarDays, label: "Split" };
      case "Exercise": return { icon: Activity, label: "Exercise" };
      case "Algorithm": return { icon: Cpu, label: "Algorithm" };
      case "Widget": return { icon: LayoutDashboard, label: "Widget" };
      case "Habit": return { icon: Flame, label: "Habit" };
      default: return null;
    }
  });

  onMount(() => void load());

  async function load() {
    loading = true;
    error = null;
    try {
      post = await socialApi.getPost(id);
    } catch (e) {
      error = e instanceof ApiError && e.status === 404 ? "This isn't available." : "Couldn't load this.";
    } finally {
      loading = false;
    }
  }

  function cap(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function cadenceLabel(c: any): string {
    if (!c) return "";
    if (c.kind === "daily") return "Every day";
    if (c.kind === "weekly") return `${c.timesPerWeek}× per week`;
    const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return (c.days ?? []).map((d: number) => DAYS[d]).join(", ");
  }

  async function copyToMine() {
    if (copying || !copyable || !payload || !source) return;
    copying = true;
    try {
      if (source.type === "Algorithm") {
        if (!payload.id) throw new Error("missing id");
        await copyAlgorithmToMine(payload.id, (payload.family ?? "progression") as AlgorithmFamily);
        toast.success("Added to your settings");
      } else if (source.type === "Widget") {
        if (!payload.id) throw new Error("missing id");
        const applied = copyWidgetToMine(payload.id);
        toast[applied ? "success" : "error"](
          applied ? "Widget enabled on your profile" : "That widget isn't available on your device",
        );
      } else if (source.type === "Split") {
        await copySplitToMine(payload as unknown as CopyableSplit);
        toast.success("Split added to your splits");
      } else if (source.type === "Exercise") {
        await copyExerciseToMine(payload as unknown as CopyableExercise);
        toast.success("Exercise added to your library");
      } else if (source.type === "Habit") {
        await copyHabitToMine(payload as unknown as CopyableHabit);
        toast.success("Habit added to your habits");
      }
    } catch {
      toast.error("Couldn't copy this");
    } finally {
      copying = false;
    }
  }
</script>

<div class="flex flex-col min-h-full">
  <header class="flex items-center gap-2 px-3 h-12 sticky top-0 bg-background/95 backdrop-blur z-10 border-b border-border">
    <button type="button" class="p-1 -ml-1 text-muted-foreground" aria-label="Back" onclick={() => history.back()}>
      <ArrowLeft class="h-5 w-5" />
    </button>
    <h1 class="text-base font-semibold">{meta?.label ?? "Details"}</h1>
  </header>

  {#if loading}
    <div class="flex justify-center py-20"><Loader2 class="h-5 w-5 animate-spin text-muted-foreground" /></div>

  {:else if error}
    <div class="flex flex-col items-center gap-3 py-20 text-center px-6">
      <p class="text-sm text-muted-foreground">{error}</p>
      <button type="button" class="text-sm text-primary" onclick={load}>Try again</button>
    </div>

  {:else if source?.deleted}
    <div class="flex flex-col items-center gap-2 py-20 text-center px-6">
      <p class="text-sm text-muted-foreground">The original post was deleted.</p>
    </div>

  {:else if source && payload && meta}
    {@const Icon = meta.icon}
    <div class="flex-1 flex flex-col gap-4 px-4 py-4">
      <!-- Attribution -->
      <button type="button" class="text-xs text-muted-foreground self-start hover:text-foreground"
        onclick={() => goto(`/social/${source.authorUsername}`)}>
        Shared by <span class="font-medium">@{source.authorUsername}</span>
      </button>

      <div class="flex items-center gap-2 text-muted-foreground">
        <Icon class="h-4 w-4" />
        <span class="uppercase tracking-wide text-[11px] font-medium">{meta.label}</span>
      </div>

      {#if source.type === "Split"}
        <h2 class="text-xl font-bold -mt-1">{payload.name}</h2>
        <div class="flex flex-col gap-3">
          {#each payload.days ?? [] as day, i (i)}
            <div class="rounded-lg border border-border p-3">
              <p class="text-sm font-semibold mb-2">{day.name || `Day ${i + 1}`}</p>
              {#if (day.blocks ?? []).length === 0}
                <p class="text-xs text-muted-foreground">Rest day</p>
              {:else}
                <ul class="flex flex-col divide-y divide-border">
                  {#each day.blocks ?? [] as block (block.orderIndex)}
                    <li class="flex items-center justify-between py-1.5 text-sm gap-3">
                      {#if block.type === "strength"}
                        <span class="truncate text-foreground/90">{block.exerciseName}</span>
                        <span class="text-muted-foreground tabular-nums shrink-0 text-xs">
                          {#if block.targets?.sets}{block.targets.sets} ×{/if}
                          {#if block.targets?.reps} {block.targets.reps}{/if}
                          {#if block.targets?.weight} @ {block.targets.weight}kg{/if}
                          {#if !block.targets?.sets && !block.targets?.reps && !block.targets?.weight}—{/if}
                        </span>
                      {:else}
                        <span class="truncate text-foreground/90">{block.activityName}</span>
                        <span class="text-muted-foreground text-xs shrink-0">Cardio</span>
                      {/if}
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          {/each}
        </div>

      {:else if source.type === "Exercise"}
        <h2 class="text-xl font-bold -mt-1">{payload.name}</h2>
        <div class="rounded-lg border border-border p-3 flex flex-col gap-1.5 text-sm">
          {#if payload.exerciseType && payload.exerciseType !== "normal"}
            <p><span class="text-muted-foreground">Type:</span> {cap(payload.exerciseType)}</p>
          {/if}
          {#if (payload.primaryMuscles ?? []).length}
            <p><span class="text-muted-foreground">Primary:</span> {payload.primaryMuscles.map(cap).join(", ")}</p>
          {/if}
          {#if (payload.secondaryMuscles ?? []).length}
            <p><span class="text-muted-foreground">Secondary:</span> {payload.secondaryMuscles.map(cap).join(", ")}</p>
          {/if}
          {#if (payload.machines ?? []).length}
            <p><span class="text-muted-foreground">Machines:</span> {payload.machines.map((m: any) => m.name).join(", ")}</p>
          {/if}
          {#if payload.notes}<p class="text-muted-foreground whitespace-pre-wrap pt-1">{payload.notes}</p>{/if}
        </div>

      {:else if source.type === "Algorithm"}
        <div class="flex items-center gap-2 -mt-1">
          <h2 class="text-xl font-bold">{payload.name}</h2>
          {#if payload.family}
            <span class="capitalize rounded border border-border px-1.5 py-0.5 text-[10px]">{payload.family}</span>
          {/if}
        </div>
        {#if payload.description}<p class="text-sm text-muted-foreground whitespace-pre-wrap">{payload.description}</p>{/if}
        {#if payload.author}<p class="text-xs text-muted-foreground/60">by {payload.author}</p>{/if}

      {:else if source.type === "Habit"}
        <h2 class="text-xl font-bold -mt-1">{payload.name}</h2>
        <div class="rounded-lg border border-border p-3 flex flex-col gap-1.5 text-sm">
          <p><span class="text-muted-foreground">Cadence:</span> {cadenceLabel(payload.cadence)}</p>
          {#if payload.target?.value}
            <p><span class="text-muted-foreground">Target:</span> {payload.target.value}{payload.target.unit ? ` ${payload.target.unit}` : ""}</p>
          {/if}
        </div>

      {:else if source.type === "Widget"}
        <h2 class="text-xl font-bold -mt-1">{payload.name}</h2>
        {#if payload.description}<p class="text-sm text-muted-foreground">{payload.description}</p>{/if}

      {:else if source.type === "WorkoutSession"}
        {#if payload.duration}
          <h2 class="text-xl font-bold -mt-1">{Math.round(payload.duration / 60000)} min</h2>
        {/if}
        {#if (payload.exercises ?? []).length}
          <ul class="rounded-lg border border-border divide-y divide-border">
            {#each payload.exercises as ex (ex.name)}
              <li class="flex items-center justify-between px-3 py-2 text-sm">
                <span class="truncate">{ex.name}</span>
                <span class="text-muted-foreground text-xs shrink-0">{ex.sets} set{ex.sets === 1 ? "" : "s"}</span>
              </li>
            {/each}
          </ul>
        {/if}

      {:else if source.type === "PersonalRecord"}
        <h2 class="text-xl font-bold -mt-1">{payload.exerciseName}</h2>
        <p class="text-sm text-muted-foreground">
          {#if payload.weight}{payload.weight}{payload.unit ?? "kg"}{/if}
          {#if payload.reps} × {payload.reps} reps{/if}
        </p>
      {/if}
    </div>

    {#if copyable && authStore.isAuthenticated}
      <div class="sticky bottom-0 bg-background border-t border-border px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <button
          type="button"
          class="w-full flex items-center justify-center gap-2 rounded bg-primary text-primary-foreground text-sm font-medium py-2.5 disabled:opacity-50"
          disabled={copying}
          onclick={copyToMine}
        >
          {#if copying}<Loader2 class="h-4 w-4 animate-spin" />{:else}<Download class="h-4 w-4" />{/if}
          Copy to mine
        </button>
      </div>
    {/if}

  {:else}
    <div class="flex flex-col items-center gap-2 py-20 text-center px-6">
      <p class="text-sm text-muted-foreground">Nothing to show here.</p>
    </div>
  {/if}
</div>
