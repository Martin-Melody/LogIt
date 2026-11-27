<!-- Joining a group (design canvas G5, G13): from its link or QR (?c=), or from search or a
     member's invite (?id=). What members see, "Show me on the board", then Join, or Ask to join
     for a findable group that wants approval, with its questions if it asks any (R6). Signed out, it asks for an account first and comes
     back here. -->
<script lang="ts">
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { MessagesSquare, X } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { ApiError, apiBaseUrl } from "@logit/core/api/client";
  import { groupsApi, parseGroupInvite, type GroupPreview } from "@logit/core/api/groupsApi";
  import { authStore } from "$lib/api/authStore.svelte";
  import Switch from "$lib/components/ui/switch/Switch.svelte";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import { chip } from "$lib/components/ui/choice";
  import GroupAvatar from "$lib/components/social/GroupAvatar.svelte";
  import PersonAvatar from "$lib/components/social/PersonAvatar.svelte";
  import { holdRoute } from "$lib/features/friends/invite.svelte";
  import { back } from "$lib/navigation";

  const raw = $derived(page.url.searchParams.get("c") ?? "");
  const groupId = $derived(page.url.searchParams.get("id"));
  // Asked from an event (canvas R6): going to it once let in.
  const eventId = $derived(page.url.searchParams.get("event") ?? undefined);
  const invite = $derived(parseGroupInvite(raw));
  const sameServer = $derived(!!invite && invite.server === apiBaseUrl().replace(/\/+$/, ""));
  let preview = $state<GroupPreview | null>(null);
  let error = $state<string | null>(null);
  let onBoard = $state(true);
  let joining = $state(false);
  // Canvas R6: the organisers' questions, answered when asking.
  let answers = $state<Record<string, string>>({});

  onMount(async () => {
    if (groupId) {
      if (!authStore.isAuthenticated) return;
      try {
        preview = await groupsApi.about(groupId);
        if (preview.member) await goto(`/groups/${preview.id}`, { replaceState: true });
      } catch (e) {
        error = e instanceof ApiError && e.status === 404 ? "This group isn't open to join. Ask a member to invite you." : "Couldn't open the group. Try again in a moment.";
      }
      return;
    }
    if (!invite) {
      error = "This group link is incomplete. Ask whoever sent it to send it again.";
      return;
    }
    if (!sameServer) {
      error = "This group is on another LogIt server, so you can't join it yet. That comes when LogIt servers connect.";
      return;
    }
    try {
      preview = await groupsApi.preview(invite.code);
      if (preview.member) await goto(`/groups/${preview.id}`, { replaceState: true });
    } catch (e) {
      error = e instanceof ApiError && e.message ? e.message : "Couldn't open the group. Try again in a moment.";
    }
  });

  // With the link or an invite you're straight in; a findable group may want approval first.
  const asks = $derived(!!preview && !invite && !preview.invitedBy && preview.access === "Request");
  const questions = $derived(asks ? (preview?.questions ?? []) : []);
  const unanswered = $derived(questions.find((q) => !q.optional && !(answers[q.id] ?? "").trim()) ?? null);

  async function join() {
    if (!preview) return;
    joining = true;
    try {
      if (invite) {
        await groupsApi.join(invite.code, onBoard);
      } else {
        const given = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
        const { status } = await groupsApi.joinById(preview.id, onBoard, eventId, questions.length ? given : undefined);
        if (status === "requested") {
          preview = { ...preview, requested: true };
          toast.success("Asked. You'll get a notification when an organiser lets you in.");
          joining = false;
          return;
        }
      }
      toast.success(`You joined ${preview.name}`);
      await goto(`/groups/${preview.id}`, { replaceState: true });
    } catch (e) {
      joining = false;
      toast.error(e instanceof ApiError && e.status < 500 && e.message ? e.message : "Couldn't join. Try again.");
    }
  }

  async function cancelRequest() {
    if (!preview) return;
    try {
      await groupsApi.cancelRequest(preview.id);
      preview = { ...preview, requested: false };
    } catch {
      toast.error("Couldn't cancel. Try again.");
    }
  }

  function signIn() {
    holdRoute(groupId ? `/groups/join?id=${groupId}` : `/groups/join?c=${encodeURIComponent(raw)}`);
    void goto("/onboarding");
  }

  const followedLine = $derived.by(() => {
    const f = preview?.followed ?? [];
    const names = f.map((p) => p.displayName || p.username);
    if (names.length === 0) return "";
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
    return `${list}, who you follow, ${names.length === 1 ? "is a member" : "are members"}`;
  });
</script>

