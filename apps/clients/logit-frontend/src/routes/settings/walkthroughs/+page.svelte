<!-- Settings › Walkthroughs: every phone tour, from the same list as the web walkthroughs. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { ChevronRight } from "lucide-svelte";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { back } from "$lib/navigation";
  import { authStore } from "$lib/api/authStore.svelte";
  import { apiClient } from "@logit/core/api/client";
  import { guideApi } from "@logit/core/api/guideApi";
  import type { Chapter } from "@logit/core/guide/types";
  import { phoneChapters, requestReplay, tourState } from "$lib/tour/index";

  const tier = $derived(authStore.user?.tier ?? "Free");
  const selfHosted = $derived(authStore.isAuthenticated && apiClient.isSelfHosted());
  const chapters = phoneChapters();
  const groups = $derived([
    ...(tier === "Studio" || selfHosted ? [{ title: "Studio on this phone", list: chapters.filter((c) => c.walkthrough === "studio") }] : []),
    ...(tier !== "Free" || selfHosted ? [{ title: "Pro on this phone", list: chapters.filter((c) => c.walkthrough === "pro") }] : []),
    { title: "The app", list: chapters.filter((c) => c.walkthrough === "app") },
  ]);

  // Chapters finished anywhere (the web too), when signed in.
  let doneOnAccount = $state<Record<string, number>>({});
  onMount(async () => {
    if (!apiClient.isAuthenticated()) return;
    try {
      doneOnAccount = (await guideApi.get()).done;
    } catch {
      // Offline: just this phone's ticks.
    }
  });
  const isDone = (id: string) => id in doneOnAccount || id in $tourState.done;

  /** A tour that lives on one split's or day's screen (its route has an id in it). */
  const onOneScreen = (c: Chapter) => c.steps.some((s) => s.on === "phone" && s.route.includes("["));

  function replay(c: Chapter) {
    requestReplay(c.id);
    const route = c.steps.find((s) => s.on === "phone")!.route;
    // A tour on one split's or day's screen starts when you next open one.
    void goto(/\[/.test(route) ? "/splits" : route);
  }
</script>

<div class="flex flex-col pb-24">
  <PageHeader>
    <BackButton onclick={() => back("/settings")} />
    <h1 class="page-title">Walkthroughs</h1>
  </PageHeader>

  {#if tier !== "Free" || selfHosted}
    <div class="mx-4 mt-3 rounded-xl border border-border bg-card p-4">
      <p class="text-sm font-semibold">The full walkthroughs are on the web</p>
      <p class="mt-1 text-sm leading-relaxed text-muted-foreground">
        Open app.getlogit.app on a computer and choose Guide. Chapters you finish there are ticked here too.
      </p>
    </div>
  {/if}

  {#each groups as g (g.title)}
    {#if g.list.length}
      <h2 class="px-4 pb-1.5 pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.title}</h2>
      <ul class="divide-y divide-border border-y border-border">
        {#each g.list as c (c.id)}
          <li>
            <button type="button" class="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted/40" onclick={() => replay(c)}>
              <span class="min-w-0 flex-1">
                <span class="block text-[15px]">{c.title}</span>
                <span class="text-xs text-muted-foreground">{c.blurb}{onOneScreen(c) ? " · opens on the next one you visit" : ""}</span>
              </span>
              {#if isDone(c.id)}<span class="rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-semibold text-success">Done</span>{/if}
              <ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/each}
</div>
