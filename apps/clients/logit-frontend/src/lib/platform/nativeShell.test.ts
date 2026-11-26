import { describe, expect, it } from "vitest";
import { routeForAppLink } from "./nativeShell";

describe("links that open the app", () => {
  const code = "logit-alg1:eyJuYW1lIjoiWCJ9";
  it("sends a shared algorithm to Add from a code", () => {
    const route = `/settings/progression?algorithmCode=${encodeURIComponent(code)}`;
    expect(routeForAppLink(`logit://a?c=${code}`)).toBe(route);
    expect(routeForAppLink(`https://getlogit.app/a#${code}`)).toBe(route);
  });
  it("sends a friend's invite to its page", () => {
    const invite = "logit-fr1:abcd2345wxyz:aHR0cDovLzE5Mi4xNjguMS4yMDo4MDgw";
    const route = `/social/invite?c=${encodeURIComponent(invite)}`;
    expect(routeForAppLink(`logit://f?c=${invite}`)).toBe(route);
    expect(routeForAppLink(`https://getlogit.app/f#${invite}`)).toBe(route);
  });
  it("sends a group's link to the join screen", () => {
    const group = "logit-gr1:abcd2345wxyz";
    const route = `/groups/join?c=${encodeURIComponent(group)}`;
    expect(routeForAppLink(`logit://g?c=${group}`)).toBe(route);
    expect(routeForAppLink(`https://getlogit.app/g#${group}`)).toBe(route);
  });
  it("sends a profile or a post on the web to it in the app", () => {
    const id = "baa269fe-6e39-4f88-b438-c544c5845748";
    expect(routeForAppLink("https://getlogit.app/@Ava")).toBe("/social/ava");
    expect(routeForAppLink("logit://u/ava")).toBe("/social/ava");
    expect(routeForAppLink(`https://getlogit.app/@ava/p/${id}`)).toBe(`/social/post/${id}`);
    expect(routeForAppLink(`logit://u/ava/p/${id}`)).toBe(`/social/post/${id}`);
    expect(routeForAppLink("https://getlogit.app/@ava/other")).toBeNull();
  });
  it("ignores anything else", () => {
    expect(routeForAppLink("logit://somewhere")).toBeNull();
  });
});
