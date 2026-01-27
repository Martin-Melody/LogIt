<script>
  import { getRandomTagline } from "$lib/domain/tagLine";
</script>

<section class="mb-4">
  <h1 class="text-3xl font-semibold tracking-tight">Welcome back</h1>

  <p class="mt-1 text-base italic text-muted-foreground">
    {getRandomTagline().toString()}
  </p>
</section>
