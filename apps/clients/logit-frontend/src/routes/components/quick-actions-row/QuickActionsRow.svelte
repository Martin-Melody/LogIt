<script lang="ts">
  import { Button } from "$lib/components/ui/button";

  const onExercise = () => {};
  const onTimer = () => {};
  const onTemplate = () => {};
  const onScanQr = () => {};
</script>

<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
  <Button variant="outline" class="w-full justify-start" onclick={onExercise}>
    Exercise
  </Button>

  <Button variant="outline" class="w-full justify-start" onclick={onTimer}>
    Timer
  </Button>

  <Button variant="outline" class="w-full justify-start" onclick={onTemplate}>
    New template
  </Button>

  <Button variant="outline" class="w-full justify-start" onclick={onScanQr}>
    Scan QR
  </Button>
</div>
