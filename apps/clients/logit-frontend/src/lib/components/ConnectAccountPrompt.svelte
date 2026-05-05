<script lang="ts">
  import { goto } from "$app/navigation";
  import { X } from "lucide-svelte";

  interface Props {
    open: boolean;
    feature?: string;
    onclose: () => void;
  }

  let { open, feature = "This feature", onclose }: Props = $props();

  function login() {
    onclose();
    void goto(`/auth?mode=login&redirect=${encodeURIComponent(window.location.pathname)}`);
  }

  function register() {
    onclose();
    void goto(`/auth?mode=register&redirect=${encodeURIComponent(window.location.pathname)}`);
  }
</script>

{#if open}
  <!-- Backdrop -->
  <button
    type="button"
    class="fixed inset-0 z-40 bg-black/40"
    aria-label="Close"
    onclick={onclose}
  ></button>

  <!-- Sheet -->
  <div class="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border rounded-t-2xl px-6 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
    <div class="flex items-start justify-between mb-4">
      <div>
        <h2 class="text-base font-semibold">Account required</h2>
        <p class="text-sm text-muted-foreground mt-1">
          {feature} requires a Logit account. It's free to sign up.
        </p>
      </div>
      <button type="button" class="text-muted-foreground hover:text-foreground -mt-0.5 ml-4" onclick={onclose}>
        <X class="h-4 w-4" />
      </button>
    </div>

    <div class="flex flex-col gap-2">
      <button type="button"
        class="w-full py-3 rounded bg-primary text-primary-foreground text-sm font-medium"
        onclick={register}>
        Create a free account
      </button>
      <button type="button"
        class="w-full py-2.5 rounded border border-border text-sm"
        onclick={login}>
        Log in
      </button>
      <button type="button"
        class="w-full py-2 text-sm text-muted-foreground"
        onclick={onclose}>
        Not now
      </button>
    </div>
  </div>
{/if}
