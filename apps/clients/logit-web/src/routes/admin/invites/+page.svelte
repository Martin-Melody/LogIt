<script lang="ts">
  import { onMount } from "svelte";
  import { flip } from "svelte/animate";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import { reveal } from "$lib/transitions";
  import { apiClient } from "@logit/core/api/client";
  import { shortDate } from "$lib/features/coaching/format";
  import { adminApi, at, type Invite } from "$lib/features/admin/adminApi";

  let invites = $state<Invite[]>([]);
  let mode = $state<"open" | "invite" | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(true);
  let busy = $state<string | null>(null);

  let note = $state("");
  let uses = $state("1");
  let ends = $state("7");
  let formError = $state<string | null>(null);
  let creating = $state(false);
  let made = $state<Invite | null>(null);

  async function load() {
    try {
      const [list, o] = await Promise.all([adminApi.invites(), adminApi.overview()]);
      invites = list;
      mode = o.server.registrationMode;
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load invites";
    } finally {
      loading = false;
    }
  }
  onMount(load);

  /** The message to send: same wording as the old admin page, with this server's address. */
  function message(i: Invite): string {
    const howMany = i.maxUses === 1 ? "works once" : `works for ${i.maxUses} people`;
    const until = i.expiresAt ? `, until ${shortDate(at(i.expiresAt))}` : "";
    return `You're invited to my LogIt server.\n\n` +
      `1. Install LogIt from Google Play.\n` +
      `2. Open it and tap "I already have an account", then Server › My own server, and enter:\n` +
      `   ${apiClient.getBaseUrl()}\n` +
      `3. Tap Use this server, then Create account, and use invite code ${i.code}\n` +
      `   (${howMany}${until}).`;
  }

  async function create(e: Event) {
    e.preventDefault();
    formError = null;
    const maxUses = Number(uses);
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000) {
      formError = "People who can use it must be a whole number from 1 to 1000.";
      return;
    }
    creating = true;
    try {
      const r = await adminApi.createInvite({ note: note.trim() || null, maxUses, expiresInDays: ends ? Number(ends) : null });
      await load();
      made = invites.find((i) => i.id === r.id) ?? null;
      note = "";
      uses = "1";
    } catch (e) {
      formError = e instanceof Error ? e.message : "Couldn't create the invite";
    } finally {
      creating = false;
    }
  }

  async function act(id: string, work: () => Promise<unknown>, done: string, failed: string) {
    busy = id;
    try {
      await work();
      toast.success(done);
      if (made?.id === id) made = null;
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : failed);
    } finally {
      busy = null;
    }
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it yourself.");
    }
  }

  const isLive = (i: Invite) => !i.revokedAt && i.useCount < i.maxUses && (!i.expiresAt || at(i.expiresAt) > Date.now());
  function stateText(i: Invite): string {
    if (i.revokedAt) return "Cancelled";
    if (i.useCount >= i.maxUses) return "Used";
    if (i.expiresAt && at(i.expiresAt) <= Date.now()) return "Ended";
    return "";
  }

  const btn = "inline-flex h-[30px] items-center whitespace-nowrap rounded-lg px-2.5 text-xs font-medium disabled:opacity-50";
  const btnSecondary = `${btn} border border-border hover:bg-muted`;
  const input = "h-9 rounded-[9px] border border-input bg-background px-2.5 text-[13px] text-foreground";
</script>

