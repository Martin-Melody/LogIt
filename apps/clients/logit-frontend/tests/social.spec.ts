/**
 * Social redesign smoke test — requires the API running on :5118
 * (./scripts/run-api.sh, ideally with Deployment__SelfHosted=true).
 *
 *   npx playwright test social
 *
 * Registers two users via the API, seeds a follow + posts, then drives the
 * redesigned feed / post detail / notifications / moderation UI.
 */
import { test, expect, type Page } from "@playwright/test";

const API = "http://localhost:5118";
const PW = "TestPass123!";

const uniq = (p: string) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function register(username: string) {
  const res = await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email: `${username}@test.example`, password: PW, displayName: username }),
  });
  if (!res.ok) throw new Error(`register ${username} failed: ${res.status}`);
  return (await res.json()) as { accessToken: string; refreshToken: string; user: { id: string; username: string } };
}

const authed = (t: string) => ({ "Content-Type": "application/json", Authorization: `Bearer ${t}` });

async function asUser(page: Page, a: { accessToken: string; refreshToken: string; user: unknown }) {
  await page.addInitScript((auth) => {
    localStorage.clear();
    localStorage.setItem("logit:server:mode", "selfhosted");
    localStorage.setItem("logit:api:baseUrl", "http://localhost:5118");
    localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true, step: 0 }));
    localStorage.setItem("logit:auth:access", auth.accessToken);
    localStorage.setItem("logit:auth:refresh", auth.refreshToken);
    localStorage.setItem("logit:auth:user", JSON.stringify(auth.user));
  }, a);
}

