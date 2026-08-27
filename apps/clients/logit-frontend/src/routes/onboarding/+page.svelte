<script lang="ts">
  import { goto } from "$app/navigation";
  import { Dumbbell, ChevronRight, ArrowLeft } from "lucide-svelte";

  import { profile } from "$lib/stores/profile.store";
  import { onboarding } from "$lib/stores/onboarding.store";
  import { resetTours } from "$lib/tour/index";
  import { splits } from "$lib/stores/splits.store";
  import { saveSplit } from "$lib/usecases/Splits/saveSplit";
  import { createSplit, addDay, addPlannedStrength } from "@logit/core/domain/WorkoutSplit";

  type PresetDay = { name: string; exercises: string[] };
  type Preset = { id: string; name: string; description: string; days: PresetDay[] };

  const PRESETS: Preset[] = [
    {
      id: "ppl",
      name: "Push / Pull / Legs",
      description: "3 days · push, pull, and leg movements",
      days: [
        { name: "Push", exercises: ["Bench Press", "Overhead Press", "Lateral Raise", "Tricep Pushdown"] },
        { name: "Pull", exercises: ["Pull-Up", "Barbell Row", "Bicep Curl", "Rear Delt Fly"] },
        { name: "Legs", exercises: ["Squat", "Romanian Deadlift", "Leg Press", "Leg Curl", "Calf Raise"] },
      ],
    },
    {
      id: "upper_lower",
      name: "Upper / Lower",
      description: "2 days · alternate upper and lower body",
      days: [
        { name: "Upper", exercises: ["Bench Press", "Barbell Row", "Overhead Press", "Bicep Curl", "Tricep Pushdown"] },
        { name: "Lower", exercises: ["Squat", "Romanian Deadlift", "Leg Press", "Leg Curl", "Calf Raise"] },
      ],
    },
    {
      id: "full_body",
      name: "Full Body",
      description: "1 day · all major muscle groups each session",
      days: [
        { name: "Full Body", exercises: ["Squat", "Bench Press", "Barbell Row", "Overhead Press", "Deadlift"] },
      ],
    },
    { id: "blank", name: "Start blank", description: "Create your own split from scratch", days: [] },
  ];

  const step = $derived($onboarding.step);

  let name = $state($profile.name);
  let selectedPreset = $state<string | null>(null);
  let saving = $state(false);

  async function applySplit() {
    if (!selectedPreset) return;
    const preset = PRESETS.find((p) => p.id === selectedPreset);
    if (!preset) return;
    let split = createSplit(preset.id === "blank" ? "My Split" : preset.name);
    for (const day of preset.days) {
      split = addDay(split, day.name);
      const dayId = split.days[split.days.length - 1].id;
      for (const exerciseName of day.exercises) {
        split = addPlannedStrength(split, dayId, { exerciseName });
      }
    }
    await saveSplit(split);
    await splits.setActive(split.id);
  }

  async function finishOnboarding() {
    resetTours();
    onboarding.complete();
    await goto("/");
  }

  function onNameContinue() {
    const trimmed = name.trim();
    if (trimmed) profile.save({ name: trimmed });
    onboarding.setStep(2);
  }

  async function onSplitContinue() {
    if (!selectedPreset) return;
    saving = true;
    try {
      await applySplit();
      await finishOnboarding();
    } finally {
      saving = false;
    }
  }
</script>

