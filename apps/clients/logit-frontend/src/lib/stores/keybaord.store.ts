import { writable } from "svelte/store";

export type KeyboardState = {
  visible: boolean;
  height: number;
};

const initial: KeyboardState = { visible: false, height: 0 };

export const keyboard = writable<KeyboardState>(initial);
