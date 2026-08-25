<script lang="ts">
  import { goto } from "$app/navigation";
  import RecentSessionsCard from "./RecentSessionsCard.svelte";

  import { recentSessions } from "$lib/stores/recentSessions.store";
  import { currentSession } from "$lib/stores/currentSession.store";

  import { durationMs, formatDuration } from "@logit/core/domain/time";
  import { getTopSetHighlight, type SessionSummary } from "@logit/core/domain/workout";

  function dateLabelFromMs(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
  }

  function toSummary(session: any): SessionSummary {
    const ended = session.endedAtMs ?? session.startedAtMs;
    const dur = session.endedAtMs
      ? durationMs(session.startedAtMs, session.endedAtMs)
      : 0;
    const top = getTopSetHighlight(session);

    return {
      id: session.id,
      dateLabel: dateLabelFromMs(ended),
      durationLabel: session.endedAtMs ? formatDuration(dur) : "In progress",
      topSetLabel: top
        ? `${top.exerciseName} — ${top.reps}×${top.weight}kg`
        : "—",
    };
  }

  $: summaries = $recentSessions.map(toSummary);

  function onOpen(id: string) {
    void goto(`/sessions/${id}`);
  }

  async function onRepeat() {
    await currentSession.start();
    await goto("/session/current");
  }

  function onViewAll() {
    void goto("/sessions");
  }
</script>

<RecentSessionsCard sessions={summaries} {onOpen} {onRepeat} {onViewAll} />
