// Several people (or accounts) on one phone: signing out and into someone else on a different
// plan, and local profiles side by side. Does anything leak from one to the other?
// account-model.md §3 rows 2, 4, 5, 6 and 8.
import { describe, expect, it } from "vitest";
import { Device } from "./support/device";
import { createAccount, newUser, serverData } from "./support/servers";

describe("signing out and into a different account", () => {
  it("the second account sees none of the first account's data, and gets its own onboarding", async () => {
    const pro = await createAccount("cloud", newUser("pro"), "Pro");
    const studio = await createAccount("cloud", newUser("studio"), "Studio");
    const phone = await new Device().launch();
    await phone.signIn(pro);
    await phone.finishOnboarding({ name: "Pro Person", split: "Pro split" });
    await phone.logWorkout("Pro workout");

    await phone.signOut();
    await phone.signIn(studio);

    expect(phone.route).toBe("/onboarding");
    expect(phone.user?.tier).toBe("Studio");
    expect(await phone.splitNames()).toEqual([]);
    expect(await phone.workoutNames()).toEqual([]);
    expect(phone.profileName).not.toBe("Pro Person");
  });

  it("nothing from the first account is uploaded to the second", async () => {
    const pro = await createAccount("cloud", newUser("pro"), "Pro");
    const studio = await createAccount("cloud", newUser("studio"), "Studio");
    const phone = await new Device().launch();
    await phone.signIn(pro);
    await phone.finishOnboarding({ name: "Pro Person", split: "Pro split" });
    await phone.logWorkout("Pro workout");

    await phone.signOut();
    await phone.signIn(studio);
    await phone.finishOnboarding({ name: "Studio Person" });
    await phone.sync();

    const server = await serverData("cloud", studio);
    expect(server.splitNames).toEqual([]);
    expect(server.workoutNames).toEqual([]);
    expect(server.profile?.displayName).toBe("Studio Person");
  });

  it("switching back finds the first account's data where it was, on the same profile", async () => {
    const pro = await createAccount("cloud", newUser("pro"), "Pro");
    const free = await createAccount("cloud", newUser("free"), "Free");
    const phone = await new Device().launch();
    await phone.signIn(pro);
    await phone.finishOnboarding({ name: "Pro Person", split: "Pro split" });
    const proProfile = (await phone.activeProfile())!;

    await phone.signOut();
    await phone.signIn(free);
    await phone.finishOnboarding({ name: "Free Person" });
    await phone.signOut();
    await phone.signIn(pro);

    expect((await phone.activeProfile())!.id).toBe(proProfile.id);
    expect(phone.route).toBe("/");
    expect(phone.profileName).toBe("Pro Person");
    expect(await phone.splitNames()).toEqual(["Pro split"]);
    expect(await phone.profiles()).toHaveLength(2);
  });

  it("privacy settings belong to the account, not the phone", async () => {
    const a = await createAccount("cloud", newUser("priv"), "Pro");
    const b = await createAccount("cloud", newUser("open"), "Pro");
    const phone = await new Device().launch();
    await phone.signIn(a);
    await phone.finishOnboarding({ name: "A" });
    await phone.setPrivate(true);

    await phone.signOut();
    await phone.signIn(b);

    expect(await phone.isPrivate()).toBe(false);
  });

  // Layout settings (nav bar, home, profile cards, plugins, tours…) are stored per account:
  // lib/data/accountStorage.ts.
  it("layout settings belong to the account: the next account on the phone starts with its own", async () => {
    const a = await createAccount("cloud", newUser("layout"), "Pro");
    const b = await createAccount("cloud", newUser("fresh"), "Pro");
    const phone = await new Device().launch();
    await phone.signIn(a);
    await phone.finishOnboarding({ name: "A" });
    phone.setSwipe(false);
    await phone.sync();

    await phone.signOut();
    await phone.signIn(b);

    expect(phone.swipeOn).toBe(true);
  });

  it("an account's layout settings come back when it signs in on another phone", async () => {
    const a = await createAccount("cloud", newUser("roam"), "Pro");
    const first = await new Device("phone A").launch();
    await first.signIn(a);
    await first.finishOnboarding({ name: "A" });
    first.setSwipe(false);
    await first.sync();

    const second = await new Device("phone B").launch();
    await second.signIn(a);

    expect(second.swipeOn).toBe(false);
  });
});

