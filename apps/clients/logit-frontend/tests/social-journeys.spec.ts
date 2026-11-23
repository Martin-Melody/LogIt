/**
 * Social journeys from docs/testing-social.md that broke in bug hunt round 5, with two people
 * side by side. Requires the API on :5118, like social.spec.ts.
 */
import { test, expect, type Browser, type Page } from "@playwright/test";

const API = "http://localhost:5118";
const PW = "TestPass123!";
const uniq = (p: string) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

type Auth = { accessToken: string; refreshToken: string; user: { id: string; username: string } };

async function register(prefix: string): Promise<Auth> {
  const username = uniq(prefix);
  const res = await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email: `${username}@test.example`, password: PW, displayName: username }),
  });
  if (!res.ok) throw new Error(`register ${username} failed: ${res.status}`);
  return res.json();
}

const call = (a: Auth, method: string, path: string, body?: unknown) =>
  fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${a.accessToken}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** A phone-sized browser of its own, signed in as `a`. */
async function phoneFor(browser: Browser, a: Auth): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const page = await ctx.newPage();
  await page.addInitScript((auth) => {
    localStorage.clear();
    localStorage.setItem("logit:server:mode", "selfhosted");
    localStorage.setItem("logit:api:baseUrl", "http://localhost:5118");
    localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true, step: 0 }));
    localStorage.setItem("logit:auth:access", auth.accessToken);
    localStorage.setItem("logit:auth:refresh", auth.refreshToken);
    localStorage.setItem("logit:auth:user", JSON.stringify(auth.user));
  }, a);
  return page;
}

/** Opens `path` and closes any feature tour that pops up over it. */
async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  for (let i = 0; i < 10; i++) {
    const tour = page.locator("#driver-popover-content");
    if (!(await tour.count())) break;
    await tour.getByRole("button", { name: /Next|Got it/ }).first().click();
  }
}

test.describe("social journeys - requires API", () => {
  test("a comment shows up on a notifications page that's already open", async ({ browser }) => {
    test.setTimeout(90_000);
    const ava = await register("sj_ava");
    const ben = await register("sj_ben");
    const post = await (await call(ava, "POST", "/posts", { type: "Text", body: "squat day" })).json();

    const page = await phoneFor(browser, ava);
    await open(page, "/inbox");
    await expect(page.getByText("No notifications yet.")).toBeVisible();

    await call(ben, "POST", `/posts/${post.id}/comments`, { body: "nice one" });
    // The badge store checks every 20 s; the open page reloads its list when it goes up.
    await expect(page.getByText(/commented on your post/)).toBeVisible({ timeout: 45_000 });
  });

  test("their profile says they follow you, with Follow back", async ({ browser }) => {
    const ava = await register("sj_ava");
    const ben = await register("sj_ben");
    await call(ben, "POST", `/users/${ava.user.username}/follow`);

    const page = await phoneFor(browser, ava);
    await open(page, `/social/${ben.user.username}`);
    await expect(page.getByText("Follows you")).toBeVisible();
    await expect(page.getByRole("button", { name: /Follow back/ })).toBeVisible();
  });

  test("search shows Requested for a private account already asked", async ({ browser }) => {
    const cara = await register("sj_cara");
    const ben = await register("sj_ben");
    await call(cara, "PUT", "/users/me/social-settings", { isPrivate: true });
    await call(ben, "POST", `/users/${cara.user.username}/follow`);

    const page = await phoneFor(browser, ben);
    await open(page, "/social");
    await page.getByRole("button", { name: "Search people" }).click();
    await page.getByPlaceholder(/Search by username/).fill(cara.user.username);
    await expect(page.getByRole("button", { name: "Requested" }).last()).toBeVisible();
  });

  test("the comment menu opens above the bottom bar", async ({ browser }) => {
    const ava = await register("sj_ava");
    const ben = await register("sj_ben");
    const post = await (await call(ava, "POST", "/posts", { type: "Text", body: "deadlift pr" })).json();
    await call(ben, "POST", `/posts/${post.id}/comments`, { body: "huge" });

    const page = await phoneFor(browser, ben);
    await open(page, `/social/post/${post.id}`);
    const comment = page.getByText("huge", { exact: true });
    await expect(comment).toBeVisible();
    const box = (await comment.boundingBox())!;
    await page.mouse.move(box.x + 5, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(800);
    await page.mouse.up();

    // Tappable, not covered by the bar (Playwright refuses to click a covered button).
    await page.getByRole("button", { name: "Delete comment" }).click({ timeout: 5_000 });
  });
});
