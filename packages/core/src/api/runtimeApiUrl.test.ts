import { describe, expect, it } from "vitest";
import { runtimeApiUrl } from "./client";

describe("runtimeApiUrl", () => {
  const page = { protocol: "http:", hostname: "192.168.1.10" };

  it("is null when the dashboard's server named no API", () => {
    expect(runtimeApiUrl(undefined, page)).toBeNull();
    expect(runtimeApiUrl("", page)).toBeNull();
  });

  it("takes a full address as given, without a trailing slash", () => {
    expect(runtimeApiUrl("https://logit-api.example.org/", page)).toBe("https://logit-api.example.org");
  });

  it("reads :port as this page's host on that port", () => {
    expect(runtimeApiUrl(":8080", page)).toBe("http://192.168.1.10:8080");
  });
});
