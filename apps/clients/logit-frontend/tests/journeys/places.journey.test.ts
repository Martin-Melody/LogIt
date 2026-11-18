// Places you train (My gym, design canvas G1–G10): kept per account, synced like habits, and
// the machines kept on exercises move into a first place once.
import { describe, expect, it } from "vitest";
import { Device } from "./support/device";
import { createAccount, newUser } from "./support/servers";

const places = async () => (await import("$lib/features/places/places.svelte")).placesStore;
const place = async () => import("@logit/core/domain/place");

describe("your places", () => {
  it("a place made on one phone, with an uneven stack, is on the next phone after signing in", async () => {
    const user = await createAccount("cloud", newUser("placer"), "Pro");
    const first = await new Device("gym phone").launch();
    await first.signIn(user);
    await first.finishOnboarding({ name: "Sam" });

    const { newPlace, stackWeights } = await place();
    const store = await places();
    const gym = newPlace("Northside", "gym", "gym");
    store.save({
      ...gym,
      usualDays: [1, 4],
      machines: [{
        id: "mach_pulldown", name: "Lat pulldown", unit: "kg", incrementKg: 5, loading: "stack", status: "in",
        exerciseIds: ["core_lat_pulldown"], weights: stackWeights(5, [{ step: 5, to: 25 }, { step: 10, to: 95 }]),
      }],
    });
    await first.sync();

    const second = await new Device("new phone").launch();
    await second.signIn(user);
    await second.sync();
    const there = (await places()).active;
    expect(there.map((p) => p.name)).toEqual(["Northside"]);
    expect(there[0]!.usualDays).toEqual([1, 4]);
    const m = there[0]!.machines[0]!;
    expect(m.weights).toEqual({ kind: "stack", values: [5, 10, 15, 20, 25, 35, 45, 55, 65, 75, 85, 95] });
    expect((await places()).machinesFor(there[0]!.id, "core_lat_pulldown").map((x) => x.name)).toEqual(["Lat pulldown"]);
  });

  it("machines already set on exercises move into My gym once, and archiving keeps it off the list", async () => {
    const phone = await new Device().launch();
    await phone.finishOnboarding({ name: "Sam" });
    const { getExerciseRepo } = await import("$lib/data/repoProvider");
    await getExerciseRepo().update("core_lat_pulldown", {
      machines: [{ id: "m1", name: "Pulldown", incrementKg: 5, weights: { kind: "linear", min: 5, step: 5, max: 100 } }],
    });

    const store = await places();
    const made = await store.migrateExerciseMachines();
    expect(made?.name).toBe("My gym");
    expect(made?.machines[0]?.exerciseIds).toEqual(["core_lat_pulldown"]);
    expect(await store.migrateExerciseMachines()).toBeNull(); // only once

    await phone.launch();
    const again = await places();
    expect(again.active.map((p) => p.name)).toEqual(["My gym"]);
    again.archive(again.active[0]!.id);
    expect(again.active).toEqual([]);
    expect(again.all).toHaveLength(1);
  });

  it("with no places nothing changes, and the question isn't asked with one place", async () => {
    const phone = await new Device().launch();
    await phone.finishOnboarding({ name: "Sam" });
    const store = await places();
    expect(store.defaultFor()).toBeNull();
    const { newPlace } = await place();
    store.save(newPlace("Home", "home", "dumbbells"));
    expect(store.shouldAsk).toBe(false);
    store.save(newPlace("Gym", "gym", "gym"));
    expect(store.shouldAsk).toBe(true);
    store.setAsk(false);
    expect(store.shouldAsk).toBe(false);
  });
});
