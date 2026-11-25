<script lang="ts">
  import { onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import MessageCircleIcon from "@lucide/svelte/icons/message-circle";
  import { dmApi, type DmThread, type DmTo } from "@logit/core/api/dmApi";
  import Avatar from "$lib/features/social/Avatar.svelte";
  import { photoSrc } from "@logit/core/api/photosApi";
  import DmChat from "$lib/features/social/DmChat.svelte";
  import PrivacyCard from "$lib/features/social/PrivacyCard.svelte";
  import { dmBadge } from "$lib/features/social/socialData.svelte";

  // Social › Messages: the phone's Messages and Message requests (design canvas M1–M3) as two
  // panes. The same conversations as the app: one server, so web and phone users message each
  // other. Coach threads stay in Coaching › Messages and My coach.

  let box = $state<"chats" | "requests">("chats");
  let chats = $state<DmThread[] | null>(null);
  let requests = $state<DmThread[]>([]);
  let error = $state(false);
  let now = $state(Date.now());

  const to = $derived<DmTo | null>(
    page.url.searchParams.get("t")
      ? { threadId: page.url.searchParams.get("t")! }
      : page.url.searchParams.get("u")
        ? { username: page.url.searchParams.get("u")! }
        : null,
  );
  const selected = $derived(to && "threadId" in to ? to.threadId : null);

  async function load() {
    try {
      [chats, requests] = await Promise.all([dmApi.threads("chats"), dmApi.threads("requests")]);
      now = Date.now();
      error = false;
      void dmBadge.refresh(true);
    } catch {
      error = true;
      chats ??= [];
    }
  }
  void load();
  const poll = setInterval(() => document.visibilityState === "visible" && void load(), 20_000);
  onDestroy(() => clearInterval(poll));

  function ago(ms: number): string {
    const s = (now - ms) / 1000;
    if (s < 60) return "now";
    if (s < 3600) return `${Math.floor(s / 60)} min`;
    if (s < 86400) return `${Math.floor(s / 3600)} h`;
    return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  const shown = $derived(box === "chats" ? (chats ?? []) : requests);
  const tab = (on: boolean) =>
    `h-8 rounded-[8px] px-3 text-[13px] font-medium ${on ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`;
</script>

<svelte:head><title>Messages · LogIt</title></svelte:head>

<div class="mx-auto flex h-[calc(100vh-7rem)] w-full max-w-[1100px] overflow-hidden rounded-[10px] border border-border bg-card">
  <aside class="flex w-full flex-col border-r border-border md:w-[320px] {to ? 'hidden md:flex' : ''}">
    <div class="flex items-center gap-1 border-b border-border p-2" role="tablist" aria-label="Messages">
      <button type="button" role="tab" aria-selected={box === "chats"} class={tab(box === "chats")} onclick={() => (box = "chats")}>Chats</button>
      <button type="button" role="tab" aria-selected={box === "requests"} class={tab(box === "requests")} onclick={() => (box = "requests")}>
        Requests{#if requests.length}<span class="ml-1.5 tabular-nums text-muted-foreground">{requests.length}</span>{/if}
      </button>
    </div>
    {#if box === "requests"}
      <p class="px-4 pt-3 text-xs text-muted-foreground">From people you don't follow. They won't know you've seen a message until you accept.</p>
    {/if}
    <div class="min-h-0 flex-1 overflow-y-auto py-1">
      {#if chats === null}
        <p class="px-4 py-6 text-[13px] text-muted-foreground">Loading…</p>
      {:else if error && shown.length === 0}
        <p class="px-4 py-6 text-[13px] text-muted-foreground">Couldn't load your messages. <button type="button" class="underline" onclick={load}>Try again</button></p>
      {:else if shown.length === 0}
        <p class="px-4 py-10 text-center text-[13px] text-muted-foreground">{box === "chats" ? "No messages yet. Open someone's profile and choose Message." : "No message requests."}</p>
      {:else}
        {#each shown as t (t.id)}
          <button type="button" onclick={() => goto(`/social/messages?t=${t.id}`)}
            class="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/60 {selected === t.id ? 'bg-muted' : ''}">
            {#if t.group}
              <span aria-hidden="true" class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-muted text-sm font-bold">{#if t.group.photoUrl}<img src={photoSrc(t.group.photoUrl)} alt="" class="size-full object-cover" />{:else}{t.group.name.slice(0, 2).toUpperCase()}{/if}</span>
            {:else}<Avatar name={t.other?.displayName ?? ""} url={t.other?.avatarUrl} size={40} />{/if}
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[13px] {t.unread ? 'font-semibold' : 'font-medium'}">{t.group ? t.group.name : t.other ? t.other.displayName || t.other.username : "Deleted account"}</span>
              <span class="flex gap-1 text-xs {t.unread ? 'font-semibold text-foreground' : 'text-muted-foreground'}"><span class="truncate">{t.lastMine ? "You: " : t.lastBy ? `${t.lastBy}: ` : ""}{t.lastBody || (t.group ? "New group" : "")}</span><span class="shrink-0 font-normal text-muted-foreground">· {ago(t.lastAtMs)}</span></span>
            </span>
            {#if t.unread}<span class="size-2 shrink-0 rounded-full bg-primary" aria-label="Unread"></span>{/if}
          </button>
        {/each}
      {/if}
    </div>
  </aside>

  <section class="min-w-0 flex-1 flex-col {to ? 'flex' : 'hidden md:flex'}">
    {#if to}
      <button type="button" onclick={() => goto("/social/messages")} class="border-b border-border px-4 py-2 text-left text-xs text-muted-foreground md:hidden">‹ All messages</button>
      <DmChat {to} onchange={load} ondelete={() => { void goto("/social/messages"); void load(); }} />
    {:else}
      <div class="m-auto flex w-full max-w-[420px] flex-col gap-6 px-6">
        <div class="flex flex-col items-center gap-2 text-center text-muted-foreground">
          <MessageCircleIcon class="size-6" />
          <p class="text-[13px]">Choose a conversation. The same messages are in the app.</p>
        </div>
        <PrivacyCard />
      </div>
    {/if}
  </section>
</div>
