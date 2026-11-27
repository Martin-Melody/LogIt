import { redirect } from "@sveltejs/kit";

// Coaching › Library moved into Programs › Exercises (canvas PG9); old links still work.
export function load() {
  redirect(308, "/coaching/programs?tab=exercises");
}
