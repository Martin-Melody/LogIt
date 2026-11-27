<!-- Draws the walkthrough step that's showing: a spotlight around its target (a data-guide mark)
     and a pop-up beside it. The page stays usable underneath, so "do" steps can be done for
     real; the step moves on when the page sends the step's guideSignal. -->
<script lang="ts">
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { page } from "$app/state";
  import { routeMatches } from "@logit/core/guide/progress";
  import { Button } from "$lib/components/ui/button";
  import { guide } from "./guide.svelte";
  import { docsUrl } from "./docs";

  const step = $derived(guide.paused ? null : guide.step);
  const chapter = $derived(guide.chapter);
  const kind = $derived(guide.stepKind);
  const onPage = $derived(step ? routeMatches(step.route, page.url.pathname, page.url.search) : false);

  let rect = $state<DOMRect | null>(null);
  // A dialog the person opened that the step's target isn't in (e.g. "New link" during
  // "make your first link"): don't dim or cover it, sit beside it.
  let openDialog = $state<DOMRect | null>(null);
  let guideEl = $state<HTMLElement | null>(null);
  let empty = $state(false);
  let missing = $state(false);
  let popW = $state(360);
  let popH = $state(200);
  let vw = $state(1280);
  let vh = $state(800);
  let scrolledFor = "";

  // Follow the target as the page lays out, scrolls or resizes. A frame loop is the simplest
  // thing that keeps up with every case (lazy content, dialogs, sidebar animations).
  $effect(() => {
    const s = step;
    if (!s || !onPage) {
      rect = null;
      return;
    }
    let frame = 0;
    const startedAt = performance.now();
    const tick = () => {
      vw = window.innerWidth;
      vh = window.innerHeight;
      const el = s.target ? document.querySelector<HTMLElement>(`[data-guide='${s.target}']`) : null;
      if (el) {
        const key = `${guide.active?.chapterId}/${s.id}`;
        if (scrolledFor !== key) {
          scrolledFor = key;
          // Only scroll when it's out of view, and then smoothly to near the top, not the middle.
          const r0 = el.getBoundingClientRect();
          if (r0.top < 72 || r0.bottom > window.innerHeight - 16) {
            el.style.scrollMarginTop = "96px";
            el.scrollIntoView({ block: "start", behavior: "smooth" });
          }
        }
        rect = el.getBoundingClientRect();
        empty = el.hasAttribute("data-guide-empty");
        missing = false;
      } else {
        rect = null;
        empty = false;
        missing = !!s.target && !s.arrives && performance.now() - startedAt > 4000;
      }
      const dlg = [...document.querySelectorAll<HTMLElement>("[role='dialog'][data-state='open'], [role='alertdialog'][data-state='open']")]
        .find((d) => d !== guideEl && !(el && d.contains(el)));
      openDialog = dlg ? dlg.getBoundingClientRect() : null;
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  });

  const PAD = 8;
  const GAP = 16;
  const phone = $derived(vw < 640);

  // Beside the target if there's room (right, then below, left, above), else centred.
  const pos = $derived.by(() => {
    if (phone) return null;
    const r = openDialog ?? rect;
    if (!r) return null;
    const fits = (x: number, y: number) => x >= 8 && y >= 8 && x + popW <= vw - 8 && y + popH <= vh - 8;
    const clampY = (y: number) => Math.min(Math.max(8, y), vh - popH - 8);
    const clampX = (x: number) => Math.min(Math.max(8, x), vw - popW - 8);
    const tries = [
      { x: r.right + PAD + GAP, y: clampY(r.top - PAD) },
      { x: clampX(r.left - PAD), y: r.bottom + PAD + GAP },
      { x: r.left - PAD - GAP - popW, y: clampY(r.top - PAD) },
      { x: clampX(r.left - PAD), y: r.top - PAD - GAP - popH },
    ];
    const found = tries.find((t) => fits(t.x, t.y));
    // No room beside an open dialog: the bottom-left corner, clear of it as far as possible.
    return found ?? (openDialog ? { x: 16, y: vh - popH - 16 } : null);
  });

  // A target that turns up later (a sample client's request): wait for it, don't call it missing.
  const waiting = $derived(!!step?.arrives && !rect && onPage && kind === "do");

  const body = $derived(step ? (empty && step.empty ? step.empty : step.body) : "");
  const total = $derived(chapter?.steps.length ?? 0);
  const index = $derived(guide.active?.index ?? 0);

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape" && step) guide.pause();
  }
