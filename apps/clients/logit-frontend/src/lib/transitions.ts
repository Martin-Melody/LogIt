import { slide, type TransitionConfig, type SlideParams } from "svelte/transition";
import { cubicOut } from "svelte/easing";

/**
 * Shared motion helpers. Every transition here collapses to `duration: 0` when
 * the user has asked for reduced motion, so callers never have to special-case
 * it — the content still mounts/unmounts, it just doesn't move.
 *
 * See [[feedback_animate_transitions]]: anything that opens / closes / expands in
 * the app should use one of these rather than a bare `{#if}`.
 */

export function motionOK(): boolean {
  return (
    typeof window === "undefined" ||
    !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

const DEFAULT_MS = 160;

/**
 * Disclosure reveal — slide + fade. For "More options" panels, inline notes,
 * collapsible card bodies, and similar show/hide of a block of content.
 */
export function reveal(
  node: Element,
  params: SlideParams & { fade?: boolean } = {},
): TransitionConfig {
  if (!motionOK()) return { duration: 0 };
  const duration = params.duration ?? DEFAULT_MS;
  const easing = params.easing ?? cubicOut;
  const withFade = params.fade ?? true;
  const inner = slide(node, { duration, easing, axis: params.axis ?? "y" });
  return {
    duration,
    easing,
    css: (t, u) => {
      const base = inner.css ? inner.css(t, u) : "";
      return withFade ? `${base}; opacity: ${t}` : base;
    },
  };
}

/** Bottom-sheet / drawer slide-up. Fades in place when reduced motion is on. */
export function sheetUp(
  node: Element,
  params: { duration?: number } = {},
): TransitionConfig {
  const duration = params.duration ?? 220;
  if (!motionOK()) return { duration: Math.min(duration, 120), css: (t) => `opacity: ${t}` };
  return {
    duration,
    easing: cubicOut,
    css: (t) => `opacity: ${t}; transform: translateY(${(1 - t) * 100}%)`,
  };
}

/**
 * Quick fade + tiny rise — for list items appearing/leaving (set rows, superset
 * members) and small chips. Pair with `animate:flip` on the `{#each}` for
 * reflow.
 */
export function popIn(
  node: Element,
  params: { duration?: number; y?: number } = {},
): TransitionConfig {
  if (!motionOK()) return { duration: 0 };
  const duration = params.duration ?? 140;
  const y = params.y ?? 4;
  return {
    duration,
    easing: cubicOut,
    css: (t) => `opacity: ${t}; transform: translateY(${(1 - t) * y}px)`,
  };
}
