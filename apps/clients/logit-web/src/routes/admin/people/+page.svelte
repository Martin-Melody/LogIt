<script lang="ts">
  import PageCrumbs from "$lib/components/PageCrumbs.svelte";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import * as Alert from "$lib/components/ui/alert";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import EllipsisIcon from "@lucide/svelte/icons/ellipsis";
  import RowMenuItems from "$lib/features/commands/RowMenuItems.svelte";
  import { personActions } from "$lib/features/commands/commands.svelte";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import { reveal } from "$lib/transitions";
  import { apiClient } from "@logit/core/api/client";
  import Avatar from "$lib/features/coaching/Avatar.svelte";
  import { ago, shortDate, when } from "$lib/features/coaching/format";
  import { adminApi, at, describeAction, temporaryPassword, type Person, type PersonRow } from "$lib/features/admin/adminApi";
  import { adminState } from "$lib/features/admin/adminState.svelte";
  import PlanBilling from "$lib/features/admin/PlanBilling.svelte";

  const hosted = !apiClient.isSelfHosted();

  let people = $state<PersonRow[]>([]);
  let listError = $state<string | null>(null);
  let loadingList = $state(true);
  let search = $state("");

  let person = $state<Person | null>(null);
  let personError = $state<string | null>(null);
  let busy = $state(false);

  // The question asked before a change, one at a time: "reset" | "signout" | "admin".
  // ?do=… (from ⌘K or a row menu) asks it as soon as the person has loaded.
  let confirming = $state<"reset" | "signout" | "admin" | null>(null);
  let deleteInput = $state<HTMLInputElement | null>(null);
  let tempPassword = $state<string | null>(null);
  let displayName = $state("");
  let email = $state("");
  let deleteTyped = $state("");

  const selectedId = $derived(page.url.searchParams.get("id"));
  const meId = apiClient.getUser()?.id;
  const nameOf = (p: { displayName: string; username: string }) => p.displayName || p.username;

  async function loadList() {
    try {
      people = (await adminApi.people(search.trim())).users;
      listError = null;
    } catch (e) {
      listError = e instanceof Error ? e.message : "Couldn't load people";
    } finally {
      loadingList = false;
    }
  }

  async function loadPerson(id: string) {
    personError = null;
    try {
      const p = await adminApi.person(id);
      if (selectedId !== id) return; // another person was picked meanwhile
      person = p;
      displayName = p.displayName;
      email = p.email;
    } catch (e) {
      personError = e instanceof Error ? e.message : "Couldn't load this person";
    }
  }

  onMount(loadList);

  $effect(() => {
    const ask = page.url.searchParams.get("do");
    if (!ask || !person || person.id !== selectedId) return;
    const u = new URL(page.url);
    u.searchParams.delete("do");
    void goto(u, { replaceState: true, noScroll: true, keepFocus: true });
    if (ask === "reset" || ask === "admin" || (ask === "signout" && person.activeTokens > 0)) confirming = ask;
    else if (ask === "signout") toast.info(`${nameOf(person)} isn't signed in anywhere`);
    else if (ask === "delete") requestAnimationFrame(() => { deleteInput?.scrollIntoView({ block: "center", behavior: "smooth" }); deleteInput?.focus({ preventScroll: true }); });
  });

  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  function onSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadList, 250);
  }

  $effect(() => {
    const id = selectedId;
    person = null;
    confirming = null;
    tempPassword = null;
    deleteTyped = "";
    if (id) void loadPerson(id);
  });

  function lastSeen(p: PersonRow): string {
    // When they were last around (the app signed in or refreshed), never what they trained.
    if (!p.lastActive) return `Joined ${shortDate(at(p.createdAt))}`;
    return `Last seen ${when(at(p.lastActive))}`;
  }

  async function run(work: () => Promise<void>, failed: string) {
    busy = true;
    try {
      await work();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : failed);
    } finally {
      busy = false;
    }
  }

  const resetPassword = (p: Person) => run(async () => {
    const pw = temporaryPassword();
    await adminApi.resetPassword(p.id, pw);
    tempPassword = pw;
    confirming = null;
    await loadPerson(p.id);
  }, "Couldn't reset the password");

  const signOut = (p: Person) => run(async () => {
    const r = await adminApi.signOutEverywhere(p.id);
    toast.success(`Signed ${nameOf(p)} out on ${r.revokedCount} device${r.revokedCount === 1 ? "" : "s"}`);
    confirming = null;
    await loadPerson(p.id);
  }, "Couldn't sign them out");

  const toggleAdmin = (p: Person) => run(async () => {
    await adminApi.updatePerson(p.id, { isAdmin: !p.isAdmin });
    toast.success(p.isAdmin ? `${nameOf(p)} is no longer an admin` : `${nameOf(p)} is now an admin`);
    confirming = null;
    if (p.id === meId) await adminState.refresh();
    await Promise.all([loadPerson(p.id), loadList()]);
  }, "Couldn't change admin");

  const saveAccount = (p: Person) => run(async () => {
    await adminApi.updatePerson(p.id, { displayName: displayName.trim(), email: email.trim() });
    toast.success("Saved");
    await Promise.all([loadPerson(p.id), loadList()]);
  }, "Couldn't save");

  const deletePerson = (p: Person) => run(async () => {
    await adminApi.deletePerson(p.id);
    toast.success(`Deleted ${p.username}'s account`);
    await goto("/admin/people", { replaceState: true });
    await loadList();
    void adminState.refreshCounts();
  }, "Couldn't delete the account");

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy. Select the password and copy it yourself.");
    }
  }

  const btn = "inline-flex h-[34px] items-center whitespace-nowrap rounded-[9px] px-3 text-[13px] font-medium disabled:opacity-50";
  const btnSecondary = `${btn} bg-muted hover:bg-accent`;
  const btnPrimary = `${btn} bg-primary font-semibold text-primary-foreground`;
  const btnDanger = `${btn} bg-destructive font-semibold text-white`;
  const input = "h-9 rounded-[9px] border border-input bg-background px-2.5 text-sm text-foreground";
