// Focused unit tests for the pure decision functions behind docs/bugs/account-switching.md's
// two bugs — no SQLite, no DOM needed. See ownerIdIsolation.test.ts for the integration-level
// regression test of #2 against the real sqlite repos; #1's actual switch flow
// (authStore.loginOfflineAccount → goto(postSwitchDestination(...))) still isn't exercised
// end-to-end by any tier — Playwright drives the web build only (isNativePlatform() is always
// false there, so /accounts is unreachable), and this tier has no component rendering. This
// file is what stands in for that coverage.
import { describe, expect, it } from "vitest";
import { orphanClaimTarget, postSwitchDestination } from "$lib/data/localAccountRepo";

describe("orphanClaimTarget", () => {
  it("true first launch: hands orphaned rows to the new (first) profile itself", () => {
    expect(orphanClaimTarget(0, null, "new-account")).toBe("new-account");
  });

  it("later profile: hands orphaned rows to whoever was active before, never the new profile", () => {
    expect(orphanClaimTarget(1, "profile-a", "profile-b")).toBe("profile-a");
  });

  it("later profile with no prior active owner: nothing safe to do, returns null", () => {
    expect(orphanClaimTarget(1, null, "profile-b")).toBeNull();
  });
});

describe("postSwitchDestination", () => {
  it("a previously-synced profile is sent to re-auth, not silently dropped on '/'", () => {
    expect(postSwitchDestination({ serverUserId: "srv_1", username: "martin" })).toBe(
      "/auth?resume=martin",
    );
  });

  it("a local-only profile goes straight home — there was never a session to restore", () => {
    expect(postSwitchDestination({ serverUserId: null, username: "local_test" })).toBe("/");
  });

  it("encodes usernames that aren't URL-safe on their own", () => {
    expect(postSwitchDestination({ serverUserId: "srv_1", username: "a b+c" })).toBe(
      "/auth?resume=a%20b%2Bc",
    );
  });
});
