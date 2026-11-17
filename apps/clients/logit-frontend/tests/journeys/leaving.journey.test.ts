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
    it("signing out keeps the data on the phone and opens the profile picker", async () => {
      const { phone } = await onPlan(tier);
      const profile = (await phone.activeProfile())!;

      await phone.signOut();

      expect(phone.route).toBe("/accounts");
      expect(phone.signedIn).toBe(false);
      expect(await phone.rowsOwnedBy(profile.id)).toBeGreaterThan(0);
    });

    it("the profile can be opened offline afterwards with everything still there", async () => {
      const { phone } = await onPlan(tier);
      const profile = (await phone.activeProfile())!;
      await phone.signOut();

      await phone.switchProfile(profile.id);

      expect(phone.signedIn).toBe(false);
      expect(phone.profileName).toBe("Sam");
      expect(await phone.splitNames()).toEqual(["Push Pull Legs"]);
      expect(await phone.workoutNames()).toEqual(["Push day"]);
    });

    it("working offline after signing out doesn't talk to the server", async () => {
      const { phone } = await onPlan(tier);
      const profile = (await phone.activeProfile())!;
      await phone.signOut();
      await phone.switchProfile(profile.id);
      const before = phone.requests.length;

      await phone.logWorkout("Legs");
      await phone.launch();

      expect(phone.requests.slice(before)).toEqual([]);
      expect(await phone.workoutNames()).toEqual(["Legs", "Push day"]);
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
    it("signing into a self-hosted server doesn't touch the getlogit.app profile", async () => {
      const { phone, user } = await onPlan(tier);
      const cloudProfile = (await phone.activeProfile())!;
      await phone.signOut();

      await phone.register(newUser("moved"), "self-host");

      expect((await phone.activeProfile())!.id).not.toBe(cloudProfile.id);
      expect(await phone.rowsOwnedBy(cloudProfile.id)).toBeGreaterThan(0);
      expect((await serverData("cloud", user)).workoutNames).toEqual(["Push day"]);
    });

    // DECISION NEEDED (see tests/journeys/README.md "Open questions"): today the self-hosted
    // account starts empty; the only way across is Settings › Backup → export, then import.
    it.todo("moving to a self-hosted server brings the user's workouts and splits with them");
  });
}

describe("deleting the account", () => {
  it("deleting a getlogit.app account removes it from the server and its data from the phone", async () => {
    const { phone, user } = await onPlan("Pro");
    const profile = (await phone.activeProfile())!;

    await phone.deleteAccount(user.password);

    expect(await accountExists("cloud", user)).toBe(false);
    expect(await phone.rowsOwnedBy(profile.id)).toBe(0);
    expect((await phone.profiles()).map((p) => p.id)).not.toContain(profile.id);
    expect(phone.signedIn).toBe(false);
    expect(phone.route).toBe("/auth");
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

  it("deleting an offline profile wipes it and the next launch doesn't bring it back", async () => {
    const phone = await new Device().launch();
    await phone.finishOnboarding({ name: "Sam", split: "Full Body" });
    await phone.logWorkout("Day 1");
    const profile = (await phone.activeProfile())!;

    await phone.deleteAccount();
    await phone.launch();

    expect(await phone.rowsOwnedBy(profile.id)).toBe(0);
    expect(await phone.profiles()).toHaveLength(0);
    expect(phone.route).toBe("/auth");
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
