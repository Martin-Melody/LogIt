import { redirect } from "@sveltejs/kit";

// Social settings became Settings › Privacy (friends overhaul, design canvas P1).
export function load() {
  redirect(308, "/settings/privacy");
}
