import { goto } from "$app/navigation";

export function back(fallback: string) {
  if (history.length > 1) history.back();
  else void goto(fallback);
}
