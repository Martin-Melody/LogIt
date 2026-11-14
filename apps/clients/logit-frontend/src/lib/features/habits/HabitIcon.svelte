<script lang="ts">
  import type { Component } from "svelte";
  import Activity from "@lucide/svelte/icons/activity";
  import Apple from "@lucide/svelte/icons/apple";
  import Bed from "@lucide/svelte/icons/bed";
  import Beef from "@lucide/svelte/icons/beef";
  import Bike from "@lucide/svelte/icons/bike";
  import BookOpen from "@lucide/svelte/icons/book-open";
  import Brain from "@lucide/svelte/icons/brain";
  import Carrot from "@lucide/svelte/icons/carrot";
  import Check from "@lucide/svelte/icons/check";
  import CigaretteOff from "@lucide/svelte/icons/cigarette-off";
  import Coffee from "@lucide/svelte/icons/coffee";
  import Droplet from "@lucide/svelte/icons/droplet";
  import Dumbbell from "@lucide/svelte/icons/dumbbell";
  import Egg from "@lucide/svelte/icons/egg";
  import Flame from "@lucide/svelte/icons/flame";
  import Footprints from "@lucide/svelte/icons/footprints";
  import GlassWater from "@lucide/svelte/icons/glass-water";
  import Heart from "@lucide/svelte/icons/heart";
  import Leaf from "@lucide/svelte/icons/leaf";
  import Moon from "@lucide/svelte/icons/moon";
  import Music from "@lucide/svelte/icons/music";
  import PenLine from "@lucide/svelte/icons/pen-line";
  import PersonStanding from "@lucide/svelte/icons/person-standing";
  import Pill from "@lucide/svelte/icons/pill";
  import Salad from "@lucide/svelte/icons/salad";
  import Scale from "@lucide/svelte/icons/scale";
  import Smile from "@lucide/svelte/icons/smile";
  import Sparkles from "@lucide/svelte/icons/sparkles";
  import Sun from "@lucide/svelte/icons/sun";
  import Timer from "@lucide/svelte/icons/timer";
  import WineOff from "@lucide/svelte/icons/wine-off";

  // A habit's icon is an emoji or a Lucide icon name (coach habits and imports use names).
  // Names used to be printed as text ("droplet Drink water"); now a known name draws the
  // icon and an unknown one draws nothing.
  const ICONS: Record<string, Component<{ class?: string; "aria-hidden"?: boolean | "true" }>> = {
    activity: Activity, apple: Apple, bed: Bed, beef: Beef, bike: Bike, "book-open": BookOpen, book: BookOpen,
    brain: Brain, carrot: Carrot, check: Check, "cigarette-off": CigaretteOff, coffee: Coffee, droplet: Droplet,
    droplets: Droplet, dumbbell: Dumbbell, egg: Egg, flame: Flame, footprints: Footprints, "glass-water": GlassWater,
    heart: Heart, leaf: Leaf, moon: Moon, music: Music, "pen-line": PenLine, "person-standing": PersonStanding,
    pill: Pill, salad: Salad, scale: Scale, smile: Smile, sparkles: Sparkles, sun: Sun, timer: Timer, "wine-off": WineOff,
  };

  const { icon, class: cls = "size-4" }: { icon?: string | null; class?: string } = $props();

  const value = $derived(icon?.trim() ?? "");
  // Lucide names are lower-case words joined by dashes; anything else is an emoji.
  const isName = $derived(/^[a-z][a-z0-9-]*$/i.test(value));
  const Icon = $derived(isName ? ICONS[value.toLowerCase()] : undefined);
</script>

{#if Icon}
  <Icon class="inline-block align-[-0.15em] {cls}" aria-hidden="true" />
{:else if value && !isName}
  <span aria-hidden="true">{value}</span>
{/if}
