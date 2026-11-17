// Moving between Pro and Studio, and a plan ending. account-model.md §3 rows 11 and 12, and the
// 2026-11-11 decision that a coach dropping to Pro keeps their clients read-only.
import { describe, expect, it } from "vitest";
import { Device } from "./support/device";
import { newUser, serverData, setTier, type Tier } from "./support/servers";

async function onPlan(tier: Tier) {
  const phone = await new Device().launch();
  const user = newUser(tier.toLowerCase());
  await phone.register(user);
  await phone.finishOnboarding({ name: "Sam" });
  await setTier("cloud", phone.user!.id, tier);
  await phone.refreshPlan();
  await phone.saveSplit("Upper Lower");
  await phone.logWorkout("Upper A");
  return { phone, user };
}

describe("changing plan", () => {
  it("Pro → Studio: the plan updates and nothing is lost or uploaded twice", async () => {
    const { phone, user } = await onPlan("Pro");

    await setTier("cloud", phone.user!.id, "Studio");
    await phone.refreshPlan();
    await phone.sync();

    expect(phone.user?.tier).toBe("Studio");
    expect(await phone.splitNames()).toEqual(["Upper Lower"]);
    const server = await serverData("cloud", user);
    expect(server.splitNames).toEqual(["Upper Lower"]);
    expect(server.workoutNames).toEqual(["Upper A"]);
  });

  it("Studio → Pro: the plan updates and the user's own data keeps syncing", async () => {
    const { phone, user } = await onPlan("Studio");

    await setTier("cloud", phone.user!.id, "Pro");
    await phone.refreshPlan();
    await phone.logWorkout("Lower A");

    expect(phone.user?.tier).toBe("Pro");
    expect((await serverData("cloud", user)).workoutNames).toEqual(["Lower A", "Upper A"]);
  });

  it("a plan that ends keeps everything on the phone, and this phone keeps backing up (Free)", async () => {
    const { phone, user } = await onPlan("Pro");

    await setTier("cloud", phone.user!.id, "Free");
    await phone.launch();
    await phone.logWorkout("Lower A");

    expect(phone.route).toBe("/");
    expect(phone.signedIn).toBe(true);
    expect(phone.user?.tier).toBe("Free");
    expect(await phone.workoutNames()).toEqual(["Lower A", "Upper A"]);
    expect((await serverData("cloud", user, phone)).workoutNames).toEqual(["Lower A", "Upper A"]);
  });

  it("resubscribing uploads what was logged while the plan had lapsed", async () => {
    const { phone, user } = await onPlan("Pro");
    await setTier("cloud", phone.user!.id, "Free");
    await phone.refreshPlan();
    await phone.logWorkout("Lower A");

    await setTier("cloud", phone.user!.id, "Pro");
    await phone.refreshPlan();
    await phone.sync();

    expect((await serverData("cloud", user)).workoutNames).toEqual(["Lower A", "Upper A"]);
  });

  it("a plan that ends while the phone is offline is picked up once it's back online", async () => {
    const { phone } = await onPlan("Pro");
    phone.networkDown = true;
    await setTier("cloud", phone.user!.id, "Free");

    await phone.launch();
    expect(phone.signedIn).toBe(true); // no signal is not a reason to sign out
    expect(await phone.workoutNames()).toEqual(["Upper A"]);

    phone.networkDown = false;
    await phone.refreshPlan();
    expect(phone.user?.tier).toBe("Free");
  });
});