</script>

<div class="flex flex-wrap items-start gap-6">
  <section aria-label="People" class="min-w-0 flex-[1_1_300px] md:max-w-[360px] {selectedId ? 'max-md:hidden' : ''}">
    <h1 class="mb-3 text-[26px] font-bold tracking-tight">People</h1>
    <label for="people-search" class="sr-only">Find a person</label>
    <input id="people-search" type="search" bind:value={search} oninput={onSearch} placeholder="Name, username or email" class="{input} mb-2 w-full" />
    {#if listError}
      <Alert.Root variant="destructive"><Alert.Description>{listError}</Alert.Description></Alert.Root>
    {:else if loadingList}
      <Skeleton class="h-64" />
    {:else}
      <ul class="flex flex-col">
        {#each people as p (p.id)}
          {@const actions = personActions(p, meId)}
          <!-- Right-click a row = its ⋯ menu. -->
          <ContextMenu.Root>
          <ContextMenu.Trigger>
          {#snippet child({ props })}
          <li {...props} class="group flex items-center rounded-lg hover:bg-muted data-[state=open]:bg-muted {selectedId === p.id ? 'bg-muted' : ''}">
            <a href="/admin/people?id={p.id}" aria-current={selectedId === p.id ? "page" : undefined}
              class="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5">
              <Avatar name={nameOf(p)} />
              <span class="flex min-w-0 flex-col">
                <span class="flex items-center gap-2 text-sm font-medium">
                  <span class="truncate">{nameOf(p)}</span>
                  {#if p.isAdmin}<span class="rounded-full bg-primary/15 px-2 py-px text-[11px] font-semibold">Admin</span>{/if}
                </span>
                <span class="truncate text-xs text-muted-foreground">@{p.username} · {lastSeen(p)}</span>
              </span>
            </a>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger aria-label="More for {nameOf(p)}"
                class="mr-1.5 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-background/60 hover:text-foreground data-[state=open]:text-foreground">
                <EllipsisIcon class="size-4" />
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end" class="w-auto min-w-60"><RowMenuItems {actions} kind="dropdown" /></DropdownMenu.Content>
            </DropdownMenu.Root>
          </li>
          {/snippet}
          </ContextMenu.Trigger>
          <ContextMenu.Content class="w-auto min-w-60"><RowMenuItems {actions} kind="context" /></ContextMenu.Content>
          </ContextMenu.Root>
        {:else}
          <li class="px-3 py-6 text-center text-[13px] text-muted-foreground">{search ? "Nobody matches that." : "Nobody here yet."}</li>
        {/each}
      </ul>
    {/if}
  </section>

  <section aria-label="Person" class="min-w-0 flex-[999_1_520px] {selectedId ? '' : 'max-md:hidden'}">
    {#if !selectedId}
      <p class="rounded-xl border border-dashed border-border px-5 py-10 text-center text-[13px] text-muted-foreground">Pick someone to reset their password, sign them out or change their account.</p>
    {:else if personError}
      <Alert.Root variant="destructive"><Alert.Description>{personError}</Alert.Description></Alert.Root>
    {:else if !person}
      <Skeleton class="h-[420px]" />
    {:else}
      {@const p = person}
      {@const name = nameOf(p)}
      <div class="flex flex-col gap-4">
        <a href="/admin/people" class="{btnSecondary} self-start md:hidden"><ArrowLeftIcon class="mr-1.5 size-4" />All people</a>
        <PageCrumbs class="max-md:hidden" crumbs={[{ label: "Admin", href: "/admin" }, { label: "People", href: "/admin/people" }, { label: name }]} />
        <header class="flex items-center gap-3.5">
          <Avatar {name} url={p.avatarUrl} size={48} />
          <div class="min-w-0">
            <h2 class="flex flex-wrap items-center gap-2 text-[22px] font-bold tracking-tight">{name}{#if p.isAdmin}<span class="rounded-full bg-primary/15 px-2 py-px text-xs font-semibold">Admin</span>{/if}</h2>
            <p class="text-[13px] text-muted-foreground">@{p.username} · {p.email} · joined {shortDate(at(p.createdAt))}{p.inviteNote ? ` with the "${p.inviteNote}" invite` : ""}</p>
          </div>
        </header>

        <div class="flex flex-wrap gap-2.5">
          {#each [["Last seen", p.lastActive ? when(at(p.lastActive)) : "Not yet"], ["Signed in on", `${p.activeTokens} device${p.activeTokens === 1 ? "" : "s"}`], ["Posts", `${p.postCount}`]] as [label, value] (label)}
            <div class="flex-[1_1_130px] rounded-xl border border-border bg-card px-3.5 py-3"><span class="block text-xs text-muted-foreground">{label}</span><strong class="text-[17px] font-semibold">{value}</strong></div>
          {/each}
        </div>

        {#if hosted}<PlanBilling person={p} onChanged={() => loadPerson(p.id)} />{/if}

        <section aria-labelledby="help" class="rounded-[14px] border border-border bg-card px-5 py-4">
          <h3 id="help" class="mb-1 text-[15px] font-semibold">Help {name}</h3>

          <div class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border py-3">
            <div class="min-w-0 flex-[1_1_300px]"><div class="text-sm font-medium">Reset password</div><p class="text-[13px] text-muted-foreground">Makes a temporary password for you to send them, and signs them out everywhere. They can change it in Settings.</p></div>
            <button type="button" class={btnSecondary} onclick={() => (confirming = "reset")}>Make a temporary password</button>
          </div>
          {#if tempPassword}
            <div transition:reveal class="-mx-5 flex flex-wrap items-center gap-3 bg-success/10 px-5 py-3">
              <div class="min-w-0 flex-[1_1_240px]"><div class="text-sm font-medium">Temporary password for {name}</div><p class="text-[13px] text-muted-foreground">Shown once. Send it to them yourself.</p></div>
              <code class="select-all rounded-lg bg-background px-3 py-2 text-[15px] tracking-wide">{tempPassword}</code>
              <button type="button" class={btnPrimary} onclick={() => copy(tempPassword!)}>Copy</button>
            </div>
          {/if}

          <div class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border py-3">
            <div class="min-w-0 flex-[1_1_300px]"><div class="text-sm font-medium">Sign out everywhere</div><p class="text-[13px] text-muted-foreground">For a lost phone. Their data stays; they sign in again.</p></div>
            <button type="button" class={btnSecondary} disabled={p.activeTokens === 0} onclick={() => (confirming = "signout")}>{p.activeTokens ? `Sign out on ${p.activeTokens} device${p.activeTokens === 1 ? "" : "s"}` : "Not signed in anywhere"}</button>
          </div>

          <div class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3">
            <div class="min-w-0 flex-[1_1_300px]"><div class="text-sm font-medium">Admin</div><p class="text-[13px] text-muted-foreground">{p.isAdmin ? `${name} can see everyone on this server and change their accounts.` : "Admins can see everyone on this server and change their accounts."}</p></div>
            <button type="button" class={btnSecondary} onclick={() => (confirming = "admin")}>{p.isAdmin ? (p.id === meId ? "Stop being an admin" : `Remove ${name} as an admin`) : `Make ${name} an admin`}</button>
          </div>
        </section>

        <section aria-labelledby="devices" class="rounded-[14px] border border-border bg-card px-5 py-4">
          <h3 id="devices" class="mb-1 text-[15px] font-semibold">Signed in on</h3>
          {#if p.devices.length}
            <ul class="text-sm">
              {#each p.devices as d, i (i)}
                <li class="flex flex-wrap justify-between gap-x-4 border-t border-border py-2 first:border-t-0"><span>{d.label ?? "A device"}</span><span class="text-muted-foreground">last seen {ago(at(d.lastSeen))}</span></li>
              {/each}
            </ul>
          {:else}
            <p class="text-[13px] text-muted-foreground">Not signed in anywhere.</p>
          {/if}
          {#if hosted && p.diagnostics.length}
            <a href="/admin/diagnostics?id={p.diagnostics[0].id}" class="mt-2 inline-flex h-[34px] items-center rounded-[9px] bg-muted px-3 text-[13px] font-medium hover:bg-accent">Open their diagnostics report ({ago(at(p.diagnostics[0].createdAt))})</a>
          {/if}
        </section>

        <section aria-labelledby="account" class="rounded-[14px] border border-border bg-card px-5 py-4">
          <h3 id="account" class="mb-3 text-[15px] font-semibold">Account</h3>
          <form class="flex flex-wrap items-end gap-3" onsubmit={(e) => { e.preventDefault(); void saveAccount(p); }}>
            <label class="flex flex-[1_1_200px] flex-col gap-1.5 text-[13px] font-medium">Display name<input bind:value={displayName} maxlength="100" class={input} /></label>
            <label class="flex flex-[1_1_220px] flex-col gap-1.5 text-[13px] font-medium">Email<input type="email" bind:value={email} required class={input} /></label>
            <button type="submit" class={btnPrimary} disabled={busy || (displayName.trim() === p.displayName && email.trim() === p.email)}>Save</button>
          </form>
        </section>

        <section aria-labelledby="history" class="rounded-[14px] border border-border bg-card px-5 py-4">
          <h3 id="history" class="mb-1 text-[15px] font-semibold">What admins did</h3>
          {#if p.adminActions.length}
            <ul class="text-sm">
              {#each p.adminActions as a (a.id)}
                <li class="flex flex-wrap justify-between gap-x-4 border-t border-border py-2"><span>{describeAction(a)}</span><span class="text-muted-foreground">{ago(at(a.createdAt))}</span></li>
              {/each}
            </ul>
          {:else}
            <p class="text-[13px] text-muted-foreground">Nothing yet. Password resets, sign-outs and other changes show here with who made them.</p>
          {/if}
        </section>

        <section aria-labelledby="delete" class="rounded-[14px] border border-destructive/35 bg-card px-5 py-4">
          <h3 id="delete" class="mb-1 text-[15px] font-semibold">Delete {p.username}'s account</h3>
          <p class="mb-3 text-[13px] text-muted-foreground">Deletes their workouts, plans, posts and everything else on this server. It can't be undone. Data on their phone stays there.</p>
          <form class="flex flex-wrap items-end gap-2.5" onsubmit={(e) => { e.preventDefault(); if (deleteTyped.trim() === p.username) void deletePerson(p); }}>
            <label class="flex max-w-[280px] flex-[1_1_200px] flex-col gap-1.5 text-[13px] font-medium">Type {p.username} to confirm<input bind:this={deleteInput} bind:value={deleteTyped} autocomplete="off" class={input} /></label>
            <button type="submit" class={btnDanger} disabled={busy || deleteTyped.trim() !== p.username}>Delete account</button>
          </form>
        </section>
      </div>
    {/if}
  </section>
</div>

{#if person}
  {@const p = person}
  {@const name = nameOf(p)}
  <AlertDialog.Root open={confirming !== null} onOpenChange={(o) => { if (!o) confirming = null; }}>
    <AlertDialog.Content>
      <AlertDialog.Header>
        <AlertDialog.Title>
          {#if confirming === "reset"}Make a temporary password for {name}?
          {:else if confirming === "signout"}Sign {name} out on {p.activeTokens} device{p.activeTokens === 1 ? "" : "s"}?
          {:else if p.isAdmin}{p.id === meId ? "Stop being an admin?" : `Remove ${name} as an admin?`}
          {:else}Make {name} an admin?{/if}
        </AlertDialog.Title>
        <AlertDialog.Description>
          {#if confirming === "reset"}{name}'s current password stops working{p.activeTokens ? ` and ${p.activeTokens} device${p.activeTokens === 1 ? " is" : "s are"} signed out` : ""}. You'll see the new one once, to send them.
          {:else if confirming === "signout"}{name} will need their password to sign in again. Their data stays.
          {:else}{p.isAdmin ? (p.id === meId ? "You'll lose the admin console straight away." : `${name} loses the admin console straight away.`) : `${name} gets everything you can do here.`} Every admin gets an email about it.{/if}
        </AlertDialog.Description>
      </AlertDialog.Header>
      <AlertDialog.Footer>
        <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
        <AlertDialog.Action disabled={busy} onclick={() => { const c = confirming; if (c === "reset") void resetPassword(p); else if (c === "signout") void signOut(p); else if (c === "admin") void toggleAdmin(p); }}>
          {confirming === "reset" ? "Reset it" : confirming === "signout" ? "Sign them out" : p.isAdmin ? "Remove admin" : "Make admin"}
        </AlertDialog.Action>
      </AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog.Root>
{/if}
