<!-- A coach below Studio who still has real clients (their plan ended, or they moved to Pro):
     coaching needs Studio again, and their clients stay connected with what they were given
     (decided 2026-11-11: relationships stay, read-only). Shown instead of a coaching page. -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
</script>

<section class="flex max-w-xl flex-col gap-3 rounded-[14px] border border-border bg-card p-6" aria-labelledby="studio-ended">
  <h1 id="studio-ended" class="text-xl font-bold">Coaching needs Studio</h1>
  <p class="text-sm leading-relaxed text-muted-foreground">
    Your account isn't on Studio any more, so your coaching pages are closed. Your clients stay
    connected and keep the programs, meal plans and check-in forms you gave them; nothing is
    deleted. Come back to Studio and everything is here as you left it.
  </p>
  <div class="flex flex-wrap gap-2">
    <Button href="/upgrade">Back to Studio</Button>
    <Button variant="outline" href="/">Go to your own training</Button>
  </div>
</section>
