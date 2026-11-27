<!-- Coaching › Profile (canvas P3): the Coaching section of the coach's one profile, with a phone
     preview of exactly what people see. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { apiClient, ApiError } from "@logit/core/api/client";
  import { coachApi } from "@logit/core/api/coachApi";
  import { priceText } from "@logit/core/domain/coachPayments";
  import {
    COACH_LIMITS,
    GOOD_FOR_SUGGESTIONS,
    type CoachMode,
    type CoachProfile,
    type CoachingSection,
    type ProfilePackage,
  } from "@logit/core/domain/coachProfile";
  import CoachingSectionView from "@logit/ui/CoachingSection.svelte";
  import RichTextEditor from "$lib/components/rich-text-editor.svelte";
  import * as Alert from "$lib/components/ui/alert";
  import * as RadioGroup from "$lib/components/ui/radio-group";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { Switch } from "$lib/components/ui/switch";
  import { toast } from "$lib/components/ui/sonner";
  import { coachTrial } from "$lib/workspace";
  import { goto } from "$app/navigation";
  import { getWebCheckinRepo } from "$lib/deps";
  import { readyMadeForm, touchCheckinSchedule, type CheckinSchedule } from "@logit/core/domain/Checkin";

  const user = apiClient.getUser();
  const name = user?.displayName || user?.username || "you";

  let loaded = $state(false);
  let loadError = $state<string | null>(null);
  let isPublic = $state(false);
  let packages = $state<ProfilePackage[]>([]);
  let onProfile = $state<Set<string>>(new Set());
  let form = $state<CoachProfile>({ headline: "", mode: "online", place: "", about: "", goodFor: [] });
  let custom = $state("");
  let saving = $state(false);
  // Canvas J4: what new clients agree to before taking a spot.
  let agreement = $state("");
  let savedAgreement = "";
  let agreementChanged = $state<string | null>(null);
  // Canvas J4: the start-up form, and check-ins every new client starts with.
  let sharedForms = $state<CheckinSchedule[]>([]);
  const startupForm = $derived(sharedForms.find((f) => f.kind === "startup") ?? null);
  const checkinForms = $derived(sharedForms.filter((f) => f.kind !== "startup"));

  async function loadForms() {
    sharedForms = (await getWebCheckinRepo().listMySchedules()).filter((r) => !r.recipientUserId && !r.schedule.archived).map((r) => r.schedule);
  }

  async function makeStartup() {
    const f = readyMadeForm("startup");
    await getWebCheckinRepo().saveSchedule(f);
    await goto(`/coaching/checkins/forms/${f.id}`);
  }

  async function setAutoStart(f: CheckinSchedule, on: boolean) {
    const next = touchCheckinSchedule({ ...f, autoStart: on || undefined });
    sharedForms = sharedForms.map((x) => (x.id === f.id ? next : x));
    try {
      await getWebCheckinRepo().saveSchedule(next);
    } catch (e) {
      sharedForms = sharedForms.map((x) => (x.id === f.id ? f : x));
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    }
  }
  let error = $state<string | null>(null);

  onMount(async () => {
    try {
      const mine = await coachApi.getCoachProfile();
      if (mine.profile) form = { ...mine.profile, place: mine.profile.place ?? "" };
      packages = mine.packages;
      onProfile = new Set(mine.packages.filter((p) => p.showOnProfile).map((p) => p.id));
      isPublic = mine.public;
      const a = await coachApi.getAgreement().catch(() => null);
      agreement = savedAgreement = a?.text ?? "";
      agreementChanged = a?.changedAt ?? null;
      await loadForms().catch(() => {});
    } catch (e) {
      loadError = e instanceof ApiError ? e.message : "Couldn't load your profile.";
    } finally {
      loaded = true;
    }
  });

  function toggleTag(tag: string) {
    const has = form.goodFor.some((t) => t.toLowerCase() === tag.toLowerCase());
    if (has) form.goodFor = form.goodFor.filter((t) => t.toLowerCase() !== tag.toLowerCase());
    else if (form.goodFor.length < COACH_LIMITS.goodFor) form.goodFor = [...form.goodFor, tag];
  }

  function addCustom(e: Event) {
    e.preventDefault();
    const tag = custom.trim().slice(0, COACH_LIMITS.tag);
    if (tag) toggleTag(tag);
    custom = "";
  }

  function setOnProfile(id: string, on: boolean) {
    const next = new Set(onProfile);
    if (on) next.add(id);
    else next.delete(id);
    onProfile = next;
  }

  async function save(e: Event) {
    e.preventDefault();
    saving = true;
    error = null;
    try {
      const saved = await coachApi.saveCoachProfile({ ...form, place: form.place?.trim() || null }, [...onProfile]);
      isPublic = saved.public;
      packages = saved.packages;
      if (agreement.trim() !== savedAgreement.trim()) {
        const a = await coachApi.saveAgreement(agreement.trim() || null);
        savedAgreement = a.text ?? "";
        agreementChanged = a.changedAt;
      }
      toast.success("Profile saved");
    } catch (err) {
      error = err instanceof ApiError ? err.message : "Couldn't save it. Try again.";
    } finally {
      saving = false;
    }
  }

  const tags = $derived([
    ...GOOD_FOR_SUGGESTIONS,
    ...form.goodFor.filter((t) => !GOOD_FOR_SUGGESTIONS.some((s) => s.toLowerCase() === t.toLowerCase())),
  ]);
  const preview = $derived<CoachingSection>({
    ...form,
    headline: form.headline.trim() || "Your headline",
    place: form.place?.trim() || null,
    packages: packages.filter((p) => onProfile.has(p.id)),
    askCode: null,
    askPays: false,
  });
