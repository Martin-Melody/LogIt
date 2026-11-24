import { describe, expect, it, vi } from "vitest";
vi.mock("./client", () => ({ apiBaseUrl: () => "https://api.getlogit.app", apiClient: { fetch: vi.fn() } }));
import { inviteLink, parseInvite } from "./friendsApi";

describe("invite links", () => {
  it("round-trips the code, and the server when it isn't getlogit.app", () => {
    const hosted = inviteLink("abcd2345wxyz", "https://api.getlogit.app");
    expect(hosted).toBe("https://getlogit.app/f#logit-fr1:abcd2345wxyz");
    expect(parseInvite(hosted)).toEqual({ code: "abcd2345wxyz", server: "https://api.getlogit.app" });

    const own = inviteLink("abcd2345wxyz", "http://192.168.1.20:8080/");
    expect(parseInvite(`Join me on LogIt ${own} see you there`)).toEqual({ code: "abcd2345wxyz", server: "http://192.168.1.20:8080" });
    expect(parseInvite("logit://f?c=logit-fr1:abcd2345wxyz")?.code).toBe("abcd2345wxyz");
    expect(parseInvite("https://getlogit.app/f#")).toBeNull();
  });
});
