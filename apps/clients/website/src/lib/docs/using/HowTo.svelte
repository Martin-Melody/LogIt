<!-- The numbered steps of a walkthrough chapter, in the words the app shows. -->
<script lang="ts">
  import { chapter, docsSteps } from "./guide";
  let { id }: { id: string } = $props();
  const steps = $derived(docsSteps(chapter(id)));
</script>

<ol>
  {#each steps as s (s.id)}
    <li><strong>{s.title}.</strong> {s.body}</li>
  {/each}
</ol>