describe("local profiles side by side", () => {
  it("a new profile starts empty, offline, at onboarding", async () => {
    const phone = await new Device().launch();
    await phone.finishOnboarding({ name: "Sam", split: "Full Body" });
    await phone.logWorkout("Day 1");

    await phone.addProfile();

    expect(phone.route).toBe("/onboarding");
    expect(phone.onboardingDone).toBe(false);
    expect(await phone.splitNames()).toEqual([]);
    expect(await phone.workoutNames()).toEqual([]);
    expect(await phone.profiles()).toHaveLength(2);
  });

  it("adding a profile while signed in doesn't sign the new profile in or upload to the account", async () => {
    const pro = await createAccount("cloud", newUser("host"), "Pro");
    const phone = await new Device().launch();
    await phone.signIn(pro);
    await phone.finishOnboarding({ name: "Sam" });

    await phone.addProfile();
    await phone.finishOnboarding({ name: "Guest", split: "Guest split" });
    await phone.logWorkout("Guest workout");

    expect(phone.signedIn).toBe(false);
    const server = await serverData("cloud", pro);
    expect(server.splitNames).toEqual([]);
    expect(server.workoutNames).toEqual([]);
  });

  it("switching between two offline profiles shows each one's own data", async () => {
    const phone = await new Device().launch();
    await phone.finishOnboarding({ name: "Sam", split: "Sam split" });
    const sam = (await phone.activeProfile())!;
    await phone.addProfile();
    await phone.finishOnboarding({ name: "Alex", split: "Alex split" });
    const alex = (await phone.activeProfile())!;

    await phone.switchProfile(sam.id);
    expect(phone.profileName).toBe("Sam");
    expect(await phone.splitNames()).toEqual(["Sam split"]);

    await phone.switchProfile(alex.id);
    expect(phone.profileName).toBe("Alex");
    expect(await phone.splitNames()).toEqual(["Alex split"]);
  });

  it("the phone reopens on the profile that was in use", async () => {
    const phone = await new Device().launch();
    await phone.finishOnboarding({ name: "Sam" });
    await phone.addProfile();
    await phone.finishOnboarding({ name: "Alex" });

    await phone.launch();

    expect(phone.profileName).toBe("Alex");
    expect(phone.route).toBe("/");
  });

  it("a password-protected profile can't be opened with the wrong password", async () => {
    const phone = await new Device().launch();
    await phone.finishOnboarding({ name: "Sam" });
    await phone.app.auth.authStore.createOfflineAccount("Locked", "secret-1");
    await phone.finishOnboarding({ name: "Locked" });
    const locked = (await phone.activeProfile())!;
    const sam = (await phone.profiles()).find((p) => p.id !== locked.id)!;
    await phone.switchProfile(sam.id);

    await expect(phone.switchProfile(locked.id, "wrong")).rejects.toThrow("Incorrect password.");
    expect(phone.profileName).toBe("Sam");
  });

  it("each offline profile keeps its own layout settings", async () => {
    const phone = await new Device().launch();
    await phone.finishOnboarding({ name: "Sam" });
    const sam = (await phone.activeProfile())!;
    phone.setSwipe(false);
    await phone.addProfile();
    await phone.finishOnboarding({ name: "Alex" });

    expect(phone.swipeOn).toBe(true);
    await phone.switchProfile(sam.id);
    expect(phone.swipeOn).toBe(false);
  });
});
