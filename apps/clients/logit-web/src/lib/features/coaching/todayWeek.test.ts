import { describe, expect, it } from "vitest";
import { lastWeek, weekAhead } from "./todayWeek";
import type { ClientSummary, CoachingOverview } from "./coachingData";

const DAY = 86_400_000;
const now = new Date(2026, 11, 7, 9).getTime(); // Monday 9am
const share = { workouts: true, checkins: true, nutrition: true, bodyweight: true, photos: true, habits: true };
const client = (id: string, over: Partial<ClientSummary> = {}): ClientSummary => ({
  relationshipId: `r-${id}`, id, username: id, name: `${id} Surname`, avatarUrl: null, isSample: false, sharing: share as ClientSummary["sharing"],
  since: null, sessions7d: 0, foodDays7d: null, lastSessionAtMs: null, unread: 0, program: null, toReview: [], lastCheckinAtMs: null,
  missed: null, scheduleCount: 0, waitingSinceMs: null, pausedUntil: null, endsAt: null, lastingSwap: false, pluginConsent: {}, ...over,
});
const running = (daysPerWeek: number, endsAtMs: number | null = null) => ({ state: "running", daysPerWeek, endsAtMs, week: 8, totalWeeks: 8, program: { name: "Block" } }) as unknown as ClientSummary["program"];
const overview = (clients: ClientSummary[], schedules: CoachingOverview["schedules"] = []): CoachingOverview => ({ clients, inbox: [], schedules, programs: [], requests: [], sent: [] });

describe("Today's week ahead (canvas W1)", () => {
  it("lists programs ending, paid-until dates and check-ins due per day, in date order", () => {
    const emma = client("Emma", { program: running(3, now + 2 * DAY) });
    const schedule = { cadence: "weekly", anchorMs: now - 7 * DAY + 6 * DAY, archived: false };
    const o = overview([emma, client("Aoife"), client("Liam")], [
      { recipientUserId: "Aoife", schedule }, { recipientUserId: "Emma", schedule },
    ] as unknown as CoachingOverview["schedules"]);
    const liam = { client: { id: "Liam", username: "Liam", displayName: "Liam F", avatarUrl: null }, mode: "elsewhere", paidUntil: new Date(now + 3 * DAY).toISOString(), state: "paid", rule: "keep", actionAt: null };
    const items = weekAhead(o, [liam as never], now);
    expect(items.map((i) => i.text)).toEqual(["Emma's program ends", "Liam's paid-until date passes", "2 check-ins due"]);
  });
  it("counts last week only for clients who share it, and names the quiet ones", () => {
    const o = overview([
      client("A", { program: running(4), sessions7d: 4, foodDays7d: 6, lastSessionAtMs: now - DAY }),
      client("B", { program: running(3), sessions7d: 1, foodDays7d: 2, lastSessionAtMs: now - 9 * DAY }),
      client("C", { sharing: { ...share, workouts: false } as ClientSummary["sharing"] }),
    ]);
    const w = lastWeek(o, now);
    expect(w.sessions).toEqual({ done: 5, planned: 7 });
    expect(w.food).toEqual({ logged: 1, sharing: 2 });
    expect(w.quiet.map((q) => q.name)).toEqual(["B"]);
    expect(w.checkins).toBeNull();
    // A start-up form (manual) is never due, so it doesn't count.
    const manual = overview([client("D", { scheduleCount: 1 })], [{ recipientUserId: "D", schedule: { cadence: "manual", anchorMs: now, archived: false } }] as unknown as CoachingOverview["schedules"]);
    expect(lastWeek(manual, now).checkins).toBeNull();
  });
});
