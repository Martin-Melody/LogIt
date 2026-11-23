// Someone uses the app offline first, then makes an account: on getlogit.app (Free, then
// buying Pro or Studio) or on their own server. account-model.md §3 rows 3 and 11.
import { describe, expect, it } from "vitest";
import { Device } from "./support/device";
import { CLOUD } from "./support/servers";
import { coach, createAccount, newUser, serverData, setTier, tokenFor, type Tier } from "./support/servers";

/** An offline user with a name, a split and a workout. */
async function offlineUser() {
  const phone = await new Device().launch();
  await phone.finishOnboarding({ name: "Sam", split: "Push Pull Legs" });
  await phone.logWorkout("Push day");
  return phone;
}

describe("offline → account on getlogit.app", () => {
  it("making a Free account keeps everything on the phone and doesn't start onboarding again", async () => {
    const phone = await offlineUser();
    const user = newUser("free");

    await phone.register(user);

    expect(phone.route).toBe("/");
    expect(phone.profileName).toBe("Sam");
    expect(await phone.splitNames()).toEqual(["Push Pull Legs"]);
    expect(await phone.workoutNames()).toEqual(["Push day"]);
    expect(await phone.profiles()).toHaveLength(1);
    expect((await serverData("cloud", user)).me.onboardingCompleted).toBe(true);
  });

  it("a Free account backs up this phone (Free accounts back up one phone)", async () => {
    const phone = await offlineUser();
    const user = newUser("freeonly");

    await phone.register(user);

    const server = await serverData("cloud", user, phone);
    expect(server.splitNames).toEqual(["Push Pull Legs"]);
    expect(server.workoutNames).toEqual(["Push day"]);
  });

  it("a Free account's backup belongs to one phone: a second phone is asked, and refused until it takes it", async () => {
    const user = newUser("onephone");
    const first = await new Device("first phone").launch();
    await first.register(user);
    await first.finishOnboarding({ name: "Sam", split: "First split" });

    const second = await new Device("second phone").launch();
    await second.signIn(user);
    // The first phone still holds it: the app asks "Back up this phone instead?" (decision D5).
    expect(second.app.client.apiClient.isBackupElsewhere()).toBe(true);
    await second.app.client.apiClient.moveBackupHere(); // "Back up this phone"
    await second.saveSplit("Second split");
    await first.launch();
    await first.saveSplit("Made on the first phone");
    await first.sync();

    expect(first.app.client.apiClient.isBackupElsewhere()).toBe(true);
    const fromSecond = await serverData("cloud", user, second);
    expect(fromSecond.splitNames).toEqual(["First split", "Second split"]);
    expect((await serverData("cloud", user, first)).splitNames).toBeNull(); // refused
  });

  for (const tier of ["Pro", "Studio"] as Tier[]) {
    it(`buying ${tier} later uploads everything made offline before the account existed`, async () => {
      const phone = await offlineUser();
      const user = newUser(tier.toLowerCase());
      await phone.register(user);
      await phone.logWorkout("Pull day"); // made while Free

      await setTier("cloud", phone.user!.id, tier); // the purchase, as the server records it
      await phone.refreshPlan();
      await phone.sync();

      expect(phone.user?.tier).toBe(tier);
      const server = await serverData("cloud", user);
      expect(server.splitNames).toEqual(["Push Pull Legs"]);
      expect(server.workoutNames).toEqual(["Pull day", "Push day"]);
      expect(server.profile?.displayName).toBe("Sam");
    });

    it(`${tier} bought on the web shows up after the app restarts`, async () => {
      const phone = await offlineUser();
      const user = newUser(`${tier.toLowerCase()}web`);
      await phone.register(user);

      await setTier("cloud", phone.user!.id, tier);
      await phone.launch();

      expect(phone.user?.tier).toBe(tier);
      expect((await serverData("cloud", user)).splitNames).toEqual(["Push Pull Legs"]);
    });
  }

  it("a Free client of a Studio coach still uploads their offline workouts at sign-in (coached clients may sync workouts)", async () => {
    const studio = await createAccount("cloud", newUser("coach"), "Studio");
    const client = await createAccount("cloud", newUser("client"), "Free");
    await coach("cloud", studio, client);
    const phone = await offlineUser();

    await phone.signIn(client);

    const token = await tokenFor("cloud", client);
    const res = await fetch(`${CLOUD}/sync/sessions?since=0`, { headers: { Authorization: `Bearer ${token}` } });
    const { sessions } = (await res.json()) as { sessions: { dataJson: string }[] };
    expect(sessions.map((x) => (JSON.parse(x.dataJson) as { name: string }).name)).toEqual(["Push day"]);
  });

  it("signing into an existing Pro account from an offline profile merges the offline data into it", async () => {
    const other = await new Device("old phone").launch();
    const user = newUser("merge");
    await other.register(user);
    await setTier("cloud", other.user!.id, "Pro");
    await other.refreshPlan();
    await other.saveSplit("Old phone split");

    const phone = await offlineUser();
    await phone.signIn(user);

    expect(await phone.splitNames()).toEqual(["Old phone split", "Push Pull Legs"]);
    expect((await serverData("cloud", user)).splitNames).toEqual(["Old phone split", "Push Pull Legs"]);
  });
});

