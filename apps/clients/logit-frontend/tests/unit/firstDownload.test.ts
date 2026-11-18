// What Home and Nutrition show about the account's data right after signing in.
import { describe, expect, it } from "vitest";
import { firstDownloadState } from "$lib/sync/firstDownload";

const base = { signedIn: true, syncs: true, downloadedAt: 0, running: false, failed: false };

describe("firstDownloadState", () => {
  it("is loading until the first download lands, including before the sync starts", () => {
    expect(firstDownloadState(base)).toBe("loading");
    expect(firstDownloadState({ ...base, running: true })).toBe("loading");
  });

  it("is failed when the sync couldn't get the data, and loading again while retrying", () => {
    expect(firstDownloadState({ ...base, failed: true })).toBe("failed");
    expect(firstDownloadState({ ...base, failed: true, running: true })).toBe("loading");
  });

  it("is nothing once the data is here, signed out, or on a plan that doesn't sync", () => {
    expect(firstDownloadState({ ...base, downloadedAt: 1 })).toBeNull();
    expect(firstDownloadState({ ...base, downloadedAt: 1, failed: true })).toBeNull();
    expect(firstDownloadState({ ...base, signedIn: false })).toBeNull();
    expect(firstDownloadState({ ...base, syncs: false })).toBeNull();
  });
});
