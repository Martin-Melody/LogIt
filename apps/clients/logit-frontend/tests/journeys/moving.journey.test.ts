// Moving an account to another server (accounts plan step 8, design canvas 9 and 10): the
// training comes along, the phone only switches once it has all landed, and a move that stops
// halfway leaves everything as it was.
import { describe, expect, it } from "vitest";
import { Device } from "./support/device";
import { accountExists, createAccount, newUser, serverData, setTier } from "./support/servers";

async function proOnGetlogit() {
  const phone = await new Device().launch();
  const user = newUser("mover");
  await phone.register(user);
  await phone.finishOnboarding({ name: "Sam", split: "Push Pull Legs" });
  await setTier("cloud", phone.user!.id, "Pro");
  await phone.refreshPlan();
  await phone.logWorkout("Push day");
  return { phone, user };
}

describe("moving to another server", () => {
  it("getlogit.app → own server with a new account there: the training comes along and the phone syncs there from now on", async () => {
    const { phone, user } = await proOnGetlogit();
    const there = newUser("mine");

    const result = await phone.moveServer("self-host", there);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.from).toMatchObject({ server: "getlogit.app", tier: "Pro", selfHosted: false });
    expect(result.counts).toEqual({ workouts: 1, splits: 1 });
    const moved = await serverData("self-host", there);
    expect(moved.splitNames).toEqual(["Push Pull Legs"]);
    expect(moved.workoutNames).toEqual(["Push day"]);

    // The phone is on the new server, across a restart, and new training goes there.
    await phone.launch();
    expect(phone.signedIn).toBe(true);
    expect(phone.user?.username).toBe(there.username);
    expect(phone.app.client.apiClient.isSelfHosted()).toBe(true);
    expect(phone.onboardingDone).toBe(true);
    expect(phone.profileName).toBe("Sam");
    await phone.logWorkout("Pull day");
    expect((await serverData("self-host", there)).workoutNames).toEqual(["Pull day", "Push day"]);
    expect((await serverData("cloud", user)).workoutNames).toEqual(["Push day"]);

    // The old account is kept until the person deletes it.
    expect(await accountExists("cloud", user)).toBe(true);
  });

  it("own server → getlogit.app into an account that already has training: both end up on the phone and the server", async () => {
    const phone = await new Device().launch();
    const mine = newUser("selfhoster");
    await phone.register(mine, "self-host");
    await phone.finishOnboarding({ name: "Sam", split: "Home gym split" });

    const existing = await createAccount("cloud", newUser("hosted"), "Pro");
    const other = await new Device("other phone").launch();
    await other.signIn(existing);
    await other.finishOnboarding({ name: "Sam", split: "Hotel gym split" });
    await phone.launch(); // back to the first phone

    const result = await phone.moveServer("cloud", existing, "existing");

    expect(result.ok).toBe(true);
    expect((await phone.splitNames()).sort()).toEqual(["Home gym split", "Hotel gym split"]);
    expect((await serverData("cloud", existing)).splitNames?.sort()).toEqual(["Home gym split", "Hotel gym split"]);
    expect(phone.app.client.apiClient.isSelfHosted()).toBe(false);
  });

  it("a server that can't be reached changes nothing", async () => {
    const { phone, user } = await proOnGetlogit();

    const result = await phone.moveServer("nowhere", newUser("nowhere"));

    expect(result.ok).toBe(false);
    expect(phone.user?.username).toBe(user.username);
    await phone.logWorkout("Leg day");
    expect((await serverData("cloud", user)).workoutNames).toEqual(["Leg day", "Push day"]);
  });

  it("a move that stops halfway leaves the phone on the old server, and trying again finishes it", async () => {
    const { phone, user } = await proOnGetlogit();
    const there = newUser("halfway");
    phone.failRequests = /^GET self-host \/sync\/splits/;

    const failed = await phone.moveServer("self-host", there);

    expect(failed.ok).toBe(false);
    await phone.launch();
    expect(phone.user?.username).toBe(user.username);
    expect(phone.app.client.apiClient.isSelfHosted()).toBe(false);
    await phone.logWorkout("Leg day");
    expect((await serverData("cloud", user)).workoutNames).toEqual(["Leg day", "Push day"]);

    phone.failRequests = null;
    const retried = await phone.moveServer("self-host", there, "existing");
    expect(retried.ok).toBe(true);
    expect((await serverData("self-host", there)).workoutNames).toEqual(["Leg day", "Push day"]);
  });

  it("the done screen can delete the account left behind", async () => {
    const { phone, user } = await proOnGetlogit();
    const result = await phone.moveServer("self-host", newUser("fresh"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { deleteOldAccount } = await import("$lib/accounts/moveServer");
    expect(await deleteOldAccount(result.from, "wrong-password")).toEqual({ ok: false, error: "That password isn't right." });
    expect(await deleteOldAccount(result.from, user.password)).toEqual({ ok: true });
    expect(await accountExists("cloud", user)).toBe(false);
    expect(phone.signedIn).toBe(true);
  });
});
