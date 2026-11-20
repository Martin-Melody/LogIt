<script lang="ts">
  // A plugin block drawn from its own data only (design canvas B2/B3): the saved summary, block
  // fields, and the entries table from the shape that travels with the data. History, session
  // detail, and the plain view when the plugin isn't on this phone.
  import { profile } from "$lib/stores/profile.store";
  import type { PluginBlockData } from "@logit/core/domain/blockPlugin";
  import { formatBlockValue } from "./format";

  let { data, missingPlugin = false, max }: {
    data: PluginBlockData;
    /** Show the "made with a plugin that isn't here" note. */
    missingPlugin?: boolean;
    /** Show at most this many entries, then "+ n more". */
    max?: number;
  } = $props();

  const unit = $derived($profile.weightUnit);
  const columns = $derived(data.shape.filter(([, , , col]) => col));
  const done = $derived(data.entries.filter((e) => e.done !== false));
  const shown = $derived(max ? done.slice(0, max) : done);
  const blockLine = $derived(data.blockShape.map(([k, t]) => formatBlockValue(t, data.blockFields[k], unit)).filter((v) => v !== "–").join(" · "));
</script>

<div class="flex flex-col">
  <p class="px-3.5 pb-2 text-sm text-muted-foreground">{blockLine ? `${blockLine} · ` : ""}{data.summary}</p>
  {#if missingPlugin}
    <p class="mx-3.5 mb-2 rounded-lg bg-muted px-3 py-2 text-[13px]">Made with the {data.name} plugin, which isn't on this phone. Everything you logged is here.</p>
  {/if}
  {#if columns.length && shown.length}
    <div class="overflow-x-auto">
      <table class="w-full text-sm tabular-nums">
        <thead>
          <tr class="border-t border-border text-xs font-semibold text-muted-foreground">
            <th class="px-3.5 py-2 text-left font-semibold">#</th>
            {#each columns as [key, , label] (key)}<th class="px-2 py-2 text-left font-semibold">{label}</th>{/each}
          </tr>
        </thead>
        <tbody>
          {#each shown as e, i (e.id)}
            <tr>
              <td class="px-3.5 py-1.5 text-muted-foreground">{i + 1}</td>
              {#each columns as [key, type] (key)}<td class="px-2 py-1.5">{formatBlockValue(type, e.values[key], unit)}</td>{/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if max && done.length > max}<p class="px-3.5 py-1.5 text-[13px] text-muted-foreground">+ {done.length - max} more {data.entryName.many.toLowerCase()}</p>{/if}
  {/if}
</div>
