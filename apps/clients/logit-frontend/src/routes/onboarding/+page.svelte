<script lang="ts">
  import { goto } from "$app/navigation";
  import { Dumbbell, ChevronRight, Bell, BellOff, ArrowLeft, Server, Cloud, WifiOff } from "lucide-svelte";
  import ProfileAvatar from "$lib/components/ProfileAvatar.svelte";

  import { profile } from "$lib/stores/profile.store";
  import { onboarding } from "$lib/stores/onboarding.store";
  import { resetTours } from "$lib/tour/index";
  import { splits } from "$lib/stores/splits.store";
  import { saveSplit } from "$lib/usecases/Splits/saveSplit";
  import { createSplit, addDay, addPlannedStrength } from "$lib/domain/WorkoutSplit";
  import { authStore } from "$lib/api/authStore.svelte";
  import { setServerMode } from "$lib/api/serverConfig";
  import { ApiError } from "$lib/api/client";

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

  // Profile step
  const draft = $state({
    name: $profile.name,
    bio: $profile.bio,
    height: $profile.height !== null ? String($profile.height) : "",
    heightUnit: $profile.heightUnit,
    weight: $profile.weight !== null ? String($profile.weight) : "",
    weightUnit: $profile.weightUnit,
  });

  // Split step
  let selectedPreset = $state<string | null>(null);
  let saving = $state(false);

  // Step 4: server / account
  type ServerSubStep = "pick" | "url" | "form";
  type AuthMode = "login" | "register";

  let serverSubStep = $state<ServerSubStep>("pick");
  let chosenMode = $state<"cloud" | "selfhosted" | null>(null);
  let selfHostUrl = $state("https://");
  let authMode = $state<AuthMode>("login");
  let authError = $state<string | null>(null);
  let authLoading = $state(false);
  const authForm = $state({ username: "", email: "", password: "", displayName: "" });

  function resetServerStep() {
    serverSubStep = "pick";
    chosenMode = null;
    selfHostUrl = "https://";
    authMode = "login";
    authError = null;
    authLoading = false;
    authForm.username = "";
    authForm.email = "";
    authForm.password = "";
    authForm.displayName = "";
  }

  // Helpers

  function numOrNull(v: string | number): number | null {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function saveProfile() {
    profile.save({
      name: draft.name.trim(),
      bio: draft.bio.trim(),
      height: numOrNull(draft.height),
      heightUnit: draft.heightUnit,
      weight: numOrNull(draft.weight),
      weightUnit: draft.weightUnit,
    });
  }

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

  async function onProfileContinue() {
    saveProfile();
    onboarding.setStep(2);
  }

  async function onSplitContinue() {
    if (!selectedPreset) return;
    saving = true;
    try {
      await applySplit();
      onboarding.setStep(3);
    } finally {
      saving = false;
    }
  }

  async function onEnableNotifications() {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await LocalNotifications.requestPermissions();
    } catch {}
    resetServerStep();
    onboarding.setStep(4);
  }

  function pickCloud() {
    chosenMode = "cloud";
    setServerMode("cloud");
    serverSubStep = "form";
  }

  function pickSelfHost() {
    chosenMode = "selfhosted";
    serverSubStep = "url";
  }

  function confirmSelfHostUrl() {
    const url = selfHostUrl.trim().replace(/\/$/, "");
    if (!url || url === "https:/") return;
    setServerMode("selfhosted", url);
    serverSubStep = "form";
  }

  async function submitAuth() {
    authError = null;
    authLoading = true;
    try {
      if (authMode === "login") {
        await authStore.login(authForm.username.trim(), authForm.password);
      } else {
        await authStore.register(
          authForm.username.trim(),
          authForm.email.trim(),
          authForm.password,
          authForm.displayName.trim() || authForm.username.trim(),
        );
      }
      await finishOnboarding();
    } catch (e) {
      authError = e instanceof ApiError ? e.message : "Something went wrong. Please try again.";
    } finally {
      authLoading = false;
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
        <p class="flex items-center gap-2"><span class="text-foreground">✓</span> No account required</p>
        <p class="flex items-center gap-2"><span class="text-foreground">✓</span> Everything stays on your device</p>
        <p class="flex items-center gap-2"><span class="text-foreground">✓</span> Free and open source</p>
      </div>

      <button
        type="button"
        class="flex items-center justify-center gap-2 w-full max-w-xs py-3 rounded bg-primary text-primary-foreground text-sm font-medium"
        onclick={() => onboarding.setStep(1)}
      >
        Get started <ChevronRight class="h-4 w-4" />
      </button>
    </div>

  <!-- Step 1: Profile -->
  {:else if step === 1}
    <div class="flex flex-col flex-1 px-6 pt-10 pb-8 max-w-sm mx-auto w-full">
      <button type="button" class="flex items-center gap-1 text-sm text-muted-foreground mb-6 self-start" onclick={() => onboarding.setStep(0)}>
        <ArrowLeft class="h-4 w-4" /> Back
      </button>
      <div class="mb-6">
        <h2 class="text-xl font-bold">Set up your profile</h2>
        <p class="text-sm text-muted-foreground mt-1">Stored on your device only. You can change this any time.</p>
      </div>

      <div class="flex flex-col gap-5 flex-1">
        <div class="flex justify-center">
          <ProfileAvatar name={draft.name} avatarDataUrl={$profile.avatarDataUrl} editable class="h-20 w-20" />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="name">Name</label>
          <input id="name" type="text" autocomplete="name" placeholder="Your name"
            class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            bind:value={draft.name} />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="bio">Bio <span class="text-muted-foreground font-normal">(optional)</span></label>
          <textarea id="bio" rows={2} placeholder="Something about yourself…"
            class="w-full rounded border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            bind:value={draft.bio}></textarea>
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="height">Height <span class="text-muted-foreground font-normal">(optional)</span></label>
          <div class="grid grid-cols-[1fr_auto] gap-2">
            <input id="height" type="number" min="0" inputmode="decimal"
              placeholder={draft.heightUnit === "cm" ? "e.g. 178" : "e.g. 70"}
              class="min-w-0 rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              bind:value={draft.height} />
            <div class="flex shrink-0 rounded border overflow-hidden text-xs">
              <button type="button" class="w-12 py-2 text-center transition-colors {draft.heightUnit === 'cm' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}" onclick={() => (draft.heightUnit = "cm")}>cm</button>
              <button type="button" class="w-12 py-2 text-center transition-colors {draft.heightUnit === 'in' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}" onclick={() => (draft.heightUnit = "in")}>in</button>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="weight">Body weight <span class="text-muted-foreground font-normal">(optional)</span></label>
          <div class="grid grid-cols-[1fr_auto] gap-2">
            <input id="weight" type="number" min="0" inputmode="decimal"
              placeholder={draft.weightUnit === "kg" ? "e.g. 80" : "e.g. 176"}
              class="min-w-0 rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              bind:value={draft.weight} />
            <div class="flex shrink-0 rounded border overflow-hidden text-xs">
              <button type="button" class="w-12 py-2 text-center transition-colors {draft.weightUnit === 'kg' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}" onclick={() => (draft.weightUnit = "kg")}>kg</button>
              <button type="button" class="w-12 py-2 text-center transition-colors {draft.weightUnit === 'lbs' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}" onclick={() => (draft.weightUnit = "lbs")}>lbs</button>
            </div>
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-3 mt-8">
        <button type="button" class="w-full py-3 rounded bg-primary text-primary-foreground text-sm font-medium"
          onclick={() => void onProfileContinue()}>
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
        <p class="text-sm text-muted-foreground mt-1">You can change this any time.</p>
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
          onclick={() => onboarding.setStep(3)}>
          Skip for now
        </button>
      </div>
    </div>

  <!-- Step 3: Notifications -->
  {:else if step === 3}
    <div class="flex flex-col flex-1 px-8 pt-10 pb-8 max-w-sm mx-auto w-full">
      <button type="button" class="flex items-center gap-1 text-sm text-muted-foreground mb-6 self-start" onclick={() => onboarding.setStep(2)}>
        <ArrowLeft class="h-4 w-4" /> Back
      </button>
      <div class="flex flex-col flex-1 items-center justify-center gap-8 text-center">
        <div class="flex flex-col items-center gap-4">
          <div class="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
            <Bell class="h-8 w-8 text-foreground" />
          </div>
          <div>
            <h2 class="text-xl font-bold">Stay on track</h2>
            <p class="mt-2 text-sm text-muted-foreground">
              Get a notification when your rest period ends so you never lose count between sets.
            </p>
          </div>
        </div>

        <div class="flex flex-col gap-3 w-full">
          <button type="button"
            class="w-full py-3 rounded bg-primary text-primary-foreground text-sm font-medium"
            onclick={() => void onEnableNotifications()}>
            Enable notifications
          </button>
          <button type="button"
            class="w-full py-2 text-sm text-muted-foreground flex items-center justify-center gap-1.5"
            onclick={() => { resetServerStep(); onboarding.setStep(4); }}>
            <BellOff class="h-3.5 w-3.5" /> Skip for now
          </button>
        </div>
      </div>
    </div>

  <!-- Step 4: Server / Account -->
  {:else if step === 4}
    <div class="flex flex-col flex-1 px-6 pt-10 pb-8 max-w-sm mx-auto w-full">

      <!-- Sub-step: pick server mode -->
      {#if serverSubStep === "pick"}
        <button type="button" class="flex items-center gap-1 text-sm text-muted-foreground mb-6 self-start" onclick={() => onboarding.setStep(3)}>
          <ArrowLeft class="h-4 w-4" /> Back
        </button>
        <div class="mb-6">
          <h2 class="text-xl font-bold">Connect an account</h2>
          <p class="text-sm text-muted-foreground mt-1">
            Optional — the app works fully offline. You can connect later in Settings.
          </p>
        </div>

        <div class="flex flex-col gap-3 flex-1">
          <button type="button"
            class="w-full text-left px-4 py-4 rounded border border-border hover:border-muted-foreground/50 transition-colors"
            onclick={() => { setServerMode("offline"); void finishOnboarding(); }}>
            <div class="flex items-center gap-3">
              <div class="h-9 w-9 rounded bg-muted flex items-center justify-center shrink-0">
                <WifiOff class="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p class="text-sm font-medium">Stay offline</p>
                <p class="text-xs text-muted-foreground mt-0.5">Everything stays on your device. No account needed.</p>
              </div>
            </div>
          </button>

          <button type="button"
            class="w-full text-left px-4 py-4 rounded border border-border hover:border-muted-foreground/50 transition-colors"
            onclick={pickCloud}>
            <div class="flex items-center gap-3">
              <div class="h-9 w-9 rounded bg-primary/10 flex items-center justify-center shrink-0">
                <Cloud class="h-4 w-4 text-primary" />
              </div>
              <div>
                <p class="text-sm font-medium">Logit cloud</p>
                <p class="text-xs text-muted-foreground mt-0.5">Social features, cloud backup, and the plugin community.</p>
              </div>
            </div>
          </button>

          <button type="button"
            class="w-full text-left px-4 py-4 rounded border border-border hover:border-muted-foreground/50 transition-colors"
            onclick={pickSelfHost}>
            <div class="flex items-center gap-3">
              <div class="h-9 w-9 rounded bg-muted flex items-center justify-center shrink-0">
                <Server class="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p class="text-sm font-medium">Self-hosted</p>
                <p class="text-xs text-muted-foreground mt-0.5">Connect to your own Logit instance. Full control over your data.</p>
              </div>
            </div>
          </button>
        </div>

      <!-- Sub-step: enter self-host URL -->
      {:else if serverSubStep === "url"}
        <button type="button" class="flex items-center gap-1 text-sm text-muted-foreground mb-6 self-start" onclick={() => (serverSubStep = "pick")}>
          <ArrowLeft class="h-4 w-4" /> Back
        </button>
        <div class="mb-6">
          <h2 class="text-xl font-bold">Your server URL</h2>
          <p class="text-sm text-muted-foreground mt-1">Enter the base URL of your self-hosted Logit instance.</p>
        </div>

        <div class="flex flex-col gap-1.5 flex-1">
          <label class="text-sm font-medium" for="server-url">Server URL</label>
          <input id="server-url" type="url" inputmode="url" placeholder="https://logit.yourdomain.com"
            class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            bind:value={selfHostUrl} />
          <p class="text-xs text-muted-foreground mt-1">You can change this later in Settings.</p>
        </div>

        <button type="button"
          class="w-full py-3 mt-8 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          disabled={!selfHostUrl.trim() || selfHostUrl === "https://"}
          onclick={confirmSelfHostUrl}>
          Continue
        </button>

      <!-- Sub-step: login / register form -->
      {:else if serverSubStep === "form"}
        <button type="button" class="flex items-center gap-1 text-sm text-muted-foreground mb-6 self-start"
          onclick={() => (serverSubStep = chosenMode === "selfhosted" ? "url" : "pick")}>
          <ArrowLeft class="h-4 w-4" /> Back
        </button>
        <div class="mb-5">
          <h2 class="text-xl font-bold">{authMode === "login" ? "Log in" : "Create account"}</h2>
          <p class="text-sm text-muted-foreground mt-1">
            {chosenMode === "selfhosted" ? selfHostUrl.replace(/^https?:\/\//, "") : "Logit cloud"}
          </p>
        </div>

        <!-- Login / Register toggle -->
        <div class="flex rounded border overflow-hidden text-sm mb-5">
          <button type="button"
            class="flex-1 py-2 text-center transition-colors {authMode === 'login' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}"
            onclick={() => { authMode = "login"; authError = null; }}>
            Log in
          </button>
          <button type="button"
            class="flex-1 py-2 text-center transition-colors {authMode === 'register' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}"
            onclick={() => { authMode = "register"; authError = null; }}>
            Sign up
          </button>
        </div>

        <div class="flex flex-col gap-3 flex-1">
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium" for="auth-username">
              {authMode === "login" ? "Username or email" : "Username"}
            </label>
            <input id="auth-username" type="text" autocomplete={authMode === "login" ? "username" : "username"}
              placeholder={authMode === "login" ? "username or email" : "username"}
              class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              bind:value={authForm.username} />
          </div>

          {#if authMode === "register"}
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium" for="auth-email">Email</label>
              <input id="auth-email" type="email" autocomplete="email" placeholder="you@example.com"
                class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                bind:value={authForm.email} />
            </div>

            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium" for="auth-display-name">
                Display name <span class="text-muted-foreground font-normal">(optional)</span>
              </label>
              <input id="auth-display-name" type="text" autocomplete="name" placeholder="Your name"
                class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                bind:value={authForm.displayName} />
            </div>
          {/if}

          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium" for="auth-password">Password</label>
            <input id="auth-password" type="password" autocomplete={authMode === "login" ? "current-password" : "new-password"}
              placeholder="••••••••"
              class="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              bind:value={authForm.password} />
          </div>

          {#if authError}
            <p class="text-xs text-destructive">{authError}</p>
          {/if}
        </div>

        <div class="flex flex-col gap-3 mt-8">
          <button type="button"
            class="w-full py-3 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            disabled={authLoading || !authForm.username.trim() || !authForm.password}
            onclick={() => void submitAuth()}>
            {authLoading ? (authMode === "login" ? "Logging in…" : "Creating account…") : (authMode === "login" ? "Log in" : "Create account")}
          </button>
          <button type="button" class="w-full py-2 text-sm text-muted-foreground"
            onclick={() => void finishOnboarding()}>
            Skip for now
          </button>
        </div>
      {/if}

    </div>
  {/if}

  <!-- Step indicator (steps 1–4) -->
  {#if step > 0}
    <div class="flex justify-center gap-1.5 pb-10">
      {#each [1, 2, 3, 4] as s (s)}
        <div class="h-1 w-6 rounded-full {step === s ? 'bg-primary' : step > s ? 'bg-primary/40' : 'bg-muted'}"></div>
      {/each}
    </div>
  {/if}
</div>
