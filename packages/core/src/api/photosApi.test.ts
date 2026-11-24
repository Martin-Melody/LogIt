import { beforeEach, describe, expect, it, vi } from "vitest";

const upload = vi.fn();
vi.mock("./client", () => {
  class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); }
  }
  return { ApiError, apiBaseUrl: () => "https://api.example.org", apiClient: { fetch: (...a: unknown[]) => upload(...a) } };
});

import { ApiError } from "./client";
import { photoSrc, publishPhoto } from "./photosApi";

const picture = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  clear: () => store.clear(),
} as unknown as Storage;

beforeEach(() => {
  localStorage.clear();
  upload.mockReset();
  globalThis.fetch = vi.fn(async () => new Response(new Blob(["x"]))) as typeof fetch;
});

describe("photos", () => {
  it("loads server photos from the server and leaves other addresses alone", () => {
    expect(photoSrc("/photos/abc")).toBe("https://api.example.org/photos/abc");
    expect(photoSrc(picture)).toBe(picture);
    expect(photoSrc(null)).toBeUndefined();
  });

  it("uploads a picture once and reuses its address", async () => {
    upload.mockResolvedValue({ url: "/photos/1" });
    expect(await publishPhoto(picture)).toBe("/photos/1");
    expect(await publishPhoto(picture)).toBe("/photos/1");
    expect(upload).toHaveBeenCalledTimes(1);
    expect(await publishPhoto("/photos/2")).toBe("/photos/2");
    expect(await publishPhoto(null)).toBeNull();
  });

  it("sends the picture itself to an older server, and fails on anything else", async () => {
    upload.mockRejectedValueOnce(new ApiError(404, "Not found"));
    expect(await publishPhoto(picture)).toBe(picture);
    upload.mockRejectedValueOnce(new ApiError(429, "Too many"));
    await expect(publishPhoto(picture)).rejects.toThrow("Too many");
  });
});
