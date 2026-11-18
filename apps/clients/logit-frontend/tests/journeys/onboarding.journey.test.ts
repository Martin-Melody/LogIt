// First launch and onboarding, offline and online. See docs/architecture/account-model.md §3
// rows 1, 3 and 5.
import { describe, expect, it } from "vitest";
import { Device } from "./support/device";
import { createAccount, newUser, serverData, setTier } from "./support/servers";

describe("first launch, fully offline", () => {
  it("a new phone opens on onboarding with one local profile and no account", async () => {
    const phone = await new Device().launch();

    expect(phone.route).toBe("/onboarding");
    expect(await phone.profiles()).toHaveLength(1);
    expect(phone.signedIn).toBe(false);
  });

  it("finishing onboarding keeps the name and split, and the next launch skips onboarding", async () => {
    const phone = await new Device().launch();
    await phone.finishOnboarding({ name: "Sam", split: "Push Pull Legs" });

    await phone.launch();

    expect(phone.route).toBe("/");
    expect(phone.profileName).toBe("Sam");
    expect(await phone.splitNames()).toEqual(["Push Pull Legs"]);
  });

  it("closing the app halfway through onboarding brings the user back to the same step", async () => {
    const phone = await new Device().launch();
    phone.app.profileStore.profile.save({ name: "Sam" });
    phone.app.onboardingStore.onboarding.setStep(2);

    await phone.launch();

    expect(phone.route).toBe("/onboarding");
    expect(phone.profileName).toBe("Sam");
    const { get } = await import("svelte/store");
    expect(get(phone.app.onboardingStore.onboarding).step).toBe(2);
  });

  it("an offline user never talks to a server", async () => {
    const phone = await new Device().launch();
    await phone.finishOnboarding({ name: "Sam", split: "Upper Lower" });
    await phone.logWorkout("Upper A");
    await phone.launch();

    expect(phone.requests).toEqual([]);
  });
});

describe("first launch, with an account", () => {
  it("signing up from the welcome screen goes through onboarding and tells the server it's done", async () => {
    const phone = await new Device().launch();
    const user = newUser("signup");

    await phone.register(user);
    expect(phone.route).toBe("/onboarding");
    await phone.finishOnboarding({ name: "Sam" });

    expect((await serverData("cloud", user)).me.onboardingCompleted).toBe(true);
    await phone.launch();
    expect(phone.route).toBe("/");
    expect(phone.signedIn).toBe(true);
  });

  it("signing up uses the name typed during onboarding, not the username", async () => {
    const phone = await new Device().launch();
    phone.app.profileStore.profile.save({ name: "Sam Smith" });
    const user = newUser("named");

    await phone.register(user);

    expect(phone.user?.displayName).toBe("Sam Smith");
  });

  it("the name typed in onboarding after signing up becomes the account's name and survives signing in again", async () => {
    const phone = await new Device().launch();
    const user = newUser("namelater");
    await phone.register(user);
    await phone.finishOnboarding({ name: "Sam Smith" });

    await phone.signOut();
    await phone.signIn(user);

    expect((await serverData("cloud", user)).me.displayName).toBe("Sam Smith");
    expect(phone.profileName).toBe("Sam Smith");
  });

  it("a returning user who already finished onboarding skips it on a new phone", async () => {
    const user = await createAccount("cloud", newUser("returning"), "Pro");
    const first = await new Device("old phone").launch();
    await first.signIn(user);
    await first.finishOnboarding({ name: "Sam", split: "Full Body" });

    const second = await new Device("new phone").launch();
    expect(second.route).toBe("/onboarding");
    await second.signIn(user);

    expect(second.route).toBe("/");
    expect(second.onboardingDone).toBe(true);
    expect(await second.splitNames()).toEqual(["Full Body"]);
    expect(await second.profiles()).toHaveLength(1); // signed into the first-launch profile, no extra one
  });

  it("signing in on a brand-new phone links the first-launch profile instead of adding a second", async () => {
    const user = await createAccount("cloud", newUser("link"), "Pro");
    const phone = await new Device().launch();

    await phone.signIn(user);

    const profiles = await phone.profiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].serverUserId).toBe(user.id);
  });

  it("signing in again after signing out reuses the same profile", async () => {
    const user = await createAccount("cloud", newUser("again"), "Pro");
    const phone = await new Device().launch();
    await phone.signIn(user);
    await phone.finishOnboarding({ name: "Sam" });

    await phone.signOut();
    await phone.signIn(user);

    expect(await phone.profiles()).toHaveLength(1);
    expect(phone.route).toBe("/");
  });
});

describe("the phone's own space becoming an account", () => {
  it("takes the account's username, so the account switcher doesn't show '@local'", async () => {
    const phone = await new Device().launch();
    await phone.finishOnboarding({ name: "Sam" });
    const user = newUser("namer");
    await phone.register(user);
    expect((await phone.activeProfile())?.username).toBe(user.username);

    const other = await createAccount("cloud", newUser("signin"));
    const second = await new Device("second phone").launch();
    await second.finishOnboarding({ name: "Alex" });
    await second.signIn(other, "cloud", "add");
    expect((await second.activeProfile())?.username).toBe(other.username);
  });
});

describe("the plan onboarding builds (design canvas O1–O3)", () => {
  const answers = { goal: "both", experience: "under2", days: 4, equipment: "gym", minutes: 45 } as const;

  it("offline: the plan is the active split on its weekdays, with rep ranges and the weekly target, across a restart", async () => {
    const phone = await new Device().launch();
    await phone.onboardWithPlan(answers);
    await phone.launch();

    expect(phone.route).toBe("/");
    expect(await phone.splitNames()).toEqual(["Upper / Lower"]);
    const { activeSplit } = await import("$lib/stores/activeSplit.store");
    const { get } = await import("svelte/store");
    expect(get(activeSplit)?.days.map((d) => d.weekday)).toEqual([1, 2, 4, 5]);
    const { goalsStore } = await import("$lib/features/goals/goalsStore");
    expect(get(goalsStore).streak.weeklyTarget).toBe(4);
    const { getExerciseProgressionSettings } = await import("@logit/core/usecases/progression/exerciseProgressionSettings");
    const { getProgressionDeps } = await import("$lib/usecases/progressionDeps");
    expect((await getExerciseProgressionSettings({ id: "core_bench_press", name: "Bench Press" }, getProgressionDeps()))?.repRange).toEqual([5, 8]);
    expect(phone.requests).toEqual([]);
  });

  it("signing up afterwards uploads the plan and its rep ranges", async () => {
    const phone = await new Device().launch();
    await phone.onboardWithPlan({ ...answers, goal: "strength" });
    const user = newUser("planner");
    await phone.register(user);
    await setTier("cloud", phone.user!.id, "Pro");
    await phone.refreshPlan();
    await phone.sync();

    const server = await serverData("cloud", user, phone);
    expect(server.splitNames).toEqual(["Upper / Lower"]);
    expect(server.repRanges?.["Bench Press"]).toEqual([3, 6]);
    expect(server.repRanges?.["Bicep Curl"]).toEqual([6, 10]);
  });
});
