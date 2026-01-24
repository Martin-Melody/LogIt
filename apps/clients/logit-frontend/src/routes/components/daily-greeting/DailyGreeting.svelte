<script lang="ts">
  const SPLASHES = [
    "One more rep.",
    "Form > ego.",
    "Tiny gains add up.",
    "Log it. Trust it.",
    "Leave one in the tank.",
    "Strong is built slowly.",
    "Control the negative.",
    "You showed up.",
  ];

  const splashText = SPLASHES[Math.floor(Math.random() * SPLASHES.length)];
</script>

<section class="mb-4">
  <h1 class="text-3xl font-semibold tracking-tight">Welcome back</h1>

  <p class="mt-1 text-base italic text-muted-foreground">
    {splashText}
  </p>
</section>
