// Signing in on a phone that doesn't have the account's training yet: Home and Nutrition say
// it's on its way (src/lib/sync/firstDownload.ts) until the first download lands, and say the
// server couldn't be reached if it can't, instead of showing empty states.
import { get } from "svelte/store";
import { describe, expect, it } from "vitest";
import { Device } from "./support/device";
import { createAccount, newUser } from "./support/servers";

function downloadState(phone: Device) {
  const sync = phone.app.sync;
  return {
    downloadedAt: get(sync.firstDownloadAt),
    failed: get(sync.lastSyncFailed),
    running: get(sync.syncRunning),
  };
}

describe("the first download after signing in", () => {
  it("is marked done once the training has arrived on a new phone", async () => {
    const pro = await createAccount("cloud", newUser("firstdl"), "Pro");
    const a = await new Device("phone A").launch();
    await a.signIn(pro);
    await a.finishOnboarding({ name: "Sam" });
    await a.logWorkout("Leg day");

    const b = await new Device("phone B").launch();
    expect(downloadState(b).downloadedAt).toBe(0);
    await b.signIn(pro);
    await b.sync();

    expect(await b.workoutNames()).toEqual(["Leg day"]);
    expect(downloadState(b)).toMatchObject({ failed: false, running: false });
    expect(downloadState(b).downloadedAt).toBeGreaterThan(0);
  });

  it("says it failed when the server can't be reached, and recovers on the next sync", async () => {
    const pro = await createAccount("cloud", newUser("firstdlfail"), "Pro");
    const phone = await new Device().launch();
    phone.failRequests = /^GET cloud \/sync\/sessions/;
    await phone.signIn(pro);
    await phone.sync();

    expect(downloadState(phone)).toMatchObject({ downloadedAt: 0, failed: true, running: false });

    phone.failRequests = null;
    await phone.sync();
    expect(downloadState(phone).failed).toBe(false);
    expect(downloadState(phone).downloadedAt).toBeGreaterThan(0);
  });

  it("isn't held up by an unrelated part of the sync failing", async () => {
    const pro = await createAccount("cloud", newUser("firstdlcoach"), "Pro");
    const phone = await new Device().launch();
    phone.failRequests = /^GET cloud \/coach\/library/;
    await phone.signIn(pro);
    await phone.sync();

    expect(get(phone.app.sync.lastSyncedAt)).toBe(0); // the sync as a whole didn't finish
    expect(downloadState(phone).failed).toBe(false);
    expect(downloadState(phone).downloadedAt).toBeGreaterThan(0);
  });

  it("counts as done straight away when the phone already has training on it", async () => {
    const phone = await new Device().launch();
    await phone.finishOnboarding({ name: "Sam" });
    await phone.logWorkout("Offline workout");
    const pro = await createAccount("cloud", newUser("firstdllocal"), "Pro");
    phone.failRequests = /^GET cloud \/sync\/sessions/;

    await phone.signIn(pro);
    await phone.sync();

    expect(downloadState(phone).downloadedAt).toBeGreaterThan(0);
  });
});