<div class="flex min-h-full flex-col px-4 pb-8 pt-[max(env(safe-area-inset-top),0.5rem)]">
  <button type="button" aria-label="Close" class="-ml-2 flex size-11 items-center justify-center" onclick={() => back("/social")}><X class="size-[22px]" /></button>
  {#if error}
    <p class="px-2 py-14 text-center text-sm text-muted-foreground">{error}</p>
  {:else if groupId && !authStore.isAuthenticated}
    <div class="flex flex-col gap-3 px-2 py-14 text-center">
      <p class="text-sm text-muted-foreground">Sign in to see this group.</p>
      <button type="button" class="h-12 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground" onclick={signIn}>Sign in or make an account</button>
    </div>
  {:else if !preview}
    <div class="flex justify-center py-16"><Spinner class="size-5 text-muted-foreground" /></div>
  {:else}
    <div class="flex flex-col items-center gap-2.5 px-2 pt-2 text-center">
      <GroupAvatar name={preview.name} src={preview.photoUrl} size={80} />
      <h1 class="text-2xl font-bold tracking-tight">{preview.name}</h1>
      <p class="text-sm text-muted-foreground">{[preview.kind, preview.place, `${preview.members} ${preview.members === 1 ? "member" : "members"}`, preview.organiser ? `run by ${preview.organiser}` : null].filter(Boolean).join(" · ")}</p>
      {#if preview.invitedBy}<p class="text-[13px] font-medium">Invited by {preview.invitedBy}</p>{/if}
      {#if followedLine}
        <div class="mt-1 flex items-center gap-2">
          <span class="flex" aria-hidden="true">{#each preview.followed as p, i (p.id)}<span class="rounded-full border-2 border-background {i ? '-ml-2' : ''}"><PersonAvatar name={p.displayName} src={p.avatarUrl} size={28} /></span>{/each}</span>
          <span class="text-[13px] text-muted-foreground">{followedLine}</span>
        </div>
      {/if}
    </div>

    {#if preview.access !== "InviteOnly"}
      <a href="/groups/{preview.id}/posts" class="mt-5 flex h-12 items-center justify-center gap-2 rounded-lg border border-border text-[15px] font-medium text-inherit no-underline"><MessagesSquare class="size-[18px]" />See posts</a>
    {/if}
    <section aria-labelledby="share-h" class="{preview.access !== "InviteOnly" ? 'mt-3' : 'mt-6'} flex flex-col gap-2.5 rounded-2xl border border-border bg-card px-4 py-3.5">
      <h2 id="share-h" class="text-[15px] font-semibold">What members see</h2>
      <ul class="flex list-disc flex-col gap-1.5 pl-[18px] text-[14px] leading-snug">
        <li>Your name and photo, which events you're going to, and the group chat</li>
        <li>On the board, if you choose below: workouts done of planned, weeks kept, volume against your usual</li>
        <li>Not your weights or your workouts, unless you share them</li>
      </ul>
    </section>
    {#if questions.length && !preview.requested}
      <section aria-labelledby="ask-h" class="mt-3 flex flex-col gap-4 rounded-2xl border border-border bg-card px-4 py-3.5">
        <div class="flex flex-col gap-0.5">
          <h2 id="ask-h" class="text-[15px] font-semibold">Ask to join</h2>
          <p class="text-[13px] text-muted-foreground">The organisers ask everyone these. Only organisers see your answers.</p>
        </div>
        {#each questions as q (q.id)}
          <div class="flex flex-col gap-2">
            <span id="gq-{q.id}" class="text-[15px] font-medium leading-snug">{q.label}{#if q.optional}<span class="ml-1.5 text-sm font-normal text-muted-foreground">Optional</span>{/if}</span>
            {#if q.kind === "choice" && q.options}
              <div role="radiogroup" aria-labelledby="gq-{q.id}" class="flex flex-wrap gap-2">
                {#each q.options as o (o)}
                  <button type="button" role="radio" aria-checked={answers[q.id] === o} class={chip(answers[q.id] === o)} onclick={() => (answers = { ...answers, [q.id]: o })}>{o}</button>
                {/each}
              </div>
            {:else}
              <Textarea aria-labelledby="gq-{q.id}" rows={2} maxlength={2000} value={answers[q.id] ?? ""} oninput={(e) => (answers = { ...answers, [q.id]: e.currentTarget.value })} class="text-[15px]" />
            {/if}
          </div>
        {/each}
      </section>
    {/if}
    <div class="mt-3 flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-card py-2 pl-4 pr-2">
      <span class="flex flex-1 flex-col gap-0.5"><span class="text-[15px] font-medium">Show me on the board</span><span class="text-[13px] text-muted-foreground">Change it any time in the group's ⋯</span></span>
      <Switch checked={onBoard} label="Show me on the board" onchange={(v) => (onBoard = v)} />
    </div>

    <div class="flex-1"></div>
    <div class="mt-6 flex flex-col gap-2">
      {#if authStore.isAuthenticated && preview.requested}
        <button type="button" disabled class="h-12 rounded-lg border border-border text-[15px] font-semibold text-muted-foreground">Requested</button>
        <button type="button" class="h-11 rounded-lg text-sm font-medium text-destructive" onclick={cancelRequest}>Cancel request</button>
        <p class="text-center text-[13px] leading-snug text-muted-foreground">An organiser approves requests. You'll get a notification when you're in.</p>
      {:else if authStore.isAuthenticated}
        <button type="button" disabled={joining || !!unanswered} class="h-12 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-60" onclick={join}>{asks ? (questions.length ? "Send request" : "Ask to join") : `Join ${preview.name}`}</button>
        {#if unanswered}<p class="text-center text-[13px] text-muted-foreground">Answer "{unanswered.label}" to send it.</p>{/if}
        {#if asks}<p class="text-center text-[13px] leading-snug text-muted-foreground">An organiser approves requests. With a member's invite or the group's link you join straight away.</p>{/if}
      {:else}
        <button type="button" class="h-12 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground" onclick={signIn}>Sign in or make an account</button>
      {/if}
      <button type="button" class="h-11 rounded-lg text-sm font-medium text-muted-foreground" onclick={() => back("/social")}>Not now</button>
    </div>
  {/if}
</div>
