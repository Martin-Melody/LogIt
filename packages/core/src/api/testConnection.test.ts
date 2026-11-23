import { describe, expect, it } from "vitest";
import { normalizeServerUrl } from "./testConnection";

describe("normalizeServerUrl", () => {
  it("adds https:// to an address typed without it", () => {
    expect(normalizeServerUrl("logit-api.example.org")).toBe("https://logit-api.example.org");
    expect(normalizeServerUrl("  logit.example.org/ ")).toBe("https://logit.example.org");
  });
  it("keeps a scheme that's there, and drops trailing slashes", () => {
    expect(normalizeServerUrl("http://192.168.1.5:8080//")).toBe("http://192.168.1.5:8080");
    expect(normalizeServerUrl("HTTPS://logit.example.org")).toBe("HTTPS://logit.example.org");
  });
});