describe("offline → own server (self-host)", () => {
  it("signing up on a self-hosted server uploads the offline data there and nothing to getlogit.app", async () => {
    const phone = await offlineUser();
    const user = newUser("selfhost");

    await phone.register(user, "self-host");

    expect(phone.route).toBe("/");
    const server = await serverData("self-host", user);
    expect(server.splitNames).toEqual(["Push Pull Legs"]);
    expect(server.workoutNames).toEqual(["Push day"]);
    expect(phone.requests.filter((r) => r.includes(" cloud "))).toEqual([]);
  });

  it("the phone stays on the self-hosted server after a restart", async () => {
    const phone = await offlineUser();
    await phone.register(newUser("selfhost2"), "self-host");
    const before = phone.requests.length;

    await phone.launch();
    await phone.sync();

    expect(phone.signedIn).toBe(true);
    const after = phone.requests.slice(before);
    expect(after.length).toBeGreaterThan(0);
    expect(after.filter((r) => r.includes(" cloud "))).toEqual([]);
  });
});

describe("signing in on a phone that has training without an account", () => {
  it("the sign-in screen asks whose it is, with what's there", async () => {
    const phone = await offlineUser();

    expect(await phone.app.auth.authStore.offlineTrainingToAsk()).toEqual({ workouts: 1, splits: 1, name: "Sam" });
  });

  it("nobody is asked when the phone has no training yet", async () => {
    const phone = await new Device().launch();

    expect(await phone.app.auth.authStore.offlineTrainingToAsk()).toBeNull();
  });

  it("\"Yes, add it\" puts the training into the account", async () => {
    const user = await createAccount("cloud", newUser("mine"), "Pro");
    const phone = await offlineUser();

    await phone.signIn(user, "cloud", "add");

    expect(await phone.profiles()).toHaveLength(1);
    expect(await phone.splitNames()).toEqual(["Push Pull Legs"]);
    expect((await serverData("cloud", user)).splitNames).toEqual(["Push Pull Legs"]);
  });

  it("\"No, it's someone else's\" leaves it where it is and gives the account its own space", async () => {
    const user = await createAccount("cloud", newUser("visitor"), "Pro");
    const phone = await offlineUser();
    const offline = (await phone.activeProfile())!;

    await phone.signIn(user, "cloud", "keep-separate");

    expect(phone.signedIn).toBe(true);
    expect(await phone.profiles()).toHaveLength(2);
    expect(await phone.splitNames()).toEqual([]);
    expect((await serverData("cloud", user)).splitNames).toEqual([]);
    await phone.switchProfile(offline.id);
    expect(phone.profileName).toBe("Sam");
    expect(await phone.splitNames()).toEqual(["Push Pull Legs"]);
  });

  it("a wrong password after \"someone else's\" goes back to the training on the phone", async () => {
    const user = await createAccount("cloud", newUser("typo"), "Pro");
    const phone = await offlineUser();
    const offline = (await phone.activeProfile())!;

    await expect(phone.signIn({ ...user, password: "wrong-password" }, "cloud", "keep-separate")).rejects.toThrow();

    expect((await phone.activeProfile())?.id).toBe(offline.id);
    expect(phone.signedIn).toBe(false);
    expect(await phone.splitNames()).toEqual(["Push Pull Legs"]);
  });

  it("\"someone else's\" on a self-hosted server signs in there, not to getlogit.app", async () => {
    const user = await createAccount("self-host", newUser("ownvisitor"));
    const phone = await offlineUser();
    const before = phone.requests.length;

    await phone.signIn(user, "self-host", "keep-separate");
    await phone.sync();

    expect(phone.signedIn).toBe(true);
    expect(phone.requests.slice(before).filter((r) => r.includes(" cloud "))).toEqual([]);
  });
});
