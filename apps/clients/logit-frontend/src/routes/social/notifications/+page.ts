import { redirect } from "@sveltejs/kit";

// Social notifications live in the shared inbox now (the bell in the header).
export function load() {
  redirect(307, "/inbox?filter=social");
}
