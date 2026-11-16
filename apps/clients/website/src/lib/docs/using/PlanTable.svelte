<!-- What each plan can do: worked out from the app's feature list (planTable). -->
<script lang="ts">
  import Check from "@lucide/svelte/icons/check";
  import Minus from "@lucide/svelte/icons/minus";
  import { planTable } from "@logit/core/guide/planTable";
  import { PLANS } from "@logit/core/guide/types";

  let { links = true }: { links?: boolean } = $props();
  const rows = planTable();
</script>

<div class="not-prose overflow-x-auto rounded-[14px] border border-border">
  <table class="w-full min-w-[560px] border-collapse text-[15px]">
    <thead>
      <tr class="bg-card text-left">
        <th scope="col" class="px-5 py-3.5"><span class="sr-only">Feature</span></th>
        {#each PLANS as p (p)}<th scope="col" class="w-[130px] px-5 py-3.5 font-semibold text-foreground">{p}</th>{/each}
      </tr>
    </thead>
    <tbody>
      {#each rows as r (r.label)}
        <tr class="border-t border-border">
          <th scope="row" class="px-5 py-3.5 text-left font-normal text-foreground">
            {#if links}<a href={r.docs} class="underline-offset-4 hover:underline">{r.label}</a>{:else}{r.label}{/if}
          </th>
          {#each PLANS as p (p)}
            {@const cell = r.cells[p]}
            <td class="px-5 py-3.5">
              {#if cell === true}<Check class="size-[18px] text-success" strokeWidth={2.4} aria-label="Included" />
              {:else if cell === false}<Minus class="size-[18px] text-muted-foreground/60" aria-label="Not included" />
              {:else}<span class="text-sm text-foreground/85">{cell}</span>{/if}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
