<!-- Invite to a group (design canvas G15, G10): Send to people you chat with or follow (an invite
     card in your chat with them, which lets them join straight away), or share the link and QR
     for the gym wall. Members already in the group aren't listed. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { Copy, QrCode, Search, Share2 } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import QRCode from "qrcode";
  import { Capacitor } from "@capacitor/core";
  import { ApiError } from "@logit/core/api/client";
  import { dmApi } from "@logit/core/api/dmApi";
  import { socialApi } from "@logit/core/api/socialApi";
  import { groupInviteCard, groupLink, groupsApi } from "@logit/core/api/groupsApi";
  import { authStore } from "$lib/api/authStore.svelte";
  import BottomSheet from "$lib/features/nutrition/ui/BottomSheet.svelte";
  import PersonAvatar from "./PersonAvatar.svelte";
  import { shortAgo } from "$lib/features/friends/dmTime";
  import { reveal } from "$lib/transitions";

  const { groupId, name, code, onclose }: { groupId: string; name: string; code: string; onclose: () => void } = $props();

  type Person = { username: string; displayName: string; avatarUrl: string | null; why: string };
  let people = $state<Person[] | null>(null);
  let query = $state("");
  let sent = $state(new Set<string>());
  let sending = $state<string | null>(null);
  let showQr = $state(false);
  let qr = $state<string | null>(null);
  const link = $derived(groupLink(code));
  const native = Capacitor.isNativePlatform();
  const canShare = native || (typeof navigator !== "undefined" && typeof navigator.share === "function");
  const message = $derived(`Join ${name} on LogIt: ${link}`);

  // Recent chats first, then the rest of the people you follow; never members already.
  onMount(async () => {
    const now = Date.now();
    const [threads, following, members] = await Promise.all([
      dmApi.threads("chats").catch(() => []),
      socialApi.getFollowing(authStore.user?.username ?? "").catch(() => []),
      groupsApi.members(groupId).catch(() => []),
    ]);
    const inGroup = new Set(members.map((m) => m.user.username));
    const list: Person[] = [];
    for (const t of threads) {
      if (!t.other || t.group || inGroup.has(t.other.username)) continue;
      list.push({ username: t.other.username, displayName: t.other.displayName || t.other.username, avatarUrl: t.other.avatarUrl, why: `Chatted ${shortAgo(t.lastAtMs, now)} ago` });
    }
    for (const f of following) {
      if (inGroup.has(f.username) || list.some((p) => p.username === f.username)) continue;
      list.push({ username: f.username, displayName: f.displayName || f.username, avatarUrl: f.avatarUrl, why: "You follow them" });
    }
    people = list;
  });

  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return (people ?? []).filter((p) => !q || p.displayName.toLowerCase().includes(q) || p.username.includes(q)).slice(0, 50);
  });

  async function send(p: Person) {
    sending = p.username;
    try {
      const card = groupInviteCard(groupId);
      await dmApi.send({ username: p.username }, crypto.randomUUID(), "", { card });
      sent = new Set([...sent, p.username]);
    } catch (e) {
      toast.error(e instanceof ApiError && e.status < 500 && e.message ? e.message : "Couldn't send it. Check your connection and try again.");
    } finally {
      sending = null;
    }
  }

  async function toggleQr() {
    showQr = !showQr;
    if (showQr && !qr) qr = await QRCode.toDataURL(link, { margin: 1, width: 400, color: { dark: "#1c1f26", light: "#ffffff" } });
  }

  async function share() {
    try {
      if (native) {
        const { Share } = await import("@capacitor/share");
        await Share.share({ title: name, text: message, dialogTitle: `Invite to ${name}` });
      } else await navigator.share({ title: name, text: message });
    } catch {
      // Cancelled.
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast("Link copied");
    } catch {
      toast("Couldn't copy. Select the link and copy it yourself.");
    }
  }
</script>

<BottomSheet label="Invite to {name}" {onclose} tall>
  <div class="flex flex-col gap-3 px-4 pb-3">
    <h2 class="text-[19px] font-semibold">Invite to {name}</h2>
    {#if (people?.length ?? 0) > 6}
      <label class="flex h-10 items-center gap-2 rounded-lg bg-muted px-3 text-muted-foreground">
        <Search class="size-4" /><input bind:value={query} placeholder="Search people you follow" aria-label="Search people you follow" class="min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground" />
      </label>
    {/if}
    {#if people === null}
      {#each [0, 1, 2] as i (i)}<div class="flex items-center gap-3 py-1.5"><span class="size-10 animate-pulse rounded-full bg-muted"></span><span class="h-4 w-32 animate-pulse rounded bg-muted"></span></div>{/each}
    {:else if people.length === 0}
      <p class="py-2 text-sm text-muted-foreground">People you chat with or follow show here. Or share the link below.</p>
    {:else}
      <ul class="flex max-h-[40vh] flex-col overflow-y-auto">
        {#each shown as p (p.username)}
          {@const done = sent.has(p.username)}
          <li class="flex min-h-14 items-center gap-3">
            <PersonAvatar name={p.displayName} src={p.avatarUrl} size={40} />
            <span class="flex min-w-0 flex-1 flex-col"><span class="truncate text-[15px] font-medium">{p.displayName}</span><span class="truncate text-[12px] text-muted-foreground">{p.why}</span></span>
            <button type="button" disabled={done || sending === p.username} onclick={() => send(p)}
              class="h-9 min-w-[72px] shrink-0 rounded-lg px-3 text-[13px] font-semibold transition-colors {done ? 'border border-border text-muted-foreground' : 'bg-primary text-primary-foreground'} disabled:opacity-100">
              {done ? "Sent" : "Send"}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    <div class="flex items-center gap-2.5 text-[12px] text-muted-foreground"><span class="h-px flex-1 bg-border"></span>or share the link<span class="h-px flex-1 bg-border"></span></div>
    {#if showQr}
      <div transition:reveal class="flex flex-col items-center gap-2">
        {#if qr}<img src={qr} alt="QR code to join {name}" class="size-[200px] rounded-2xl bg-white p-2" />{:else}<div class="size-[200px] animate-pulse rounded-2xl bg-muted"></div>{/if}
        <span class="text-[13px] text-muted-foreground">Print it for the wall, or let them scan it</span>
      </div>
    {/if}
    <div class="grid {canShare ? 'grid-cols-3' : 'grid-cols-2'} gap-2">
      <button type="button" aria-pressed={showQr} class="flex h-11 items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium" onclick={toggleQr}><QrCode class="size-4" />QR code</button>
      {#if canShare}<button type="button" class="flex h-11 items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium" onclick={share}><Share2 class="size-4" />Share</button>{/if}
      <button type="button" class="flex h-11 items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium" onclick={copy}><Copy class="size-4" />Copy</button>
    </div>
    <p class="text-[12px] leading-snug text-muted-foreground">Send puts an invite in your chat with them (in their requests if they don't follow you). Anyone with the link or QR can join.</p>
  </div>
</BottomSheet>
