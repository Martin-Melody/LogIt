import { describe, expect, it } from "vitest";
import { clientCan, coachCan, offerStateNow, requestLine, type RequestOffer } from "./coachRequest";

const now = Date.UTC(2026, 11, 1);
const offer = (state: RequestOffer["state"], holdUntilMs = now + 86_400_000): RequestOffer => ({
  state, createdAt: "2026-11-30T00:00:00Z",
  card: { offerId: "o1", packageName: "Monthly", packageDescription: "", amountCents: 8000, currency: "eur", interval: "month",
    weeks: null, pays: true, holdUntilMs, startsOnMs: null, firstChargeOnMs: null },
});

describe("requests", () => {
  it("an open offer past its hold has run out", () => {
    expect(offerStateNow(offer("open"), now)).toBe("open");
    expect(offerStateNow(offer("open", now - 1), now)).toBe("expired");
    expect(offerStateNow(offer("withdrawn", now - 1), now)).toBe("withdrawn");
  });

  it("says where a request stands", () => {
    expect(requestLine("asked", null, now)).toBe("New");
    expect(requestLine("offered", offer("open"), now)).toBe("Offer sent");
    expect(requestLine("offered", offer("open", now - 1), now)).toBe("Offer ran out");
    expect(requestLine("asked", offer("withdrawn"), now)).toBe("Offer withdrawn");
    expect(requestLine("waiting", null, now)).toBe("Waiting list");
  });

  it("offers the coach only what fits the moment", () => {
    expect(coachCan("asked", null, now)).toMatchObject({ offer: true, editOffer: false, waitlist: true, notAFit: true, reopen: false });
    expect(coachCan("offered", offer("open"), now)).toMatchObject({ offer: false, editOffer: true, withdrawOffer: true });
    expect(coachCan("offered", offer("open", now - 1), now)).toMatchObject({ offer: true, offerAgain: true, withdrawOffer: false });
    expect(coachCan("notafit", null, now)).toMatchObject({ offer: false, notAFit: false, reopen: true });
  });

  it("lets the person take an open offer, leave a waiting list, or delete a closed request", () => {
    expect(clientCan("offered", offer("open"), now)).toMatchObject({ take: true, withdraw: true, reply: true });
    expect(clientCan("offered", offer("open", now - 1), now)).toMatchObject({ take: false, askAgain: true });
    expect(clientCan("waiting", null, now)).toMatchObject({ leaveWaitingList: true, withdraw: false });
    expect(clientCan("notafit", null, now)).toMatchObject({ delete: true, reply: false, take: false });
  });
});

describe("eventLine", () => {
  it("says each step for whoever reads it", async () => {
    const { eventLine } = await import("./coachRequest");
    expect(eventLine("offer", "client", "Sam Rowe", "Aoife Byrne")).toBe("Sam offered you a spot");
    expect(eventLine("offer", "coach", "Sam Rowe", "Aoife Byrne")).toBe("You offered Aoife a spot");
    expect(eventLine("waitlist", "client", "Sam Rowe", "Aoife")).toBe("You're on Sam's waiting list");
    expect(eventLine("withdrawn", "coach", "Sam", "Aoife")).toBe("Aoife withdrew their request");
  });
});

describe("sentLine", () => {
  it("says where a sent request stands", async () => {
    const { sentLine } = await import("./coachRequest");
    const now = Date.UTC(2026, 11, 1, 12);
    expect(sentLine({ requestedAt: "2026-11-28T10:00:00Z" }, now)).toBe("Request sent 3 days ago");
    expect(sentLine({ stage: "waiting", requestedAt: "2026-11-12T10:00:00Z", waitingSince: "2026-11-12T10:00:00Z", expectSpots: "January" }, now))
      .toBe("Waiting list since 12 Nov · spots in January");
    expect(sentLine({ stage: "offered", requestedAt: "2026-11-30T10:00:00Z", offer: offer("open") }, now)).toMatch(/^Offer to look at · held until /);
    expect(sentLine({ stage: "notafit", requestedAt: "2026-11-30T10:00:00Z", closed: true }, now)).toBe("Closed");
  });
});
