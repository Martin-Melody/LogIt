<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { chip } from "$lib/components/ui/choice";

  // A rest length, picked with −15 / +15 or a quick choice (design canvas S-set-options' stepper).
  const {
    open,
    onOpenChange,
    title,
    subtitle = null,
    valueMs,
    onSave,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    title: string;
    subtitle?: string | null;
    valueMs: number;
    onSave: (ms: number) => void;
  } = $props();

  let ms = $state(0);
  $effect(() => {
    if (open) ms = valueMs;
  });

  const QUICK = [60_000, 90_000, 120_000, 180_000];
  const label = (v: number) => `${Math.floor(v / 60_000)}:${String(Math.round((v % 60_000) / 1000)).padStart(2, "0")}`;
  const step = "h-12 w-14 rounded-xl border border-input text-sm font-medium tabular-nums transition-colors hover:bg-muted disabled:opacity-40";
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content sheet class="gap-4 bg-card">
    <div class="flex flex-col gap-0.5 pr-8">
      <Dialog.Title class="text-[19px] font-semibold">{title}</Dialog.Title>
      {#if subtitle}<Dialog.Description class="text-[13px]">{subtitle}</Dialog.Description>{/if}
    </div>
    <div class="flex items-center gap-3">
      <button type="button" class={step} aria-label="15 seconds less" disabled={ms <= 0} onclick={() => (ms = Math.max(0, ms - 15_000))}>−15</button>
      <b class="flex-1 text-center text-2xl font-semibold tabular-nums" aria-live="polite">{label(ms)}</b>
      <button type="button" class={step} aria-label="15 seconds more" onclick={() => (ms += 15_000)}>+15</button>
    </div>
    <div class="flex flex-wrap gap-2">
      {#each QUICK as q (q)}
        <button type="button" class={chip(ms === q)} aria-pressed={ms === q} onclick={() => (ms = q)}>{label(q)}</button>
      {/each}
    </div>
    <button type="button" class="h-12 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground" onclick={() => { onSave(ms); onOpenChange(false); }}>
      Save
    </button>
  </Dialog.Content>
</Dialog.Root>
