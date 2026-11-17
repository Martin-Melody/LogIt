// Leaving getlogit.app: going back to offline, moving to a self-hosted server, deleting the
// account. account-model.md §3 rows 8 and 10.
import { describe, expect, it } from "vitest";
import { Device } from "./support/device";
import { accountExists, newUser, serverData, setTier, type Tier } from "./support/servers";

async function onPlan(tier: Tier) {
  const phone = await new Device().launch();
  const user = newUser(tier.toLowerCase());
  await phone.register(user);
  await phone.finishOnboarding({ name: "Sam", split: "Push Pull Legs" });
  await setTier("cloud", phone.user!.id, tier);
  await phone.refreshPlan();
  await phone.sync();
  await phone.logWorkout("Push day");
  return { phone, user };
}

for (const tier of ["Pro", "Studio"] as Tier[]) {
  describe(`${tier} → offline`, () => {
    it("\"Keep using it here\" signs out and keeps the training on the phone, with no account", async () => {
      const { phone } = await onPlan(tier);
      const profile = (await phone.activeProfile())!;

      await phone.signOut({ keepHere: true });

      expect(phone.route).toBe("/");
      expect(phone.signedIn).toBe(false);
      expect((await phone.activeProfile())?.id).toBe(profile.id);
      expect((await phone.activeProfile())?.serverUserId).toBeNull();
      expect(phone.profileName).toBe("Sam");
      expect(await phone.splitNames()).toEqual(["Push Pull Legs"]);
      expect(await phone.workoutNames()).toEqual(["Push day"]);
    });

    it("working offline after that doesn't talk to the server", async () => {
      const { phone } = await onPlan(tier);
      await phone.signOut({ keepHere: true });
      const before = phone.requests.length;

      await phone.logWorkout("Legs");
      await phone.launch();

      expect(phone.requests.slice(before)).toEqual([]);
      expect(await phone.workoutNames()).toEqual(["Legs", "Push day"]);
    });

    it("plain \"Sign out\" takes the training off the phone; signing in again brings it back", async () => {
      const { phone, user } = await onPlan(tier);
      const profile = (await phone.activeProfile())!;

      await phone.signOut();

      expect(await phone.rowsOwnedBy(profile.id)).toBe(0);
      expect((await phone.profiles()).map((p) => p.id)).not.toContain(profile.id);
      expect(phone.signedIn).toBe(false);
      expect(phone.route).toBe("/onboarding"); // the welcome screen: nobody left on the phone

      await phone.signIn(user);
      expect(await phone.splitNames()).toEqual(["Push Pull Legs"]);
      expect(await phone.workoutNames()).toEqual(["Push day"]);
    });

    it("the account and its synced data are still on getlogit.app after signing out", async () => {
      const { phone, user } = await onPlan(tier);

      await phone.signOut();

      const server = await serverData("cloud", user);
      expect(server.splitNames).toEqual(["Push Pull Legs"]);
      expect(server.workoutNames).toEqual(["Push day"]);
    });
  });

  describe(`${tier} → self-host`, () => {
    it("signing out and into a self-hosted server leaves the getlogit.app account and its data as they were", async () => {
      const { phone, user } = await onPlan(tier);
      await phone.signOut();

      await phone.register(newUser("moved"), "self-host");

      expect(phone.signedIn).toBe(true);
      expect((await serverData("cloud", user)).workoutNames).toEqual(["Push day"]);
    });

    // Decided: moving server brings the data along (accounts plan, phase 1 step 8).
    it.todo("moving to a self-hosted server brings the user's workouts and splits with them");
  });
}

describe("the sign-out screen's choices", () => {
  it("offers a plain sign out when everything is backed up: Pro, and Free on its backup phone", async () => {
    const { phone } = await onPlan("Pro");
    const { everythingBackedUp } = await import("$lib/sync/syncService");
    expect(everythingBackedUp()).toBe(true);
    void phone;

    const free = await new Device().launch();
    await free.register(newUser("freeone"));
    await free.finishOnboarding({ name: "Free" });
    await free.sync();
    const freeSync = await import("$lib/sync/syncService");
    expect(freeSync.everythingBackedUp()).toBe(true);
  });

  it("doesn't offer \"keep using it here\" when the phone already has training without an account", async () => {
    const phone = await new Device().launch();
    await phone.finishOnboarding({ name: "Offline me" });
    await phone.addAccount(newUser("second"), "cloud", "register");
    await phone.finishOnboarding({ name: "Second" });

    expect(await phone.app.auth.authStore.canKeepHere()).toBe(false);
    await expect(phone.signOut({ keepHere: true })).rejects.toThrow();
    expect(await phone.profiles()).toHaveLength(2);
  });
});

describe("deleting the account", () => {
  it("deleting a getlogit.app account removes it from the server and its data from the phone", async () => {
    const { phone, user } = await onPlan("Pro");
    const profile = (await phone.activeProfile())!;

    await phone.deleteAccount(user.password);

    expect(await accountExists("cloud", user)).toBe(false);
    expect(await phone.rowsOwnedBy(profile.id)).toBe(0);
    expect((await phone.profiles()).map((p) => p.id)).not.toContain(profile.id);
    expect(phone.signedIn).toBe(false);
    expect(phone.route).toBe("/onboarding"); // nobody left: the welcome screen, not a sign-in wall
  });

  it("a wrong password deletes nothing, on the server or the phone", async () => {
    const { phone, user } = await onPlan("Pro");
    const profile = (await phone.activeProfile())!;

    await expect(phone.deleteAccount("not-the-password")).rejects.toThrow();

    expect(await accountExists("cloud", user)).toBe(true);
    expect(await phone.rowsOwnedBy(profile.id)).toBeGreaterThan(0);
    expect(phone.signedIn).toBe(true);
  });

  it("with no signal, deleting fails and keeps everything (the server account would otherwise outlive the phone's copy)", async () => {
    const { phone, user } = await onPlan("Pro");
    const profile = (await phone.activeProfile())!;
    phone.networkDown = true;

    await expect(phone.deleteAccount(user.password)).rejects.toThrow();

    phone.networkDown = false;
    expect(await accountExists("cloud", user)).toBe(true);
    expect(await phone.rowsOwnedBy(profile.id)).toBeGreaterThan(0);
  });

  it("deleting everything on a phone with no account wipes it and starts over at the welcome screen", async () => {
    const phone = await new Device().launch();
    await phone.finishOnboarding({ name: "Sam", split: "Full Body" });
    await phone.logWorkout("Day 1");
    const profile = (await phone.activeProfile())!;

    await phone.deleteAccount();
    await phone.launch();

    expect(await phone.rowsOwnedBy(profile.id)).toBe(0);
    expect((await phone.profiles()).map((p) => p.id)).not.toContain(profile.id);
    expect(await phone.splitNames()).toEqual([]);
    expect(phone.route).toBe("/onboarding");
  });

  it("deleting an account leaves the space without an account alone", async () => {
    const phone = await new Device().launch();
    await phone.finishOnboarding({ name: "Sam", split: "Full Body" });
    const sam = (await phone.activeProfile())!;
    const alex = newUser("alex");
    await phone.addAccount(alex, "cloud", "register");
    await phone.finishOnboarding({ name: "Alex", split: "Bro Split" });

    await phone.deleteAccount(alex.password);
    await phone.switchProfile(sam.id);

    expect(phone.profileName).toBe("Sam");
    expect(await phone.splitNames()).toEqual(["Full Body"]);
    expect(await phone.profiles()).toHaveLength(1);
  });
});
