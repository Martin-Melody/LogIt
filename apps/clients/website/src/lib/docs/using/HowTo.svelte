<!-- The numbered steps of a walkthrough chapter, in the words the app shows, each with a
     screenshot of that step when the docs deploy took one (static/docs/shots, made by playing
     the walkthroughs: see .github/workflows/deploy-web.yml). -->
<script lang="ts">
  import { chapter, docsSteps } from "./guide";
  let { id }: { id: string } = $props();
  const c = $derived(chapter(id));
  const steps = $derived(docsSteps(c));

  const shots = new Set(
    Object.keys(import.meta.glob("/static/docs/shots/*.jpg")).map((p) => p.replace("/static", "")),
  );
  const shotOf = (stepId: string) => {
    const path = `/docs/shots/${c.id}--${stepId}.jpg`;
    return shots.has(path) ? path : null;
  };
</script>

<ol>
  {#each steps as s (s.id)}
    {@const shot = shotOf(s.id)}
    <li>
      <strong>{s.title}.</strong> {s.body}
      {#if shot}
        <img src={shot} alt="The dashboard at this step: {s.title}" loading="lazy" width="1440" height="900"
          class="mt-3 mb-2 w-full rounded-xl border border-border" />
      {/if}
    </li>
  {/each}
</ol>
