<script lang="ts">
  import { Button } from "$lib/components/ui/button";

  export let canFinish = false;
  export let saving = false;
  export let onFinish: () => void | Promise<void> = () => {};
</script>

<div class="py-3 flex items-center justify-center gap-3">
  <Button
    class="w-full"
    onclick={() => void onFinish()}
    disabled={!canFinish || saving}
  >
    Finish workout
  </Button>
</div>
