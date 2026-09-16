import { test, expect, type Page } from "@playwright/test";

// ── Test data factories ───────────────────────────────────────────────────────

function makeMessage(id: string, relationshipId: string, patch: object = {}) {
  return {
    id,
    relationshipId,
    body: "Hey, how did the session go?",
    createdAtMs: Date.now() - 60_000,
    readAtMs: null,
    mine: false,
    synced: true,
    ...patch,
  };
}

// ── Seed helper ────────────────────────────────────────────────────────────────

async function seedThread(page: Page, messages: Record<string, object> = {}) {
  await page.addInitScript(
    ({ messages }) => {
      localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
      localStorage.setItem(
        "logit:tours:v1",
        JSON.stringify({ home: true, session: true, splits: true }),
      );
      localStorage.setItem("logit:coachMessages:v1", JSON.stringify(messages));
    },
    { messages },
  );
}

async function goToThread(page: Page, relationshipId: string, name?: string) {
  const qs = name ? `?name=${encodeURIComponent(name)}` : "";
  await page.goto(`/messages/${relationshipId}${qs}`);
  await page.waitForLoadState("networkidle");
}

// ── Thread view ───────────────────────────────────────────────────────────────

test.describe("message thread", () => {
  test("shows the empty state with no messages", async ({ page }) => {
    await seedThread(page, {});
    await goToThread(page, "rel-1", "Coach Sam");

    await expect(page.getByText("Coach Sam")).toBeVisible();
    await expect(page.getByText("No messages yet. Say hello 👋")).toBeVisible();
  });

  test("renders seeded messages from both sides in order", async ({ page }) => {
    await seedThread(page, {
      m1: makeMessage("m1", "rel-1", { body: "Hey, how did the session go?", createdAtMs: Date.now() - 120_000, mine: false }),
      m2: makeMessage("m2", "rel-1", { body: "Went great, hit a PR!", createdAtMs: Date.now() - 60_000, mine: true }),
    });
    await goToThread(page, "rel-1");

    const bubbles = page.locator("div.max-w-\\[80\\%\\]");
    await expect(bubbles).toHaveCount(2);
    await expect(bubbles.nth(0)).toContainText("Hey, how did the session go?");
    await expect(bubbles.nth(1)).toContainText("Went great, hit a PR!");
  });

  test("only shows messages for the given relationship", async ({ page }) => {
    await seedThread(page, {
      m1: makeMessage("m1", "rel-1", { body: "For rel-1" }),
      m2: makeMessage("m2", "rel-2", { body: "For rel-2" }),
    });
    await goToThread(page, "rel-1");

    await expect(page.getByText("For rel-1")).toBeVisible();
    await expect(page.getByText("For rel-2")).not.toBeVisible();
  });

  test("sending a message appends it optimistically and clears the draft", async ({ page }) => {
    await seedThread(page, {});
    await goToThread(page, "rel-1");

    const input = page.getByPlaceholder("Message…");
    await input.fill("On my way!");
    await page.locator('button[type="submit"]').click();

    await expect(page.getByText("On my way!")).toBeVisible();
    await expect(input).toHaveValue("");

    const raw = await page.evaluate(() => localStorage.getItem("logit:coachMessages:v1"));
    const stored = Object.values(JSON.parse(raw ?? "{}")) as { body: string; mine: boolean }[];
    expect(stored.some((m) => m.body === "On my way!" && m.mine)).toBe(true);
  });

  test("pressing Enter sends the message", async ({ page }) => {
    await seedThread(page, {});
    await goToThread(page, "rel-1");

    const input = page.getByPlaceholder("Message…");
    await input.fill("Quick question");
    await input.press("Enter");

    await expect(page.getByText("Quick question")).toBeVisible();
  });
});
