<!-- Finding your working weight (canvas HT2): the explainer, worded like the "how many more could
     you have done?" question everywhere else. -->
<script lang="ts">
  const { coachName = null }: { coachName?: string | null } = $props();
  const STEPS = [
    "Start light, lighter than you think.",
    "Do the reps. Ask: how many more could I have done?",
    "4 or more? Go up a step and try again.",
    "2 more? That's your weight. Log it; LogIt plans from there.",
  ];
  const LADDER = [
    { kg: "6 kg", reps: "8 reps", left: "Easy: 4+ more", hit: false },
    { kg: "10 kg", reps: "8 reps", left: "3 more", hit: false },
    { kg: "12 kg", reps: "8 reps", left: "2 more ✓", hit: true },
  ];
</script>

<div class="flex flex-col gap-3.5 text-[15px]">
  <p>Your working weight is one you can lift for the reps on your plan with about <b class="font-semibold">2 more left in you</b>. Not easy, not all-out.</p>
  <ol class="flex flex-col gap-2">
    {#each STEPS as s, i (i)}
      <li class="flex gap-3 leading-snug"><span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[13px] font-semibold">{i + 1}</span><span>{s}</span></li>
    {/each}
  </ol>
  <div class="flex flex-col gap-1 rounded-xl bg-muted/50 px-3.5 py-2.5 text-sm">
    <span class="text-xs text-muted-foreground">Example: goblet squat, 8 reps</span>
    {#each LADDER as r (r.kg)}
      <span class="grid grid-cols-3 tabular-nums {r.hit ? 'font-semibold text-success' : 'text-muted-foreground'}"><span>{r.kg}</span><span>{r.reps}</span><span>{r.left}</span></span>
    {/each}
  </div>
  <p class="text-sm text-muted-foreground">The extra sets you do to find it count as warm-ups. If a set ever hurts (not just hard work), stop{coachName ? ` and tell ${coachName}` : ""}.</p>
</div>
