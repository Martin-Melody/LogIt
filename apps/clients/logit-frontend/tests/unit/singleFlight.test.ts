// syncAll() is singleFlight(syncOnce): one sync at a time, and a trigger that arrives during
// a sync gets exactly one follow-up pass.
import { describe, expect, it } from "vitest";
import { singleFlight } from "$lib/sync/singleFlight";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe("singleFlight", () => {
  it("never runs two at once; calls during a run add one more pass", async () => {
    let active = 0;
    let maxActive = 0;
    let runs = 0;
    const gates = [deferred(), deferred()];
    const run = singleFlight(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      const gate = gates[runs++]!;
      await gate.promise;
      active--;
      return runs;
    });

    const first = run();
    const second = run();
    const third = run();
    expect(second).toBe(first);
    expect(third).toBe(first);

    gates[0]!.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    gates[1]!.resolve();

    expect(await first).toBe(2); // the follow-up pass's result
    expect(runs).toBe(2); // three calls during one run -> one extra pass, not two
    expect(maxActive).toBe(1);
  });

  it("starts fresh after a run finishes, and after a run fails", async () => {
    let calls = 0;
    const run = singleFlight(async () => {
      calls++;
      if (calls === 1) throw new Error("offline");
      return calls;
    });
    await expect(run()).rejects.toThrow("offline");
    expect(await run()).toBe(2);
    expect(await run()).toBe(3);
  });
});
