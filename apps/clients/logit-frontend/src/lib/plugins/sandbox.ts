import { browser } from "$app/environment";
import {
  PluginSandboxError,
  preloadSandbox as preloadCoreSandbox,
  runInSandbox as runInCoreSandbox,
  type SandboxRunOptions,
} from "@logit/core/plugins/sandbox";
import type { SandboxOp } from "@logit/core/plugins/sandboxProtocol";

/** The interpreter sandbox lives in core (the dashboard uses it too); this keeps it off the server render. */
export { PluginSandboxError, type SandboxRunOptions };

export function preloadSandbox(): void {
  if (browser) preloadCoreSandbox();
}

export async function runInSandbox(
  source: string,
  entryExport: string,
  op: SandboxOp,
  options: SandboxRunOptions = {},
): Promise<unknown> {
  if (!browser) throw new PluginSandboxError("sandbox is browser-only");
  return runInCoreSandbox(source, entryExport, op, options);
}