<div class="flex flex-col min-h-screen bg-background text-foreground">

  <!-- Step 0: Welcome -->
  {#if step === 0}
    <div class="flex flex-col flex-1 items-center justify-center gap-8 px-8 text-center">
      <div class="flex flex-col items-center gap-4">
        <div class="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center">
          <Dumbbell class="h-8 w-8 text-primary-foreground" />
        </div>
        <div>
          <h1 class="text-3xl font-bold tracking-tight">Logit</h1>
          <p class="mt-2 text-muted-foreground">Track your training. Own your data.</p>
        </div>
      </div>

      <div class="flex flex-col gap-2 w-full max-w-xs text-left text-sm text-muted-foreground">
        <p class="flex items-center gap-2"><span class="text-foreground">✓</span> Track every set, rep, and PR</p>
        <p class="flex items-center gap-2"><span class="text-foreground">✓</span> Works fully offline — no account needed</p>
        <p class="flex items-center gap-2"><span class="text-foreground">✓</span> Open source — your data stays yours</p>
      </div>

      <div class="flex flex-col items-center gap-3 w-full max-w-xs">
        <button
          type="button"
          class="flex items-center justify-center gap-2 w-full py-3 rounded bg-primary text-primary-foreground text-sm font-medium"
          onclick={() => onboarding.setStep(1)}
        >
          Get started <ChevronRight class="h-4 w-4" />
        </button>
        <a href="/auth?mode=login" class="text-sm text-muted-foreground hover:text-foreground transition-colors">
          Already have an account? <span class="text-foreground font-medium">Log in</span>
        </a>
      </div>
    </div>

  <!-- Step 1: Name -->
  {:else if step === 1}
    <div class="flex flex-col flex-1 px-6 pt-10 pb-8 max-w-sm mx-auto w-full">
      <button type="button" class="flex items-center gap-1 text-sm text-muted-foreground mb-6 self-start" onclick={() => onboarding.setStep(0)}>
        <ArrowLeft class="h-4 w-4" /> Back
      </button>
      <div class="mb-6">
        <h2 class="text-xl font-bold">What should we call you?</h2>
        <p class="text-sm text-muted-foreground mt-1">Stored on your device. You can change it any time.</p>
      </div>

      <div class="flex flex-col gap-1.5 flex-1">
        <label class="text-sm font-medium" for="name">Name</label>
        <input id="name" type="text" autocomplete="name" placeholder="Your name"
          class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          bind:value={name}
          onkeydown={(e) => { if (e.key === "Enter") onNameContinue(); }} />
      </div>

      <div class="flex flex-col gap-3 mt-8">
        <button type="button" class="w-full py-3 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          disabled={!name.trim()}
          onclick={onNameContinue}>
          Continue
        </button>
        <button type="button" class="w-full py-2 text-sm text-muted-foreground"
          onclick={() => onboarding.setStep(2)}>
          Skip for now
        </button>
      </div>
    </div>

  <!-- Step 2: Split selection -->
  {:else if step === 2}
    <div class="flex flex-col flex-1 px-6 pt-10 pb-8 max-w-sm mx-auto w-full">
      <button type="button" class="flex items-center gap-1 text-sm text-muted-foreground mb-6 self-start" onclick={() => onboarding.setStep(1)}>
        <ArrowLeft class="h-4 w-4" /> Back
      </button>
      <div class="mb-6">
        <h2 class="text-xl font-bold">Choose a training split</h2>
        <p class="text-sm text-muted-foreground mt-1">A starting point — you can change it any time.</p>
      </div>

      <ul class="flex flex-col gap-2 flex-1">
        {#each PRESETS as preset (preset.id)}
          <li>
            <button type="button"
              class="w-full text-left px-4 py-3 rounded border transition-colors {selectedPreset === preset.id ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/50'}"
              onclick={() => (selectedPreset = preset.id)}>
              <p class="text-sm font-medium">{preset.name}</p>
              <p class="text-xs text-muted-foreground mt-0.5">{preset.description}</p>
            </button>
          </li>
        {/each}
      </ul>

      <div class="flex flex-col gap-3 mt-8">
        <button type="button"
          class="w-full py-3 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          disabled={!selectedPreset || saving}
          onclick={() => void onSplitContinue()}>
          {saving ? "Setting up…" : "Continue"}
        </button>
        <button type="button" class="w-full py-2 text-sm text-muted-foreground"
          onclick={() => void finishOnboarding()}>
          Skip for now
        </button>
      </div>
    </div>

  {/if}

  <!-- Step indicator (steps 1–2) -->
  {#if step > 0}
    <div class="flex justify-center gap-1.5 pb-10">
      {#each [1, 2] as s (s)}
        <div class="h-1 w-6 rounded-full {step === s ? 'bg-primary' : step > s ? 'bg-primary/40' : 'bg-muted'}"></div>
      {/each}
    </div>
  {/if}
</div>
