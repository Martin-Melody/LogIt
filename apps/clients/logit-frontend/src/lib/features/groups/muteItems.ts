import { VolumeX } from "lucide-svelte";

/** "For 1 hour / 1 day / 1 week" for muting someone in a group's chat. The person is kept in each
 * item: the sheet closes (and clears what was picked) before the choice runs. */
export function muteItems<T>(target: T | null, onMute: (target: T, minutes: number) => void) {
  if (!target) return [];
  return ([[60, "For 1 hour"], [1440, "For 1 day"], [10080, "For 1 week"]] as const).map(([minutes, label]) => ({
    icon: VolumeX,
    label,
    onSelect: () => onMute(target, minutes),
  }));
}
