<script lang="ts">
  import { goto } from "$app/navigation";
  import { Lock } from "lucide-svelte";
  import { Button } from "$lib/components/ui/button";
  import { hasPlayBilling } from "$lib/billing/playBilling";

  // Shown where someone on Free meets a paid feature. Never on a self-hosted server (it
  // includes everything), so callers check the tier only.
  interface Props {
    title: string;
    text: string;
    plan: "Pro" | "Studio";
  }
  const { title, text, plan }: Props = $props();
</script>

<section class="flex flex-col gap-3 rounded-[10px] border border-border bg-card px-4 py-4">
  <div class="flex items-center gap-2.5">
    <div class="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
      <Lock class="size-4 text-primary" />
    </div>
    <h2 class="text-[15px] font-semibold">{title}</h2>
  </div>
  <p class="text-[13px] leading-normal text-muted-foreground">{text}</p>
  {#if hasPlayBilling()}
    <Button class="w-full" onclick={() => void goto(`/plans?plan=${plan.toLowerCase()}`)}>See {plan}</Button>
  {:else}
    <p class="text-xs text-muted-foreground">{plan} is bought in the LogIt Android app.</p>
  {/if}
</section>