</script>

<svelte:window onkeydown={onKey} />

{#if step && chapter}
  {#if openDialog}
    <!-- The person's own dialog is in front; no dimming over it. -->
  {:else if rect}
    <div aria-hidden="true" class="pointer-events-none fixed z-[60] rounded-xl ring-2 ring-primary transition-[top,left,width,height] duration-150"
      style="top:{rect.top - PAD}px;left:{rect.left - PAD}px;width:{rect.width + PAD * 2}px;height:{rect.height + PAD * 2}px;box-shadow:0 0 0 9999px rgb(4 6 9 / 0.55)"></div>
  {:else}
    <div aria-hidden="true" class="pointer-events-none fixed inset-0 z-[60] bg-black/40"></div>
  {/if}

  <div
    role="dialog" aria-modal="false" aria-labelledby="guide-step-title"
    bind:this={guideEl} bind:offsetWidth={popW} bind:offsetHeight={popH}
    class="fixed z-[61] w-[min(360px,calc(100vw-16px))] transition-[left,top] duration-200 ease-out motion-reduce:transition-none rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-2xl
      {phone ? 'inset-x-2 bottom-2 w-auto' : ''}"
    style={phone ? "" : pos ? `left:${pos.x}px;top:${pos.y}px` : "left:50%;top:50%;transform:translate(-50%,-50%)"}
  >
    <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{chapter.title} · {index + 1} of {total}</p>
    <h3 id="guide-step-title" class="mt-1.5 text-base font-bold">{step.title}</h3>
    <p class="mt-1.5 text-sm leading-relaxed text-foreground/85">{body}</p>

    {#if !onPage}
      <p class="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Open the page this step is about to carry on.</p>
    {:else if waiting}
      <div class="mt-3 flex items-center gap-2.5 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground" role="status">
        <Spinner class="size-3.5 shrink-0" aria-hidden="true" />
        {step.arrives}
      </div>
    {:else if missing}
      <p class="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">This part of the page isn't showing right now. You can carry on with Next.</p>
    {/if}

    {#if kind === "do" && !empty && !missing && !waiting}
      <div class="mt-3 flex items-center gap-2.5 rounded-lg bg-warning/10 px-3 py-2 text-xs font-medium text-warning" role="status">
        <span class="size-2 shrink-0 animate-pulse rounded-full bg-warning"></span>
        Your turn: the guide moves on when you've done it
      </div>
    {/if}

    <div class="mt-4 flex flex-wrap items-center gap-2">
      {#if index > 0}<Button size="sm" variant="outline" onclick={() => guide.back()}>Back</Button>{/if}
      {#if (kind === "look" && !waiting) || empty || missing}
        <Button size="sm" onclick={() => guide.next()}>{index + 1 === total ? "Finish chapter" : "Next"}</Button>
      {:else}
        <Button size="sm" variant="outline" onclick={() => guide.next()}>Skip this step</Button>
      {/if}
      <a href={docsUrl(chapter.feature)} target="_blank" rel="noopener"
        class="ml-auto text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">In the docs</a>
    </div>
  </div>
{/if}

{#if guide.active && chapter}
  <div class="fixed bottom-4 right-4 z-[62] flex items-center gap-2 rounded-full border border-border bg-popover py-1.5 pl-4 pr-1.5 text-xs shadow-lg {step && phone ? 'hidden' : ''}">
    <span>{chapter.title} <span class="text-muted-foreground">· step {index + 1} of {total}</span></span>
    {#if guide.paused}
      <Button size="sm" class="h-7 rounded-full" onclick={() => guide.resume()}>Carry on</Button>
      <Button size="sm" variant="ghost" class="h-7 rounded-full" onclick={() => guide.stop()}>Close</Button>
    {:else}
      <Button size="sm" variant="outline" class="h-7 rounded-full" onclick={() => guide.pause()}>Pause guide</Button>
    {/if}
  </div>
{/if}
