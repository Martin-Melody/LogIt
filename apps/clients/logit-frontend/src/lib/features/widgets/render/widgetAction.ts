import { goto } from "$app/navigation";
import type { WidgetAction } from "@logit/core/plugins/widgetView";

/** Host allow-list for widget actions. Community widgets can only do these. */
export function runWidgetAction(action: WidgetAction): void {
  if ("navigate" in action) {
    // Only same-app paths.
    if (action.navigate.startsWith("/")) void goto(action.navigate);
    return;
  }
  if ("startEmptyWorkout" in action) {
    void goto("/session/new");
    return;
  }
  if ("resumeWorkout" in action) {
    void goto("/session/current");
    return;
  }
}
