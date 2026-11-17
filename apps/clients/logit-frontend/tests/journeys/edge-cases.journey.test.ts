// The cases that weren't on the list: coming back from a self-hosted server, a login that
// stopped working, two phones on one account.
import { describe, expect, it } from "vitest";
import { Device } from "./support/device";
import { createAccount, newUser, serverData } from "./support/servers";

describe("self-host → getlogit.app", () => {
  it("signing into getlogit.app after a self-hosted server talks only to getlogit.app", async () => {
    const phone = await new Device().launch();
    await phone.register(newUser("sh"), "self-host");
    await phone.finishOnboarding({ name: "Sam" });
    await phone.signOut();
    const pro = await createAccount("cloud", newUser("back"), "Pro");
    const before = phone.requests.length;

    await phone.signIn(pro);
    await phone.sync();
    await phone.launch();
    await phone.sync();

    const after = phone.requests.slice(before);
    expect(after.filter((r) => r.includes(" self-host "))).toEqual([]);
    expect(phone.signedIn).toBe(true);
  });
});

describe("a login that stopped working", () => {
  it("keeps the data on the phone and asks the user to sign in again", async () => {
    const pro = await createAccount("cloud", newUser("expired"), "Pro");
    const phone = await new Device().launch();
    await phone.signIn(pro);
    await phone.finishOnboarding({ name: "Sam", split: "Full Body" });
    const profile = (await phone.activeProfile())!;

    phone.breakStoredLogin();
    await phone.launch();
    await phone.refreshPlan();

    expect(phone.signedIn).toBe(false);
    expect(await phone.rowsOwnedBy(profile.id)).toBeGreaterThan(0);
    expect(await phone.splitNames()).toEqual(["Full Body"]);
  });

  it("signing in again picks up where it left off, with no duplicate profile", async () => {
    const pro = await createAccount("cloud", newUser("relogin"), "Pro");
    const phone = await new Device().launch();
    await phone.signIn(pro);
    await phone.finishOnboarding({ name: "Sam", split: "Full Body" });
    phone.breakStoredLogin();
    await phone.launch();
    await phone.refreshPlan();

    await phone.signIn(pro);

    expect(await phone.profiles()).toHaveLength(1);
    expect(await phone.splitNames()).toEqual(["Full Body"]);
    expect(phone.route).toBe("/");
  });
});

describe("two phones, one account", () => {
  it("what's logged on one phone shows up on the other", async () => {
    const pro = await createAccount("cloud", newUser("twophones"), "Pro");
    const a = await new Device("phone A").launch();
    await a.signIn(pro);
    await a.finishOnboarding({ name: "Sam" });
    const b = await new Device("phone B").launch();
    await b.signIn(pro);

    await a.launch();
    await a.saveSplit("From A");
    await a.logWorkout("Workout on A");
    await b.launch();
    await b.sync();

    expect(await b.splitNames()).toEqual(["From A"]);
    expect(await b.workoutNames()).toEqual(["Workout on A"]);
  });

  it("onboarding finished on one phone counts on the other", async () => {
    const pro = await createAccount("cloud", newUser("onb"), "Pro");
    const a = await new Device("phone A").launch();
    await a.signIn(pro);
    await a.finishOnboarding({ name: "Sam" });

    const b = await new Device("phone B").launch();
    await b.signIn(pro);

    expect(b.route).toBe("/");
    expect(b.profileName).toBe("Sam");
    expect((await serverData("cloud", pro)).me.onboardingCompleted).toBe(true);
  });
});
