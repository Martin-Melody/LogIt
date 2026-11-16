<script lang="ts">
  import type { Plan } from "@logit/core/guide/types";
  let { plan }: { plan: Plan } = $props();
  const tone: Record<Plan, string> = {
    Free: "bg-card text-foreground border border-border",
    Pro: "bg-primary text-primary-foreground",
    Studio: "bg-warning text-background",
  };
</script>

<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold {tone[plan]}">{plan === "Free" ? "Every plan" : plan}</span>
