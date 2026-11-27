<!-- A coach's Coaching section (canvas P1), the same on getlogit.app, the web, the phone and the
     profile editor's preview. Each app says where "Ask to be coached" goes (null hides it) and
     how @mentions and #tags link. -->
<script lang="ts">
  import type { CoachingSection } from "@logit/core/domain/coachProfile";
  import { whereText } from "@logit/core/domain/coachProfile";
  import { priceText } from "@logit/core/domain/coachPayments";
  import RichText from "./RichText.svelte";

  let {
    section,
    name,
    askHref,
    mentionHref,
    tagHref,
    class: className = "",
  }: {
    section: CoachingSection;
    /** The coach's display name. */
    name: string;
    askHref: string | null;
    mentionHref?: (username: string) => string;
    tagHref?: (tag: string) => string;
    class?: string;
  } = $props();

  const first = $derived(name.trim().split(/\s+/)[0] || name);
</script>

<section aria-labelledby="coaching-title" class="flex flex-col gap-3 {className}">
  <div class="flex flex-col gap-0.5">
    <h2 id="coaching-title" class="text-[15px] font-semibold">Coaching with {first}</h2>
    <p class="text-[15px] font-medium">{section.headline}</p>
    <p class="text-[13px] text-muted-foreground">{whereText(section)}</p>
  </div>
  {#if section.about}
    <RichText text={section.about} class="text-[14px] leading-relaxed text-muted-foreground" {mentionHref} {tagHref} />
  {/if}
  {#if section.goodFor.length}
    <div class="flex flex-col gap-1.5">
      <span class="text-xs text-muted-foreground">Good fit for</span>
      <ul class="flex flex-wrap gap-1.5" aria-label="Good fit for">
        {#each section.goodFor as tag (tag)}
          <li class="inline-flex h-8 items-center rounded-full border border-border px-3 text-[13px]">{tag}</li>
        {/each}
      </ul>
    </div>
  {/if}
  {#if section.packages.length}
    <ul class="flex flex-col" aria-label="What {first} offers">
      {#each section.packages as p (p.name)}
        <li class="flex items-start justify-between gap-3 border-t border-border py-3">
          <span class="flex min-w-0 flex-col gap-0.5">
            <span class="text-[15px] font-semibold">{p.name}</span>
            {#if p.description}<span class="text-[13px] text-muted-foreground">{p.description}</span>{/if}
          </span>
          <span class="shrink-0 text-right text-[14px] font-semibold tabular-nums">{priceText(p)}</span>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="text-[13px] text-muted-foreground">Ask {first} about prices.</p>
  {/if}
  {#if askHref}
    <a href={askHref}
      class="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 text-[15px] font-semibold text-primary-foreground no-underline hover:opacity-90">
      {section.askPays ? "Start coaching" : "Ask to be coached"}
    </a>
    <p class="text-xs text-muted-foreground">
      {section.askPays ? `You pay ${first} through Stripe and coaching starts straight away.` : `${first} reads what you send and replies.`}
    </p>
  {/if}
</section>
