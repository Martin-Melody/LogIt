// Settings stored per account on the phone (src/lib/data/accountStorage.ts).
import { beforeEach, describe, expect, it } from "vitest";
import { getAccountItem, setAccountItem } from "$lib/data/accountStorage";
import { setActiveOwnerId } from "$lib/data/activeOwner";

const KEY = "logit:nav-config:v1";

beforeEach(() => {
  localStorage.clear();
  setActiveOwnerId(null);
});

describe("account settings", () => {
  it("each account reads and writes its own copy", () => {
    setActiveOwnerId("a");
    setAccountItem(KEY, "A's layout");
    setActiveOwnerId("b");
    expect(getAccountItem(KEY)).toBeNull();
    setAccountItem(KEY, "B's layout");
    setActiveOwnerId("a");
    expect(getAccountItem(KEY)).toBe("A's layout");
  });

  it("with no active account (the web) the plain key is used", () => {
    setAccountItem(KEY, "web layout");
    expect(localStorage.getItem(KEY)).toBe("web layout");
    expect(getAccountItem(KEY)).toBe("web layout");
  });

  it("a value saved before settings were per account goes to the first account that reads it, and only to that one", () => {
    localStorage.setItem(KEY, "old phone-wide layout");
    setActiveOwnerId("a");
    expect(getAccountItem(KEY)).toBe("old phone-wide layout");
    setActiveOwnerId("b");
    expect(getAccountItem(KEY)).toBeNull();
    setActiveOwnerId("a");
    expect(getAccountItem(KEY)).toBe("old phone-wide layout");
  });
});
