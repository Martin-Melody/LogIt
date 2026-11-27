<!-- A coach's invite to coaching in a chat (canvas MS5): their coaching headline and packages
     with "Ask … to coach you", or an offer they made with "Look at the offer". -->
<script lang="ts">
  import { goto } from "$app/navigation";
  import type { CoachInviteCard } from "@logit/core/domain/messageCard";
  import { formatMoney } from "@logit/core/domain/coachPayments";

  const { invite, mine = false, onask }: { invite: CoachInviteCard; mine?: boolean; onask?: () => void } = $props();
  const first = $derived(invite.coachName.split(" ")[0] || invite.coachName);
</script>

<div class="flex w-64 max-w-full flex-col gap-2 rounded-2xl border border-border bg-card p-3">
  {#if invite.offer}
    <span class="text-[12px] text-muted-foreground">{mine ? "You offered a spot" : `${first} offered you a spot`}</span>
    <span class="flex items-baseline justify-between gap-2"><span class="text-[15px] font-semibold">{invite.offer.packageName}</span>{#if invite.offer.pays}<span class="text-[15px] font-semibold tabular-nums">{formatMoney(invite.offer.amountCents, invite.offer.currency)}</span>{/if}</span>
    <span class="text-[12px] text-muted-foreground">Held until {new Date(invite.offer.holdUntilMs).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</span>
    {#if !mine}<button type="button" class="h-10 rounded-lg bg-primary text-sm font-semibold text-primary-foreground" onclick={() => void goto("/clients")}>Look at the offer</button>{/if}
  {:else}
    <span class="text-[12px] text-muted-foreground">{mine ? "Your coaching invite" : `${first} coaches`}</span>
    <span class="text-[15px] font-semibold">{invite.headline}</span>
    {#if invite.packages.length}<span class="text-[12px] text-muted-foreground">{invite.packages.map((p) => `${p.name} ${formatMoney(p.amountCents, p.currency)}`).join(" · ")}</span>{/if}
    {#if !mine}<button type="button" class="h-10 rounded-lg bg-primary text-sm font-semibold text-primary-foreground" onclick={() => onask?.()}>Ask {first} to coach you</button>{/if}
  {/if}
</div>
