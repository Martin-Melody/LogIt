<!-- Canvas Q1/MP1: meal plan or recipe packs from the community. Open one to see what's in it;
     Copy to yours makes your own, which a newer pack version never changes. -->
<script lang="ts" generics="T extends { id: string; name: string }">
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import type { HostedRegistryEntry } from "@logit/core/api/pluginsApi";
  import { communityPacks } from "./nutritionPacks";

  let { family, load, describe, oncopy, what }: {
    family: "meal-plan-pack" | "recipe-pack";
    load: (e: HostedRegistryEntry) => Promise<T[]>;
    describe: (item: T) => string;
    oncopy: (item: T, pack: HostedRegistryEntry) => Promise<void>;
    what: string;
  } = $props();

  let packs = $state<HostedRegistryEntry[] | null>(null);
  let error = $state<string | null>(null);
  let open = $state<string | null>(null);
  let items = $state<Record<string, T[] | string>>({});
  let busy = $state<string | null>(null);
  $effect(() => { void communityPacks(family).then((p) => (packs = p)).catch((e) => { packs = []; error = e instanceof Error ? e.message : String(e); }); });

  async function toggle(e: HostedRegistryEntry) {
    open = open === e.id ? null : e.id;
    if (open && !items[e.id]) items = { ...items, [e.id]: await load(e).catch((x) => (x instanceof Error ? x.message : "Couldn't read this pack")) };
  }
  async function copy(item: T, e: HostedRegistryEntry) {
    busy = item.id;
    try { await oncopy(item, e); } finally { busy = null; }
  }
</script>

<section class="flex flex-col rounded-[12px] border border-border bg-card" aria-label="Community {what}">
  {#if !packs}
    <div class="p-5"><Skeleton class="h-16" /></div>
  {:else if !packs.length}
    <div class="flex flex-col items-start gap-2 p-5 text-[13px]">
      <p class="text-muted-foreground">{error ? `Couldn't load the directory: ${error}` : `No ${what} packs are listed yet. Anyone can make one in Plugins › Build a plugin.`}</p>
      <Button variant="outline" size="sm" href="/coaching/plugins">Coaching › Plugins</Button>
    </div>
  {:else}
    {#each packs as e (e.id)}
      {@const list = items[e.id]}
      <div class="border-t border-border first:border-t-0">
        <button type="button" class="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-muted/40" aria-expanded={open === e.id} onclick={() => void toggle(e)}>
          <span class="flex min-w-0 flex-1 flex-col"><span class="text-[14px] font-semibold">{e.name}</span><span class="truncate text-xs text-muted-foreground">{e.description}{e.author ? ` · by ${e.author.startsWith("@") ? "" : "@"}${e.author}` : ""}</span></span>
          <span class="text-xs text-muted-foreground">{open === e.id ? "Hide" : "Open"}</span>
        </button>
        {#if open === e.id}
          {#if !list}<div class="px-5 pb-3"><Skeleton class="h-10" /></div>
          {:else if typeof list === "string"}<p class="px-5 pb-3 text-[13px] text-destructive">{list}</p>
          {:else}
            <ul class="flex flex-col pb-2">
              {#each list as it (it.id)}
                <li class="flex items-center gap-3 px-5 py-2 text-[13px]">
                  <span class="flex min-w-0 flex-1 flex-col"><span class="font-medium">{it.name}</span><span class="text-xs text-muted-foreground">{describe(it)}</span></span>
                  <Button variant="outline" size="sm" disabled={busy === it.id} onclick={() => void copy(it, e)}>Copy to yours</Button>
                </li>
              {/each}
            </ul>
          {/if}
        {/if}
      </div>
    {/each}
  {/if}
</section>
