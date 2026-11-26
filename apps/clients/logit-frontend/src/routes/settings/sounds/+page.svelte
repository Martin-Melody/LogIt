<script lang="ts">
  import { Slider } from "$lib/components/ui/slider/index.js";
  import Switch from "$lib/components/ui/switch/Switch.svelte";
  import { back } from "$lib/navigation";
  // Settings › Sounds (design canvas S2): Timers and Celebrations on, Taps off by default;
  // each group has a play button to hear it. Vibration comes with every sound, and on its own
  // when sounds are off.
  import { ArrowLeft, Play } from "lucide-svelte";
  import { getSoundSettings, playSound, setSoundSettings, type SoundId, type SoundSettings } from "$lib/features/sound/sounds";

  let s = $state<SoundSettings>(getSoundSettings());

  function update(patch: Partial<SoundSettings>) {
    s = { ...s, ...patch };
    setSoundSettings(s);
  }

  const GROUPS: { key: "timers" | "celebrations" | "taps"; title: string; detail: string; sample: SoundId }[] = [
    { key: "timers", title: "Timers", detail: "Rest over, countdowns, timed sets", sample: "rest" },
    { key: "celebrations", title: "Celebrations", detail: "PRs, workout finished, week complete", sample: "finish" },
    { key: "taps", title: "Taps", detail: "Logging a set. Off: vibration only", sample: "tap" },
  ];
</script>

<div class="flex flex-col min-h-screen bg-background text-foreground px-5 pt-10 pb-6 max-w-md mx-auto w-full gap-4">
  <button type="button" class="flex items-center gap-1 self-start min-h-11 text-sm text-muted-foreground" onclick={() => back("/settings")}>
    <ArrowLeft class="h-4 w-4" /> Settings
  </button>
  <div>
    <h1 class="text-[22px] font-bold mb-1">Sounds</h1>
    <p class="text-sm text-muted-foreground">Follow your workout without looking at your phone.</p>
  </div>

  <ul class="flex flex-col rounded-xl border border-border">
    {#each GROUPS as g, i (g.key)}
      <li class="flex items-center gap-3 px-3.5 py-3 {i < GROUPS.length - 1 ? 'border-b border-border' : ''}">
        <span class="flex flex-1 flex-col">
          <span class="text-[15px] font-medium">{g.title}</span>
          <span class="text-[13px] text-muted-foreground">{g.detail}</span>
        </span>
        <button type="button" class="flex h-10 w-10 items-center justify-center rounded-full border border-border" aria-label="Play {g.title.toLowerCase()} sound"
          onclick={() => playSound(g.sample, { preview: true })}>
          <Play class="h-3.5 w-3.5 fill-current" />
        </button>
        <Switch checked={s[g.key]} label="{g.title} sounds" onchange={(on) => update({ [g.key]: on })} />
      </li>
    {/each}
  </ul>

  <div class="flex flex-col gap-2.5 rounded-xl border border-border p-3.5">
    <span id="sound-volume" class="text-[15px] font-medium">Volume over your music</span>
    <Slider type="single" value={s.volume} min={0} max={100} aria-labelledby="sound-volume" class="py-3"
      onValueCommit={(v) => { update({ volume: v }); playSound("rest", { preview: true }); }} />
    <span class="text-[13px] text-muted-foreground">Sounds play over whatever's playing.</span>
  </div>

  <div class="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border p-3.5">
    <span class="flex flex-col">
      <span class="text-[15px] font-medium">Vibration</span>
      <span class="text-[13px] text-muted-foreground">With every sound, and on its own when sounds are off</span>
    </span>
    <Switch checked={s.vibration} label="Vibration" onchange={(on) => update({ vibration: on })} />
  </div>
</div>
