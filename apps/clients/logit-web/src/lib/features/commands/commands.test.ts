import { describe, expect, it } from "vitest";
import type { ClientSummary } from "$lib/features/coaching/coachingData";
import type { PersonRow } from "$lib/features/admin/adminApi";
import { actionListProblems, clientActions, isMenuKey, personActions, type RowAction } from "./commands.svelte";

const allShared = { workouts: true, nutrition: true, bodyweight: true, habits: true, checkins: true };

function client(over: Partial<ClientSummary> = {}): ClientSummary {
  return {
    relationshipId: "rel1", id: "u1", username: "aoife", name: "Aoife", avatarUrl: null, isSample: false,
    sharing: allShared, since: null, sessions7d: 2, lastSessionAtMs: null, unread: 0, program: null,
    toReview: [], lastCheckinAtMs: null, missed: null, scheduleCount: 1, ...over,
  } as ClientSummary;
}

const person = (over: Partial<PersonRow> = {}): PersonRow => ({
  id: "p1", username: "sam", email: "sam@example.com", displayName: "Sam", isAdmin: false,
  createdAt: "2026-01-01T00:00:00Z", postCount: 0, lastActive: null, ...over,
});

describe("every action list follows the menu rules (canvas X4)", () => {
  const lists: [string, RowAction[]][] = [
    ["client", clientActions(client())],
    ["client sharing nothing", clientActions(client({ sharing: { workouts: false, nutrition: false, bodyweight: false, habits: false, checkins: false } }))],
    ["client with no check-in form", clientActions(client({ scheduleCount: 0 }))],
    ["person", personActions(person(), "me")],
    ["admin person", personActions(person({ isAdmin: true }), "me")],
    ["myself as admin", personActions(person({ id: "me", isAdmin: true }), "me")],
  ];
  it.each(lists)("%s", (_, list) => expect(actionListProblems(list)).toEqual([]));
});

describe("the rules checker", () => {
  const go = (id: string, over: Partial<RowAction> = {}): RowAction => ({ id, label: id, href: `/${id}`, ...over });

  it("catches each broken rule", () => {
    expect(actionListProblems([go("a"), go("a")])).toEqual(['"a" is listed twice']);
    expect(actionListProblems([{ id: "x", label: "x" }])).toEqual(['"x" does nothing']);
    expect(actionListProblems([go("a", { separatorBefore: true })])).toEqual(["the list starts with a line"]);
    expect(actionListProblems([go("a"), go("d", { danger: true })])).toEqual(['"d" is red without a line above it']);
    expect(actionListProblems([go("a"), go("d", { danger: true, separatorBefore: true }), go("b")])).toEqual(['"d" is red but not at the end']);
    expect(actionListProblems([go("a", { disabled: "" })])).toEqual(['"a" is greyed without a short reason']);
    expect(actionListProblems([go("Open.")])).toEqual(['"Open." ends with punctuation']);
  });

  it("allows red items grouped at the end", () => {
    expect(actionListProblems([go("a"), go("d", { danger: true, separatorBefore: true }), go("e", { danger: true })])).toEqual([]);
  });
});

describe("menu keys", () => {
  const key = (k: string, mods: Partial<KeyboardEvent> = {}) =>
    ({ key: k, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...mods }) as KeyboardEvent;

  it('opens on ".", Shift+F10 and the Menu key, not on Ctrl+. or plain F10', () => {
    expect(isMenuKey(key("."))).toBe(true);
    expect(isMenuKey(key("F10", { shiftKey: true }))).toBe(true);
    expect(isMenuKey(key("ContextMenu"))).toBe(true);
    expect(isMenuKey(key(".", { ctrlKey: true }))).toBe(false);
    expect(isMenuKey(key("F10"))).toBe(false);
  });
});