</script>

<div class="flex flex-col gap-5">
  <header class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 class="text-[26px] font-bold tracking-tight">Your coaching profile</h1>
      <p class="text-[13px] text-muted-foreground">What people see on your profile and when they open one of your invite links.</p>
    </div>
    {#if user?.username}<Button variant="outline" href="/social/{user.username}">View your profile</Button>{/if}
  </header>

  {#if !loaded}
    <Skeleton class="h-96" />
  {:else if loadError}
    <Alert.Root variant="destructive"><Alert.Description>{loadError}</Alert.Description></Alert.Root>
  {:else}
    {#if !isPublic}
      <Alert.Root>
        <Alert.Description>
          {coachTrial() ? "You're trying Studio: write your Coaching section now and it goes on your profile when you get Studio." : "Your Coaching section goes on your profile when you have Studio."}
        </Alert.Description>
      </Alert.Root>
    {/if}
    <div class="flex flex-wrap items-start gap-6">
      <form class="flex min-w-0 flex-[2_1_480px] flex-col gap-6" onsubmit={save}>
        <section class="flex flex-col gap-1.5">
          <Label for="cp-headline" class="text-sm font-semibold">Headline</Label>
          <span class="text-xs text-muted-foreground">One line under your name: what you coach.</span>
          <Input id="cp-headline" bind:value={form.headline} maxlength={COACH_LIMITS.headline} placeholder="Strength and hypertrophy coaching" />
        </section>

        <section class="flex flex-col gap-2">
          <span class="text-sm font-semibold" id="cp-where">Where you coach</span>
          <RadioGroup.Root bind:value={form.mode} aria-labelledby="cp-where" class="flex flex-wrap gap-2">
            {#each [["online", "Online"], ["inperson", "In person"], ["both", "Both"]] as [v, l] (v)}
              <Label class="flex h-10 cursor-pointer items-center gap-2.5 rounded-lg border px-3 font-normal has-[[data-state=checked]]:border-primary">
                <RadioGroup.Item value={v as CoachMode} />{l}
              </Label>
            {/each}
          </RadioGroup.Root>
          {#if form.mode !== "online"}
            <Input bind:value={form.place} maxlength={COACH_LIMITS.place} placeholder="Town or gym" aria-label="Town or gym" class="max-w-xs" />
          {/if}
        </section>

        <section class="flex flex-col gap-1.5">
          <span class="text-sm font-semibold">About you</span>
          <span class="text-xs text-muted-foreground">Who you coach and how.</span>
          <RichTextEditor bind:value={form.about} label="About you" maxlength={COACH_LIMITS.about}
            placeholder="Ten years lifting, five coaching. Mostly people with a desk job who want to get strong…" />
        </section>

        <section class="flex flex-col gap-2">
          <span class="text-sm font-semibold" id="cp-goodfor">Good fit for</span>
          <span class="text-xs text-muted-foreground">Up to {COACH_LIMITS.goodFor}. {form.goodFor.length} picked.</span>
          <div class="flex flex-wrap gap-1.5" role="group" aria-labelledby="cp-goodfor">
            {#each tags as tag (tag)}
              {@const on = form.goodFor.some((t) => t.toLowerCase() === tag.toLowerCase())}
              <button type="button" aria-pressed={on} onclick={() => toggleTag(tag)}
                disabled={!on && form.goodFor.length >= COACH_LIMITS.goodFor}
                class="h-8 rounded-full border px-3 text-[13px] transition-colors disabled:opacity-40 {on ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-foreground/30'}">{tag}</button>
            {/each}
          </div>
          <div class="flex max-w-sm gap-2">
            <Input bind:value={custom} maxlength={COACH_LIMITS.tag} placeholder="Your own" aria-label="Add your own"
              onkeydown={(e) => { if (e.key === "Enter") addCustom(e); }} />
            <Button type="button" variant="outline" disabled={!custom.trim() || form.goodFor.length >= COACH_LIMITS.goodFor} onclick={addCustom}>Add</Button>
          </div>
        </section>

        <section class="flex flex-col gap-2">
          <span class="text-sm font-semibold">What you offer</span>
          <span class="text-xs text-muted-foreground">Your packages from Payments, with their prices.</span>
          {#if packages.length}
            <ul class="flex flex-col rounded-lg border border-border">
              {#each packages as p (p.id)}
                <li class="flex items-center justify-between gap-3 border-t border-border px-3 py-2.5 first:border-t-0">
                  <span class="min-w-0"><span class="block text-sm font-medium">{p.name}</span><span class="text-xs text-muted-foreground">{priceText(p)}</span></span>
                  <label class="flex items-center gap-2 text-xs text-muted-foreground">
                    On profile
                    <Switch checked={onProfile.has(p.id)} onCheckedChange={(v) => setOnProfile(p.id, v)} aria-label="Show {p.name} on your profile" />
                  </label>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="text-sm text-muted-foreground">No packages yet. Your profile says "Ask {name.split(" ")[0]} about prices", and you agree them yourself.</p>
          {/if}
          <Button variant="outline" size="sm" class="self-start" href="/coaching/payments">Manage packages</Button>
        </section>

        <section class="flex flex-col gap-2 border-t border-border pt-6" aria-labelledby="agreement-title">
          <h2 id="agreement-title" class="text-base font-semibold">When someone becomes your client</h2>
          <Label for="agreement">Coaching agreement <span class="font-normal text-muted-foreground">optional</span></Label>
          <p class="text-xs text-muted-foreground">They tick it before taking a spot. Your words, shown as yours: LogIt doesn't check them, so make sure they match your refund rules in Payments.</p>
          <RichTextEditor bind:value={agreement} label="Coaching agreement" maxlength={8000}
            placeholder={"1. Check in every Sunday.\n2. Tell me about any pain or injury before training through it.\n3. Cancel any time; you keep coaching until the end of the month you paid for."} />
          <p class="text-xs text-muted-foreground">
            {agreementChanged ? `Last changed ${new Date(agreementChanged).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}. ` : ""}If you change it, current clients see the new words but aren't asked to agree again.
          </p>

          <div class="mt-3 flex flex-wrap items-center gap-3 rounded-[10px] border border-border px-4 py-3">
            <span class="flex min-w-0 flex-[1_1_260px] flex-col gap-0.5">
              <span class="text-sm font-medium">Start-up form</span>
              <span class="text-xs text-muted-foreground">{startupForm ? `${startupForm.questions.length} questions · they fill it in once, after taking a spot. You see it on their Check-ins tab.` : "None yet: health questions, body weight, measurements, progress photos, foods they don't eat."}</span>
            </span>
            {#if startupForm}<Button variant="outline" size="sm" href="/coaching/checkins/forms/{startupForm.id}">Edit form</Button>
            {:else}<Button size="sm" onclick={() => void makeStartup()}>Make one</Button>{/if}
          </div>

          <div class="flex flex-col gap-1.5 rounded-[10px] border border-border px-4 py-3">
            <span class="text-sm font-medium">Start them with</span>
            {#each checkinForms as f (f.id)}
              <label class="flex items-center justify-between gap-3 text-[13px]">
                <span>{f.name} <span class="text-muted-foreground">· {f.cadence === "monthly" ? "monthly" : f.cadence === "manual" ? "once" : "weekly"}</span></span>
                <Switch checked={!!f.autoStart} onCheckedChange={(v) => void setAutoStart(f, v)} aria-label="New clients get {f.name}" />
              </label>
            {:else}
              <span class="text-xs text-muted-foreground">Make a check-in form in Check-ins › Forms, then switch it on here.</span>
            {/each}
            <span class="text-xs text-muted-foreground">The program and meal plan stay a choice per client: give them their own after the start-up form.</span>
          </div>
        </section>

        {#if error}<Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>{/if}
        <div><Button type="submit" disabled={saving || !form.headline.trim() || form.about.length > COACH_LIMITS.about}>{saving ? "Saving…" : "Save"}</Button></div>
      </form>

      <aside class="sticky top-6 flex w-full max-w-[360px] flex-[1_1_300px] flex-col gap-2" aria-label="Preview">
        <span class="text-xs font-medium text-muted-foreground">Preview</span>
        <div class="rounded-[28px] border-[8px] border-muted bg-background p-4">
          <CoachingSectionView section={preview} {name} onask={() => {}} />
        </div>
        <span class="text-xs text-muted-foreground">"Ask to be coached" opens your questions. Change them, and your client limit, in Requests.</span>
      </aside>
    </div>
  {/if}
</div>
