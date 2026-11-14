<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { ExternalLink } from "lucide-svelte";
  import { Button } from "$lib/components/ui/button";
  import { apiClient } from "@logit/core/api/client";
  import { authStore } from "$lib/api/authStore.svelte";
  import { billing } from "$lib/billing/billing.svelte";
  import { hasPlayBilling } from "$lib/billing/playBilling";
  import { planCardModel, type PlanAction } from "$lib/billing/plans";

  // The Plan section of Settings › Account: what plan this account has and what to do about it.
  const selfHosted = $derived(apiClient.isSelfHosted());
  const model = $derived(
    planCardModel(billing.status, {
      selfHosted,
      tier: authStore.user?.tier ?? "Free",
      canBuyHere: hasPlayBilling(),
    }),
  );

  onMount(() => {
    if (selfHosted) void billing.checkForeignOnly();
    else void billing.refreshStatus();
  });

  function run(action: PlanAction) {
    if (action === "plans") void goto("/plans");
    else void billing.openSubscriptions(billing.status?.subscription?.productId);
  }

  const badgeClass = {
    success: "text-success bg-success/12",
    neutral: "text-primary bg-primary/12",
    warning: "text-warning bg-warning/12",
    danger: "text-destructive bg-destructive/14",
  } as const;
</script>

<div class="flex flex-col gap-2.5 border-t border-border py-3.5">
  <div class="flex items-center justify-between gap-2">
    <span class="flex items-center gap-2">
      <span class="text-sm font-semibold">{model.title}</span>
      {#if model.badge}
        <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold {badgeClass[model.badge.tone]}">{model.badge.text}</span>
      {/if}
    </span>
    {#if model.source}<span class="text-xs text-muted-foreground">{model.source}</span>{/if}
  </div>
  <p class="text-[13px] leading-normal text-muted-foreground">{model.text}</p>

  {#if selfHosted && billing.foreignPurchases.length > 0}
    <p class="text-[13px] leading-normal text-warning">
      This phone still has a Google Play subscription for LogIt on getlogit.app. It keeps renewing until you cancel it.
      <button type="button" class="font-semibold underline underline-offset-4" onclick={() => void billing.openSubscriptions()}>Open Google Play</button>
    </p>
  {/if}

  {#if model.primary || model.secondary}
    <div class="flex gap-2">
      {#if model.primary}
        <Button class="flex-1" variant={model.quietPrimary ? "outline" : "default"} onclick={() => run(model.primary!.action)}>
          {model.primary.label}
          {#if model.primary.action !== "plans"}<ExternalLink class="size-3.5" />{/if}
        </Button>
      {/if}
      {#if model.secondary}
        <Button variant="outline" onclick={() => run(model.secondary!.action)}>{model.secondary.label}</Button>
      {/if}
    </div>
  {/if}
</div>
