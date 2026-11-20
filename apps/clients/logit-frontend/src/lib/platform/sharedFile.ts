// A CSV shared to LogIt or opened with it (Android, SharedFilePlugin.java).
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { isNativePlatform } from "./isNative";

export type SharedFile = { name: string; text?: string; error?: string };

const SharedFilePlugin = registerPlugin<{
  takePending(): Promise<{ file?: SharedFile }>;
  addListener(event: "fileShared", fn: () => void): Promise<PluginListenerHandle>;
}>("SharedFile");

/** The shared file waiting to be imported, once; null when there's none (and on the web). */
export async function takeSharedFile(): Promise<SharedFile | null> {
  if (!isNativePlatform()) return null;
  return (await SharedFilePlugin.takePending().catch(() => ({ file: undefined }))).file ?? null;
}

/** Runs when a file is shared to LogIt, including one that opened it. */
export function onFileShared(fn: () => void): void {
  if (isNativePlatform()) void SharedFilePlugin.addListener("fileShared", fn).catch(() => {});
}
