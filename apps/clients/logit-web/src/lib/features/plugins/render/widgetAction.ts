import { goto } from "$app/navigation";
import { toast } from "$lib/components/ui/sonner";
import type { WidgetAction } from "@logit/core/plugins/widgetView";

/**
 * What a widget's taps do on the dashboard. Logging stays on the phone, so only "open a page"
 * does anything here, and only for pages the dashboard has; everything else says where it
 * works. The builder's preview swaps in its own handler so a tap never leaves the editor.
 */

const WEB_PAGES = ["/sessions", "/progress", "/plan", "/library", "/nutrition", "/habits", "/social", "/plugins", "/my-coach", "/exercises"];

function describe(action: WidgetAction): string {
  if ("navigate" in action) return `Opens ${action.navigate} in the app.`;
  if ("startEmptyWorkout" in action || "startPlannedWorkout" in action) return "Starts a workout on your phone.";
  if ("resumeWorkout" in action) return "Goes back to the workout on your phone.";
  if ("toggleHabit" in action) return "Ticks the habit on your phone.";
  return "Moves to another day on your phone.";
}

function defaultHandler(action: WidgetAction): void {
  if ("navigate" in action) {
    const path = action.navigate.split(/[?#]/)[0]!;
    if (WEB_PAGES.some((p) => path === p || path.startsWith(p + "/"))) {
      void goto(action.navigate);
      return;
    }
  }
  toast(describe(action));
}

let handler: (action: WidgetAction) => void = defaultHandler;

export function runWidgetAction(action: WidgetAction): void {
  handler(action);
}

/** Preview mode: say what the tap would do instead of doing it. Returns the undo. */
export function previewWidgetActions(): () => void {
  handler = (action) => toast(`In the app: ${describe(action).replace(/\.$/, "")}.`);
  return () => {
    handler = defaultHandler;
  };
}

export function motionOK(): boolean {
  return typeof window === "undefined" || !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}
