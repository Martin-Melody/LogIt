<script lang="ts">
  import { ChevronDown, ChevronUp, Pause, Play, SkipForward, Check, Minus, Plus } from "lucide-svelte";
  import { currentSession } from "$lib/stores/currentSession.store";
  import { blockGroup, groupLabel } from "@logit/core/domain/workout";
  import {
    currentStep,
    phaseElapsedMs,
    phaseRemainingMs,
    upcomingSteps,
    type CircuitStep,
  } from "@logit/core/domain/circuit";
  import { circuitNow, circuitRunner } from "./circuitRunner";

  // The countdown while a circuit runs: full screen (the approved mockups 4–7, 10),
  // or shrunk to a bar above the finish bar so the workout list can be seen.
  const { bottomOffset = 0 }: { bottomOffset?: number } = $props();

  const run = $derived($circuitRunner.run);
  const session = $derived($currentSession);
  // The runner's clock moves 5 times a second, enough for the digits but not the ring:
  // while the timer is on screen and running, follow every frame instead.
  let frameNow = $state(Date.now());
  $effect(() => {
    if (!$circuitRunner.run || $circuitRunner.run.pausedAtMs != null) return;
    let id = requestAnimationFrame(function frame() {
      frameNow = Date.now();
      id = requestAnimationFrame(frame);
    });
    return () => cancelAnimationFrame(id);
  });
  const now = $derived(Math.max($circuitNow, frameNow));

  const step = $derived(run && session ? currentStep(session, run) : null);
  // During the rest, the set after it is the first thing up next.
  const upcoming = $derived.by(() => {
    if (!run || !session) return [];
    const after = upcomingSteps(session, run, 2);
    return run.phase.kind === "rest" && step ? [step, ...after].slice(0, 2) : after;
  });
  const phase = $derived(run?.phase ?? null);
  const paused = $derived(run?.pausedAtMs != null);
  const elapsedMs = $derived(run ? phaseElapsedMs(run, now) : 0);

  const title = $derived.by(() => {
    if (!run || !session) return "Circuit";
    const members = session.blocks.filter((b) => blockGroup(b)?.id === run.supersetId);
    const info = members[0] ? blockGroup(members[0]) : undefined;
    return groupLabel(members.length, info?.label, info?.kind);
  });

  // Hold: total = goal plus any +10 s. Rest: its length. Lead-in: 3 or 5 s.
  const totalMs = $derived.by(() => {
    if (!phase) return 1;
    if (phase.kind === "hold") return phase.endsAtMs - phase.startedAtMs;
    if (phase.kind === "rest" || phase.kind === "lead") return phase.durationMs;
    return 1;
  });
  const remainingMs = $derived(run ? Math.min(phaseRemainingMs(run, now), totalMs) : 0);
  const progress = $derived(Math.min(1, Math.max(0, remainingMs / totalMs)));

  // Reps goal: starts at the planned reps, adjustable before Done.
  let repsValue = $state(0);
  let repsFor = "";
  $effect(() => {
    if (phase?.kind === "reps" && step && repsFor !== step.setId) {
      repsFor = step.setId;
      repsValue = step.reps;
    }
  });

  function clock(ms: number): string {
    const total = Math.ceil(ms / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  }
  function sideLabel(side?: string): string {
    return side === "left" ? "left side" : side === "right" ? "right side" : "";
  }
  function stepName(s: CircuitStep): string {
    return s.side ? `${s.drillName}, ${sideLabel(s.side)}` : s.drillName;
  }
  function goal(s: CircuitStep): string {
    return s.metric === "reps" ? `${s.reps} reps` : `${s.goalSec} s`;
  }

  const roundLabel = $derived.by(() => {
    if (!step) return "";
    if (phase?.kind === "rest" && !phase.between) return `Round ${step.round} of ${step.roundCount} done`;
    return `Round ${step.round + 1} of ${step.roundCount}`;
  });

  // Next item is the other side of the same drill this round.
  const nextIsSwitch = $derived(
    phase?.kind !== "rest" &&
      !!step && !!upcoming[0] && upcoming[0].blockId === step.blockId && upcoming[0].round === step.round,
  );
  const upNextLabel = $derived.by(() => {
    const n = upcoming[0];
    if (!n || !step) return "";
    if (phase?.kind === "rest") return phase.between ? "Up next" : `Up next · round ${step.round + 1} of ${step.roundCount}`;
    if (nextIsSwitch) return "Up next · 5 s to switch";
    if (n.round > step.round) return `Up next · round ${n.round + 1}`;
    return "Up next";
  });

  // Ring geometry.
  const R = 130;
  const C = 2 * Math.PI * R;
  const r = 20;
  const c = 2 * Math.PI * r;
</script>

{#if run && phase && phase.kind !== "done"}
  {#if $circuitRunner.expanded}
    <div
      class="fixed inset-0 z-50 flex flex-col bg-[#0e1014] text-[#e4e6eb] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      role="dialog"
      aria-modal="true"
      aria-label="{title} timer"
    >
      <div class="flex items-center px-2 pt-3">
        <button
          type="button"
          class="h-11 w-11 flex items-center justify-center rounded-lg text-[#c3c8d0]"
          aria-label="Shrink to see the workout"
          onclick={() => circuitRunner.shrink()}
        >
          <ChevronDown class="h-5 w-5" />
        </button>
        <div class="flex-1 text-center">
          <div class="text-xs font-semibold uppercase tracking-wide text-[#9aa1ab]">{title}</div>
          <div class="text-sm font-semibold mt-0.5">{roundLabel}</div>
        </div>
        <button type="button" class="h-11 px-3 text-sm text-[#c3c8d0]" onclick={() => circuitRunner.end()}>End</button>
      </div>

      {#if step}
        <div
          class="flex gap-1 px-5 pt-3"
          role="img"
          aria-label={phase.kind === "rest" && !phase.between
            ? `All ${step.memberCount} exercises done this round`
            : `Exercise ${step.memberIndex + 1} of ${step.memberCount} in this round`}
        >
          {#each Array(step.memberCount) as _, i (i)}
            <div
              class="flex-1 h-1 rounded-sm {(phase.kind === 'rest' && !phase.between) || i < step.memberIndex
                ? 'bg-[#6b717b]'
                : i === step.memberIndex
                  ? 'bg-[#cfd3da]'
                  : 'bg-[#2a2e36]'}"
            ></div>
          {/each}
        </div>
      {/if}

      <div class="flex-1 flex flex-col items-center justify-center px-6 text-center min-h-0">
        {#if phase.kind === "lead" && step}
          <div class="text-[15px] font-semibold uppercase tracking-widest text-[#9aa1ab]">
            {paused ? "Paused" : phase.switching ? "Switch sides" : "Get ready"}
          </div>
          <div class="text-[200px] leading-none font-extrabold tabular-nums mt-2 mb-1" aria-live="polite">
            {Math.max(1, Math.ceil(remainingMs / 1000))}
          </div>
          <h2 class="m-0 text-3xl font-bold leading-tight">{step.drillName}</h2>
          <p class="mt-2.5 text-base text-[#9aa1ab]">
            {step.metric === "reps" ? `${step.reps} reps` : `${step.goalSec} s hold`}{step.side ? ` · ${sideLabel(step.side)}` : ""}
          </p>
        {:else if phase.kind === "hold" && step}
          <h2 class="m-0 text-3xl font-bold leading-tight">{step.drillName}</h2>
          {#if step.side}
            <div class="flex gap-1.5 mt-3">
              <span class="px-3 py-1 rounded-full bg-[#cfd3da] text-[#0e1014] text-[13px] font-bold">
                {step.side === "left" ? "Left side" : "Right side"}
              </span>
              {#if nextIsSwitch}
                <span class="px-3 py-1 rounded-full border border-[#3a3f48] text-[#9aa1ab] text-[13px] font-medium">
                  {step.side === "left" ? "Right next" : "Left next"}
                </span>
              {/if}
            </div>
          {/if}
          {@render ring(`${clock(remainingMs)}`, `of ${Math.round(totalMs / 1000)} s`, "#cfd3da",
            `${Math.ceil(remainingMs / 1000)} seconds left of ${Math.round(totalMs / 1000)}`)}
        {:else if phase.kind === "rest"}
          <h2 class="m-0 text-3xl font-bold leading-tight">Rest</h2>
          <p class="mt-2 text-[15px] text-[#9aa1ab]">{phase.between ? "Before the next exercise" : "Between rounds"}</p>
          {@render ring(`${clock(remainingMs)}`, `of ${Math.round(totalMs / 1000)} s`, "#7d8591",
            `${Math.ceil(remainingMs / 1000)} seconds of rest left of ${Math.round(totalMs / 1000)}`)}
        {:else if phase.kind === "reps" && step}
          <h2 class="m-0 text-3xl font-bold leading-tight">{step.drillName}</h2>
          {#if step.side}<p class="mt-1 text-base text-[#9aa1ab] capitalize">{sideLabel(step.side)}</p>{/if}
          <div class="flex items-center gap-4 mt-6">
            <button
              type="button"
              class="h-14 w-14 rounded-full bg-[#1c1f25] flex items-center justify-center"
              aria-label="One fewer rep"
              onclick={() => (repsValue = Math.max(0, repsValue - 1))}
            >
              <Minus class="h-5 w-5" />
            </button>
            <div class="text-[150px] leading-none font-extrabold tabular-nums min-w-[2ch]" aria-label="{repsValue} reps">
              {repsValue}
            </div>
            <button
              type="button"
              class="h-14 w-14 rounded-full bg-[#1c1f25] flex items-center justify-center"
              aria-label="One more rep"
              onclick={() => (repsValue += 1)}
            >
              <Plus class="h-5 w-5" />
            </button>
          </div>
          <div class="text-xl font-semibold text-[#c3c8d0] mt-1">reps</div>
          <p class="mt-5 text-sm text-[#9aa1ab]">{clock(elapsedMs)} so far · no time limit</p>
        {/if}
      </div>

      {#if phase.kind === "reps"}
        <div class="px-4 pb-4 flex gap-2.5">
          <button
            type="button"
            class="h-16 px-5 rounded-2xl bg-[#1c1f25] text-[15px] font-semibold"
            onclick={() => void circuitRunner.skip()}
          >
            Skip
          </button>
          <button
            type="button"
            class="flex-1 h-16 rounded-2xl bg-[#cfd3da] text-[#0e1014] text-lg font-bold flex items-center justify-center gap-2"
            onclick={() => void circuitRunner.finishReps(repsValue)}
          >
            <Check class="h-5 w-5" strokeWidth={2.5} /> Done
          </button>
        </div>
      {:else}
        <div class="flex justify-center items-start gap-8 pb-6">
          {#if phase.kind === "lead"}
            {@render control("Add 10 seconds", "+10 s", () => circuitRunner.extend(), plusTen)}
            {@render pauseButton(false)}
            {@render control("Start now", "Start now", () => void circuitRunner.startNow(), skipIcon)}
          {:else}
            {@render control("Add 10 seconds", "+10 s", () => circuitRunner.extend(), plusTen)}
            {@render pauseButton(true)}
            {#if phase.kind === "rest"}
              {@render control("Skip rest", "Skip rest", () => void circuitRunner.skip(), skipIcon)}
            {:else}
              {@render control("Skip to next", "Skip", () => void circuitRunner.skip(), skipIcon)}
            {/if}
          {/if}
        </div>
      {/if}

      <div class="mx-4 mb-6 px-4 py-3.5 rounded-2xl bg-[#17191e] flex items-center gap-3">
        {#if upcoming[0]}
          <div class="flex-1 min-w-0">
            <div class="text-xs text-[#9aa1ab]">{upNextLabel}</div>
            <div class="text-[15px] font-semibold mt-0.5 truncate">{stepName(upcoming[0])}</div>
            {#if nextIsSwitch && upcoming[1]}
              <div class="text-xs text-[#9aa1ab] mt-0.5 truncate">Then {stepName(upcoming[1])}</div>
            {/if}
          </div>
          <div class="text-sm text-[#c3c8d0]">{goal(upcoming[0])}</div>
        {:else}
          <div class="flex-1 text-[15px] font-semibold">Last one</div>
        {/if}
      </div>
    </div>
  {:else}
    <div
      class="fixed left-3 right-3 z-30 h-[72px] rounded-2xl bg-[#0e1014] text-[#e4e6eb] flex items-center gap-3 pl-3 pr-2 shadow-[0_12px_30px_rgba(2,6,23,0.3)]"
      style="bottom: {bottomOffset}px"
      role="region"
      aria-label="{title} timer"
    >
      <svg viewBox="0 0 48 48" width="48" height="48" class="shrink-0" aria-hidden="true">
        <circle cx="24" cy="24" r={r} fill="none" stroke="#2a2e36" stroke-width="4" />
        {#if phase.kind !== "reps"}
          <circle
            cx="24" cy="24" r={r} fill="none" stroke="#cfd3da" stroke-width="4" stroke-linecap="round"
            stroke-dasharray={c} stroke-dashoffset={c * (1 - progress)} transform="rotate(-90 24 24)"
          />
        {/if}
      </svg>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-semibold truncate">
          {#if phase.kind === "rest"}{phase.between ? "Rest" : "Rest between rounds"}{:else if step}{phase.kind === "lead" ? "Get ready: " : ""}{step.drillName}{step.side ? ` · ${sideLabel(step.side)}` : ""}{/if}
        </div>
        <div class="text-xs text-[#9aa1ab] mt-0.5 truncate">
          {#if paused}Paused{:else if upcoming[0]}Next: {nextIsSwitch && step?.side ? sideLabel(upcoming[0].side) : stepName(upcoming[0])}{:else}Last one{/if}
        </div>
      </div>
      <div class="text-2xl font-extrabold tabular-nums">
        {phase.kind === "reps" ? clock(elapsedMs) : clock(remainingMs)}
      </div>
      {#if phase.kind !== "reps"}
        <button
          type="button"
          class="h-11 w-11 rounded-full flex items-center justify-center"
          aria-label={paused ? "Resume" : "Pause"}
          onclick={() => (paused ? circuitRunner.resume() : circuitRunner.pause())}
        >
          {#if paused}<Play class="h-5 w-5 fill-current" />{:else}<Pause class="h-5 w-5 fill-current" />{/if}
        </button>
      {/if}
      <button
        type="button"
        class="h-11 w-11 rounded-full flex items-center justify-center"
        aria-label="Expand timer"
        onclick={() => circuitRunner.expand()}
      >
        <ChevronUp class="h-5 w-5" />
      </button>
    </div>
  {/if}
{/if}

{#snippet ring(big: string, small: string, stroke: string, label: string)}
  <div class="relative w-[280px] h-[280px] max-w-[70vw] max-h-[70vw] mt-7">
    <svg viewBox="0 0 280 280" class="w-full h-full" role="img" aria-label={label}>
      <circle cx="140" cy="140" r={R} fill="none" stroke="#23272e" stroke-width="12" />
      <circle
        cx="140" cy="140" r={R} fill="none" stroke={stroke} stroke-width="12" stroke-linecap="round"
        stroke-dasharray={C} stroke-dashoffset={C * (1 - progress)} transform="rotate(-90 140 140)"
      />
    </svg>
    <div class="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
      <div class="text-[88px] leading-none font-extrabold tabular-nums tracking-tight">{big}</div>
      <div class="text-sm text-[#9aa1ab] mt-2">{paused ? "Paused" : small}</div>
    </div>
  </div>
{/snippet}

{#snippet pauseButton(big: boolean)}
  <div class="flex flex-col items-center gap-1.5 text-xs text-[#9aa1ab]">
    <button
      type="button"
      class="rounded-full flex items-center justify-center {big
        ? 'h-[72px] w-[72px] bg-[#cfd3da] text-[#0e1014]'
        : 'h-14 w-14 bg-[#1c1f25] text-[#e4e6eb]'}"
      aria-label={paused ? "Resume" : "Pause"}
      onclick={() => (paused ? circuitRunner.resume() : circuitRunner.pause())}
    >
      {#if paused}<Play class="h-6 w-6 fill-current" />{:else}<Pause class="h-6 w-6 fill-current" />{/if}
    </button>
    {paused ? "Resume" : "Pause"}
  </div>
{/snippet}

{#snippet control(aria: string, text: string, onclick: () => void, icon: import("svelte").Snippet)}
  <div class="flex flex-col items-center gap-1.5 text-xs text-[#9aa1ab]">
    <button
      type="button"
      class="h-14 w-14 rounded-full bg-[#1c1f25] text-[#e4e6eb] flex items-center justify-center text-[15px] font-semibold"
      aria-label={aria}
      {onclick}
    >
      {@render icon()}
    </button>
    {text}
  </div>
{/snippet}

{#snippet skipIcon()}<SkipForward class="h-5 w-5" />{/snippet}
{#snippet plusTen()}+10{/snippet}
