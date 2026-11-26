<!-- A session row's ⋯ and right-click menu (canvas board 11): the same items in both. -->
<script lang="ts">
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { toast } from "$lib/components/ui/sonner";
  import { blockDisplayName, type StrengthBlockData, type WorkoutSession } from "@logit/core/domain/workout";
  import { sessionTitle } from "@logit/core/domain/sessionHistory";

  let { session, sessions, kind, onpost }: { session: WorkoutSession; sessions: WorkoutSession[]; kind: "context" | "dropdown"; onpost: (id: string) => void } = $props();
  const M = $derived(kind === "context" ? ContextMenu : DropdownMenu);

  const title = $derived(sessionTitle(session));
  // The last time you did the same workout, before this one.
  const previous = $derived(sessions.find((x) => x.startedAtMs < session.startedAtMs && sessionTitle(x) === title) ?? null);
  const exercises = $derived(
    [...new Map(session.blocks.filter((b) => b.type === "strength" && (b.data as StrengthBlockData).exerciseId)
      .map((b) => [(b.data as StrengthBlockData).exerciseId!, blockDisplayName(b)])).entries()],
  );

  function asText(): string {
    const day = new Date(session.startedAtMs).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    const lines = session.blocks.filter((b) => b.type === "strength").map((b) => {
      const sets = (b.data as StrengthBlockData).sets.filter((x) => x.setType !== "warmup" && (x.reps > 0 || x.completed));
      return `${blockDisplayName(b)}: ${sets.map((x) => (x.weight > 0 ? `${x.weight}×${x.reps}` : `${x.reps} reps`)).join(", ")}`;
    });
    return [`${title} · ${day}`, ...lines, ...(session.note?.trim() ? ["", session.note.trim()] : [])].join("\n");
  }
</script>

<M.Item class="min-h-8">
  {#snippet child({ props })}<a href="/sessions?id={session.id}" {...props}>Open</a>{/snippet}
</M.Item>
<M.Item class="min-h-8" onSelect={() => window.open(`/sessions?id=${session.id}`, "_blank")}>Open in a new tab</M.Item>
<M.Separator />
<M.Item class="min-h-8 gap-4 whitespace-nowrap" disabled={!previous}>
  {#snippet child({ props })}
    <a href={previous ? `/sessions?id=${previous.id}` : undefined} {...props}><span class="flex-1">Compare with the last {title}</span>{#if !previous}<span class="text-xs text-muted-foreground">First one</span>{/if}</a>
  {/snippet}
</M.Item>
{#if exercises.length}
  <M.Sub>
    <M.SubTrigger class="min-h-8">Exercise progress</M.SubTrigger>
    <M.SubContent class="min-w-48">
      {#each exercises as [id, name] (id)}
        <M.Item class="min-h-8">{#snippet child({ props })}<a href="/exercises/{id}" {...props}>{name}</a>{/snippet}</M.Item>
      {/each}
    </M.SubContent>
  </M.Sub>
{/if}
<M.Separator />
<M.Item class="min-h-8" onSelect={() => void navigator.clipboard.writeText(asText()).then(() => toast.success("Copied"), () => toast.error("Couldn't copy it"))}>Copy as text</M.Item>
<M.Item class="min-h-8" onSelect={() => onpost(session.id)}>Post it to my feed…</M.Item>
