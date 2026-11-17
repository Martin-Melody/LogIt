/**
 * Sharing an algorithm built from blocks: as a code pasted anywhere (no account), and as a
 * post a follower can add a copy of (needs the API on :5118, like social.spec.ts).
 */
import { test, expect, type Page } from "@playwright/test";

const API = "http://localhost:5118";
const PW = "TestPass123!";
const uniq = (p: string) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

const RECIPE = {
  id: "rcpp_share",
  name: "Top and back-offs",
  weightFrom: "estimate",
  repsInReserve: 0,
  setLayout: "topBackoff",
  increment: 2.5,
  whenStalled: "deload",
  sets: { mode: "weekly", count: 3 },
  food: "ignore",
  createdAtMs: 1,
  updatedAtMs: 2,
};

async function seed(page: Page, opts: { recipe: boolean; auth?: { accessToken: string; refreshToken: string; user: unknown } }) {
  await page.addInitScript(
    ({ recipe, withRecipe, auth }) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.clear();
      localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true, step: 0 }));
      localStorage.setItem("logit:tours:v1", JSON.stringify({ home: true, session: true, splits: true }));
      if (withRecipe) localStorage.setItem("logit:progression:recipes:v1", JSON.stringify({ [recipe.id]: recipe }));
      if (auth) {
        localStorage.setItem("logit:server:mode", "selfhosted");
        localStorage.setItem("logit:api:baseUrl", "http://localhost:5118");
        localStorage.setItem("logit:auth:access", auth.accessToken);
        localStorage.setItem("logit:auth:refresh", auth.refreshToken);
        localStorage.setItem("logit:auth:user", JSON.stringify(auth.user));
      }
    },
    { recipe: RECIPE, withRecipe: opts.recipe, auth: opts.auth ?? null },
  );
}

const recipesStored = (page: Page) => page.evaluate(() => localStorage.getItem("logit:progression:recipes:v1") ?? "");

test("share a built algorithm as a code and add it back from the code", async ({ page }) => {
  await seed(page, { recipe: true });
  await page.goto(`/settings/progression/build/${RECIPE.id}`);
  await page.getByRole("button", { name: "Share" }).click();
  // No account, so it goes straight to the code.
  const message = (await page.getByTestId("share-code").textContent()) ?? "";
  expect(message).toContain("Settings › Progression › Add from a code");
  expect(message).toMatch(/logit-alg1:[A-Za-z0-9_-]+/);
  await page.keyboard.press("Escape");

  await page.goto("/settings#sec-progression");
  await page.getByRole("button", { name: "Add from a code" }).click();
  await page.getByTestId("recipe-code-input").fill("not a code");
  await expect(page.getByText("That isn't a LogIt algorithm code")).toBeVisible();
  await page.getByTestId("recipe-code-input").fill(`Try this one\n${message}`);
  await expect(page.getByTestId("recipe-blocks")).toContainText("Top set + back-offs");
  await page.getByRole("button", { name: "Add to my algorithms" }).click();
  await expect.poll(() => recipesStored(page)).toContain("Top and back-offs (2)");
});

test.describe("sharing to the feed - requires API", () => {
  async function register(username: string) {
    const res = await fetch(`${API}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email: `${username}@test.example`, password: PW, displayName: username }),
    });
    if (!res.ok) throw new Error(`register ${username} failed: ${res.status}`);
    return (await res.json()) as { accessToken: string; refreshToken: string; user: { id: string; username: string } };
  }

  test("a follower sees the blocks and adds a copy", async ({ browser }) => {
    const alice = await register(uniq("alg_alice"));
    const bob = await register(uniq("alg_bob"));

    const a = await browser.newPage();
    await seed(a, { recipe: true, auth: alice });
    await a.goto(`/settings/progression/build/${RECIPE.id}`);
    await a.getByRole("button", { name: "Share" }).click();
    await a.getByRole("button", { name: /Post to your feed/ }).click();
    await a.getByPlaceholder("What's on your mind?").fill("What I run on bench");
    const posted = a.waitForResponse((r) => r.url().endsWith("/posts") && r.request().method() === "POST");
    await a.getByRole("button", { name: "Post", exact: true }).click();
    const post = await (await posted).json();
    const payload = JSON.parse(post.payloadJson);
    expect(payload.recipe).toMatchObject({ name: "Top and back-offs", setLayout: "topBackoff" });
    expect(payload.recipe).not.toHaveProperty("id");
    await a.close();

    const b = await browser.newPage();
    await seed(b, { recipe: false, auth: bob });
    await b.goto(`/social/post/${post.id}/content`);
    await expect(b.getByTestId("recipe-blocks")).toContainText("Top set + back-offs");
    await b.getByRole("button", { name: "Add to my algorithms" }).click();
    await expect.poll(() => recipesStored(b)).toContain("Top and back-offs");
    await b.close();
  });
});
