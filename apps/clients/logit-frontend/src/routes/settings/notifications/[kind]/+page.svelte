<!-- Settings › Notifications › one kind (design canvas P6). Likes and comments get Instagram's
     three choices; the rest are on or off. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import SettingsPage from "$lib/features/settings/SettingsPage.svelte";
  import { AUDIENCE_LABEL, changePushSettings, loadPushSettings, pushSettings } from "$lib/features/settings/pushSettings.svelte";
  import type { PushAudience, PushSettings } from "@logit/core/api/pushApi";

  type Switchable = "follows" | "messages" | "coaching";
  const KINDS: Record<string, { title: string; note?: string }> = {
    likes: { title: "Likes and comments" },
    follows: { title: "Followers and requests", note: "New followers, follow requests and accepted requests, gathered into a few pushes a day." },
    messages: { title: "Messages", note: "When your coach or client messages you. Arrives straight away and says who, never what." },
    coaching: { title: "Coaching", note: "Programs, coaching invites and payment problems. Arrives straight away." },
  };
  const kind = $derived(page.params.kind ?? "");
  const meta = $derived(KINDS[kind] ?? { title: "Notifications" });
  const s = $derived(pushSettings.value);

  onMount(() => {
    if (!pushSettings.value) void loadPushSettings();
  });

  const AUDIENCES: PushAudience[] = ["Off", "Following", "Everyone"];
  const card = "m-0 rounded-xl border border-border bg-card px-4 py-1.5";
  const legend = "float-left w-full pt-2.5 pb-0.5 text-[13px] font-semibold text-muted-foreground";
  const option = "clear-both flex min-h-13 cursor-pointer items-center justify-between border-b border-border text-[15px] last:border-b-0";
</script>

<SettingsPage title={meta.title}>
  {#if s && kind === "likes"}
    {#each [{ key: "likes", label: "Likes" }, { key: "comments", label: "Comments and replies" }] as group (group.key)}
      <fieldset class={card}>
        <legend class={legend}>{group.label}</legend>
        {#each AUDIENCES as a (a)}
          <label class={option}>
            {AUDIENCE_LABEL[a]}
            <input type="radio" name={group.key} class="radio" checked={s[group.key as "likes" | "comments"] === a}
              onchange={() => changePushSettings({ [group.key]: a })} />
          </label>
        {/each}
      </fieldset>
    {/each}

    <section aria-labelledby="ex-h" class="flex flex-col gap-2 px-1">
      <h2 id="ex-h" class="text-[13px] font-semibold text-muted-foreground">How they arrive</h2>
      <div class="flex flex-col gap-0.5 rounded-2xl bg-[oklch(0.95_0.005_250)] px-3.5 py-3 text-[oklch(0.2_0.01_250)]" aria-hidden="true">
        <span class="text-xs text-[oklch(0.42_0.01_250)]">LogIt · Social · 18:40</span>
        <span class="text-[15px] font-semibold">Ava and 3 others</span>
        <span class="text-sm">liked your post</span>
      </div>
      <p class="text-[13px] leading-relaxed text-muted-foreground">Gathered into a few pushes a day, never one per like. Everything still shows in the Inbox as it happens.</p>
    </section>
  {:else if s && kind in KINDS}
    {@const key = kind as Switchable}
    <fieldset class={card}>
      <legend class="sr-only">{meta.title}</legend>
      {#each [false, true] as on (on)}
        <label class={option}>
          {on ? "On" : "Off"}
          <input type="radio" name={key} class="radio" checked={(s as PushSettings)[key] === on} onchange={() => changePushSettings({ [key]: on })} />
        </label>
      {/each}
    </fieldset>
    {#if meta.note}<p class="px-1 text-[13px] leading-relaxed text-muted-foreground">{meta.note}</p>{/if}
  {/if}
</SettingsPage>

<style>
  .radio {
    appearance: none;
    margin: 0;
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    display: grid;
    place-content: center;
    border-radius: 50%;
    border: 2px solid var(--muted-foreground);
    transition: border-color 150ms ease-out;
  }
  .radio::before {
    content: "";
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--primary);
    transform: scale(0);
    transition: transform 160ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .radio:checked { border-color: var(--primary); }
  .radio:checked::before { transform: scale(1); }
  .radio:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) {
    .radio, .radio::before { transition: none; }
  }
</style>