test.describe("social redesign - requires API", () => {
  test("API is reachable", async () => {
    const res = await fetch(`${API}/health`).catch(() => null);
    expect(res?.ok, `API not reachable at ${API} — run ./scripts/run-api.sh`).toBeTruthy();
  });

  test("feed, post detail, notifications, report, block", async ({ page }) => {
    const alice = await register(uniq("soc_alice"));
    const bob = await register(uniq("soc_bob"));

    // bob follows alice; alice posts (text + PR); bob likes + comments -> alice gets notifications
    await fetch(`${API}/users/${alice.user.username}/follow`, { method: "POST", headers: authed(bob.accessToken) });
    const post = await (await fetch(`${API}/posts`, {
      method: "POST", headers: authed(alice.accessToken),
      body: JSON.stringify({ type: "Text", body: "redesigned feed smoke test" }),
    })).json();
    await fetch(`${API}/posts`, {
      method: "POST", headers: authed(alice.accessToken),
      body: JSON.stringify({ type: "PersonalRecord", body: "PR!", payloadJson: JSON.stringify({ exerciseName: "Squat", weight: 140, unit: "kg", reps: 3 }) }),
    });
    await fetch(`${API}/posts/${post.id}/like`, { method: "POST", headers: authed(bob.accessToken) });
    await fetch(`${API}/posts/${post.id}/comments`, {
      method: "POST", headers: authed(bob.accessToken), body: JSON.stringify({ body: "nice work" }),
    });

    // ---- Bob's feed: a real destination, shows Alice's posts ----
    await asUser(page, bob);
    await page.goto("/social");
    await expect(page.getByRole("heading", { name: "Feed" })).toBeVisible();
    await expect(page.getByText("redesigned feed smoke test")).toBeVisible();
    await expect(page.getByText("PERSONAL RECORD")).toBeVisible();
    // no back-arrow on the feed (it's a bottom-nav destination)
    await expect(page.locator("header").getByRole("button", { name: /back/i })).toHaveCount(0);

    // ---- Post detail via tapping the post body ----
    await page.getByText("redesigned feed smoke test").click();
    await expect(page).toHaveURL(new RegExp(`/social/post/${post.id}`));
    await expect(page.getByText("nice work")).toBeVisible();
    await expect(page.getByPlaceholder("Add a comment…")).toBeVisible();
    await page.goBack();

    // ---- Report sheet from the overflow menu ----
    const firstCard = page.locator("article").first();
    await firstCard.getByRole("button", { name: "More" }).click();
    await page.getByRole("button", { name: /Report post/i }).click();
    await expect(page.getByText("Why are you reporting this?")).toBeVisible();
    await page.getByText("Spam or scam").click();
    await page.getByRole("button", { name: "Submit report" }).click();
    await expect(page.getByText("Why are you reporting this?")).toHaveCount(0);

    // ---- Alice's notifications ----
    await page.context().clearCookies();
    await asUser(page, alice);
    await page.goto("/social/notifications");
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
    await expect(page.getByText(/liked your post/i)).toBeVisible();
    await expect(page.getByText(/commented on your post/i)).toBeVisible();
    await expect(page.getByText(/followed you/i)).toBeVisible();

    // ---- Alice blocks Bob -> Bob's feed loses Alice's posts ----
    await fetch(`${API}/users/${bob.user.username}/block`, { method: "POST", headers: authed(alice.accessToken) });
    await asUser(page, bob);
    await page.goto("/social");
    await expect(page.getByText("redesigned feed smoke test")).toHaveCount(0);
  });

  test("repost + quote: feed rendering, dedup guard, notifications", async ({ page }) => {
    const alice = await register(uniq("rp_alice"));
    const bob = await register(uniq("rp_bob"));
    await fetch(`${API}/users/${alice.user.username}/follow`, { method: "POST", headers: authed(bob.accessToken) });

    const original = await (await fetch(`${API}/posts`, {
      method: "POST", headers: authed(alice.accessToken),
      body: JSON.stringify({
        type: "PersonalRecord", body: "new squat PR",
        payloadJson: JSON.stringify({ exerciseName: "Squat", weight: 150, unit: "kg", reps: 1 }),
      }),
    })).json();

    // ---- Plain repost: a new Text row that carries no payload of its own ----
    const repost = await (await fetch(`${API}/posts/${original.id}/repost`, {
      method: "POST", headers: authed(bob.accessToken), body: JSON.stringify({ body: null }),
    })).json();
    expect(repost.type).toBe("Text");
    expect(repost.payloadJson).toBeNull();
    expect(repost.repostOf.id).toBe(original.id);

    // ---- One plain repost per post ----
    const dup = await fetch(`${API}/posts/${original.id}/repost`, {
      method: "POST", headers: authed(bob.accessToken), body: JSON.stringify({ body: null }),
    });
    expect(dup.status).toBe(409);

    // ---- Quote repost: your commentary + the original as a nested card ----
    const quote = await (await fetch(`${API}/posts/${original.id}/repost`, {
      method: "POST", headers: authed(bob.accessToken), body: JSON.stringify({ body: "huge lift @" + alice.user.username }),
    })).json();
    expect(quote.body).toContain("huge lift");
    expect(quote.repostOf.id).toBe(original.id);

    // ---- Bob's own feed shows both, and the reposted PR still renders as a PR card ----
    await asUser(page, bob);
    await page.goto("/social");
    await expect(page.getByText("You reposted")).toBeVisible();
    await expect(page.getByText("huge lift", { exact: false })).toBeVisible();
    await expect(page.getByText("PERSONAL RECORD").first()).toBeVisible();

    // ---- Alice is notified for the repost, the quote, and the mention inside the quote ----
    await page.context().clearCookies();
    await asUser(page, alice);
    await page.goto("/social/notifications");
    await expect(page.getByText(/reposted your post/i)).toBeVisible();
    await expect(page.getByText(/quoted your post/i)).toBeVisible();

    // ---- Quoting a plain repost attributes to the original, not the empty repost row ----
    const requote = await (await fetch(`${API}/posts/${repost.id}/repost`, {
      method: "POST", headers: authed(alice.accessToken), body: JSON.stringify({ body: "quoting the repost" }),
    })).json();
    expect(requote.repostOf.id).toBe(original.id);
  });
});