<div class="flex max-w-[1100px] flex-col gap-4">
  <header>
    <h1 class="text-[26px] font-bold tracking-tight">Invites</h1>
    {#if mode}<p class="mt-1 text-[13px] text-muted-foreground">{mode === "invite" ? "Sign-ups on this server are invite-only." : "Anyone can sign up on this server; an invite still gives people a ready-to-send message."} It's set by <code class="rounded bg-muted px-1 text-xs">REGISTRATION_MODE</code> in the server's .env.</p>{/if}
  </header>

  <section aria-labelledby="new" class="flex flex-col gap-3 rounded-[14px] border border-border bg-card px-5 py-4">
    <h2 id="new" class="text-[15px] font-semibold">New invite</h2>
    <form class="flex flex-wrap items-end gap-3" onsubmit={create}>
      <label class="flex flex-[2_1_220px] flex-col gap-1.5 text-[13px] font-medium">Who it's for
        <input bind:value={note} maxlength="200" placeholder="e.g. Sarah, or gym group" class={input} />
      </label>
      <label class="flex flex-[1_1_150px] flex-col gap-1.5 text-[13px] font-medium">People who can use it
        <input bind:value={uses} inputmode="numeric" class={input} />
      </label>
      <label class="flex flex-[1_1_150px] flex-col gap-1.5 text-[13px] font-medium">Ends after
        <select bind:value={ends} class={input}>
          <option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="">Never</option>
        </select>
      </label>
      <button type="submit" disabled={creating} class="h-9 rounded-[9px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Create invite</button>
    </form>
    {#if formError}<p class="text-xs text-destructive">{formError}</p>{/if}
  </section>

  {#if made}
    <section transition:reveal aria-labelledby="made" class="flex flex-col gap-3 rounded-[14px] border border-success/30 bg-success/5 px-5 py-4">
      <div class="flex flex-wrap items-baseline gap-2.5">
        <h2 id="made" class="text-[15px] font-semibold">{made.note ? `Invite for ${made.note} is ready` : "Invite is ready"}</h2>
        <code class="font-mono text-[15px] tracking-wider">{made.code}</code>
      </div>
      <pre class="whitespace-pre-wrap rounded-[10px] bg-background px-4 py-3.5 font-sans text-sm leading-relaxed">{message(made)}</pre>
      <div class="flex flex-wrap gap-2">
        <button type="button" onclick={() => copy(message(made!), "Message")} class="h-9 rounded-[9px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground">Copy message</button>
        <button type="button" onclick={() => copy(made!.code, "Code")} class="h-9 rounded-[9px] bg-muted px-3.5 text-[13px] font-medium hover:bg-accent">Copy code only</button>
      </div>
    </section>
  {/if}

  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {:else if loading}
    <Skeleton class="h-48" />
  {:else}
    <section aria-labelledby="all" class="rounded-[14px] border border-border bg-card px-1.5 py-2">
      <h2 id="all" class="px-3 pb-1 pt-2 text-[15px] font-semibold">All invites</h2>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[760px] border-collapse text-[13px] tabular-nums">
          <thead><tr class="text-left text-xs text-muted-foreground"><th class="px-3 py-2 font-medium">Code</th><th class="px-3 py-2 font-medium">For</th><th class="px-3 py-2 font-medium">Used</th><th class="px-3 py-2 font-medium">Ends</th><th class="px-3 py-2 font-medium">Signed up</th><th></th></tr></thead>
          <tbody>
            {#each invites as i (i.id)}
              {@const live = isLive(i)}
              <tr animate:flip={{ duration: 160 }} class="border-t border-border {live ? '' : 'text-muted-foreground'}">
                <td class="whitespace-nowrap px-3 py-3 font-mono text-xs tracking-wider">{i.code}</td>
                <td class="px-3 py-3">{i.note ?? "—"}</td>
                <td class="whitespace-nowrap px-3 py-3">{i.useCount} of {i.maxUses}</td>
                <td class="whitespace-nowrap px-3 py-3">{stateText(i) || (i.expiresAt ? shortDate(at(i.expiresAt)) : "Never")}</td>
                <td class="px-3 py-3">
                  {#if i.usedBy.length}
                    {#each i.usedBy.slice(0, 3) as u, n (u.id)}{n ? ", " : ""}<a href="/admin/people?id={u.id}" class="text-primary hover:underline">{u.username}</a>{/each}{i.usedBy.length > 3 ? `, +${i.usedBy.length - 3}` : ""}
                  {:else}<span class="text-muted-foreground">Nobody yet</span>{/if}
                </td>
                <td class="px-3 py-3 text-right">
                  {#if live}
                    <span class="inline-flex flex-wrap justify-end gap-1.5">
                      <button type="button" class={btnSecondary} onclick={() => copy(message(i), "Message")}>Copy message</button>
                      {#if i.expiresAt}<button type="button" class={btnSecondary} disabled={busy === i.id} onclick={() => act(i.id, () => adminApi.extendInvite(i.id, 7), "Invite extended by 7 days", "Couldn't extend the invite")}>Extend 7 days</button>{/if}
                      <button type="button" class={btnSecondary} disabled={busy === i.id} onclick={() => act(i.id, () => adminApi.cancelInvite(i.id), "Invite cancelled", "Couldn't cancel the invite")}>Cancel invite</button>
                    </span>
                  {/if}
                </td>
              </tr>
            {:else}
              <tr><td colspan="6" class="px-3 py-6 text-center text-muted-foreground">No invites yet. Make one above.</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}
</div>
