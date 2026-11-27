// Plays every web walkthrough chapter start to finish on a fresh Pro account and a fresh
// Studio account (with the sandbox's sample clients), doing each "do" step for real. If a
// page changes so a step's mark, its signal or its flow no longer works, this fails.
// With DOCS_SCREENSHOTS_DIR set, each step is also saved as a screenshot for the docs.
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PRO_CHAPTERS, STUDIO_CHAPTERS } from "@logit/core/guide/walkthroughs";
import { sampleHistory } from "@logit/core/guide/sandbox";
import { sessionDto } from "@logit/core/api/syncDtos";
import type { Chapter } from "@logit/core/guide/types";

const API = process.env.E2E_API_URL ?? "http://127.0.0.1:5118";
const ADMIN_KEY = process.env.E2E_ADMIN_KEY ?? "";
const SHOTS = process.env.DOCS_SCREENSHOTS_DIR;
const PASSWORD = "Passw0rd!long";

/** For steps whose target only appears after you've changed something: make the change. */
const PREPARE: Record<string, (page: Page) => Promise<void>> = {
  "plan.saved": async (p) => {
    if (!(await p.locator('[data-guide="plan-save"]').isVisible())) await p.getByRole("button", { name: "+ New split" }).click();
  },
  "program.saved": (p) => p.locator('[data-guide="program-editor"] input').first().fill("Beginner full body"),
  // Swap lists show the exercises in your programs: a new coach's program may be empty, so add one.
  "swap.added": async (p) => {
    const lists = p.locator('[data-guide="swap-lists"]');
    await expect(lists).toBeVisible();
    if (await lists.getByRole("button", { name: "+ Swap" }).count()) return;
    await p.goto("/coaching/programs");
    await p.locator('[data-guide="programs-library"] a, [data-guide="programs-assign"]').first().click();
    await p.waitForURL(/[?&]id=/);
    const editor = p.locator('[data-guide="program-editor"]');
    await editor.getByRole("button", { name: /^\+ Add to/ }).click();
    await p.locator("#add-to-day-search").fill("Bench");
    await p.getByRole("dialog").getByRole("checkbox").first().click();
    await p.getByRole("dialog").getByRole("button", { name: "Add", exact: true }).click();
    await expect(editor.getByRole("list", { name: "Blocks" }).locator("button[aria-expanded]").first()).toBeVisible();
    await p.goto("/coaching/programs?tab=swaps");
    await expect(lists.getByRole("button", { name: "+ Swap" }).first()).toBeVisible();
  },
};

/** What a person does to finish each "do" step, by the signal it waits for. */
const ACTIONS: Record<string, (page: Page) => Promise<void>> = {
  "overview.edit-opened": (p) => p.locator('[data-guide="overview-edit"]').click(),
  "plan.saved": (p) => p.locator('[data-guide="plan-save"]').getByRole("button", { name: "Save" }).click(),
  "goal.saved": async (p) => {
    await p.locator('[data-guide="habits-new-goal"]').click();
    await p.getByRole("button", { name: /Number of workouts/ }).click();
    await p.locator("#goal-count").fill("20");
    await p.getByRole("button", { name: "Add goal" }).click();
  },
  "chart.builder-opened": (p) => p.locator('[data-guide="insights-new-chart"]').click(),
  "chart.lift-added": async (p) => {
    await p.getByLabel("Add a lift").fill("Bench");
    await p.locator('[data-guide="chart-for"] li button').first().click();
  },
  "chart.saved": (p) => p.locator('[data-guide="chart-save"]').click(),
  "social.discover-opened": (p) => p.locator('[data-guide="social-tabs"]').getByRole("tab", { name: "Discover" }).click(),
  "plugins.mine-opened": (p) => p.getByRole("tab", { name: /My plugins/ }).click(),
  "link.created": async (p) => {
    await p.locator('[data-guide="links-new"]').click();
    await p.getByRole("dialog").getByPlaceholder("Instagram bio").fill("Instagram bio");
    await p.getByRole("dialog").getByRole("button", { name: "Create link" }).click();
  },
  "request.offered": async (p) => {
    await p.locator('[data-guide="requests-pane"]').getByRole("button", { name: "Offer a spot" }).click();
    await p.getByRole("dialog").getByRole("button", { name: "Send offer" }).click();
  },
  "client.opened": async (p) => {
    const list = p.locator('[data-guide="clients-list"]');
    const conor = list.getByRole("link", { name: /Conor/ });
    await ((await conor.count()) ? conor.first() : list.getByRole("link").first()).click();
  },
  "client.tab-checkins": (p) => p.locator('[data-guide="client-tabs"]').getByRole("tab", { name: /Check-ins/ }).click(),
  "checkin-form.added": async (p) => {
    const box = p.locator('[data-guide="client-forms"]');
    const first = box.getByRole("button", { name: "Send LogIt's weekly check-in" });
    if (await first.count()) return first.click();
    await box.getByRole("button", { name: "Send a form" }).click();
    await p.getByRole("dialog").getByRole("button", { name: /^Send to / }).click();
  },
  "checkin.reviewed": async (p) => {
    await p.locator("#reply").fill("Good week. Swap squats for leg press until the knee settles.");
    // "Send and go to {next}" when more are waiting (canvas K4).
    await p.getByRole("button", { name: /^Send and (mark reviewed|go to )/ }).click();
  },
  "program.created": (p) => p.locator('[data-guide="programs-new"]').click(),
  "program.saved": (p) => p.locator('[data-guide="program-save"]').click(),
  "program.assigned": async (p) => {
    // On the list the mark is the first program: open it, then its Assign….
    if (!/[?&]id=/.test(p.url())) {
      await p.locator('[data-guide="programs-assign"]').first().click();
      await p.waitForURL(/[?&]id=/);
    }
    await p.getByRole("button", { name: "Assign…" }).click();
    await expect(p.getByRole("dialog", { name: /^Assign (?!to a client)/ })).toBeVisible();
    const dialog = p.getByRole("dialog", { name: /^Assign (?!to a client)/ });
    // "Add a client" is our own Select: open it, then pick Niamh if she's listed.
    await dialog.getByRole("button", { name: "Add a client" }).or(dialog.getByRole("combobox", { name: "Add a client" })).first().click();
    const niamh = p.getByRole("option", { name: /Niamh/ });
    // Niamh if she's joined by now, else whoever's first.
    if (await niamh.count()) await niamh.first().click();
    else await p.getByRole("option").first().click();
    await dialog.getByRole("button", { name: "Assign", exact: true }).click();
  },
  "swap.added": async (p) => {
    await p.locator('[data-guide="swap-lists"]').getByRole("button", { name: "+ Swap" }).first().click();
    await p.locator("#swap-list-add").fill("Dumbbell");
    await p.locator("#swap-list-add").press("Enter");
  },
  "message.sent": async (p) => {
    await p.locator('[data-guide="message-compose"] textarea').fill("How's the knee this week?");
    await p.locator('[data-guide="message-compose"]').getByRole("button", { name: "Send", exact: true }).click();
  },
};

test("every step that waits for you has an action in this test", () => {
  const signals = [...PRO_CHAPTERS, ...STUDIO_CHAPTERS].flatMap((c) => c.steps).filter((s) => s.on === "web" && s.kind === "do").map((s) => s.signal!);
  expect(signals.filter((s) => !ACTIONS[s])).toEqual([]);
});

async function signUp(request: APIRequestContext, prefix: string, tier: "Pro" | "Studio") {
  const username = `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const res = await request.post(`${API}/auth/register`, {
    data: { username, email: `${username}@example.com`, password: PASSWORD, displayName: prefix === "wtpro" ? "Dara" : "Alex" },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = await res.json();
  if (ADMIN_KEY) {
    const set = await request.patch(`${API}/admin/api/users/${body.user.id}`, { headers: { "X-Admin-Key": ADMIN_KEY }, data: { tier } });
    expect(set.ok(), await set.text()).toBeTruthy();
  }
  return { username, token: body.accessToken as string };
}

async function signIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Username or email").fill(username);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: /Guide/ })).toBeVisible({ timeout: 30_000 });
}

async function play(page: Page, chapter: Chapter) {
  await page.goto(`/?guide=${chapter.id}`);
  const practise = page.getByRole("dialog", { name: "Practise on sample clients", exact: true });
  const steps = chapter.steps.filter((s) => s.on === "web");
  for (const [i, step] of steps.entries()) {
    const pop = page.getByRole("dialog", { name: step.title, exact: true });
    await expect(pop.or(practise)).toBeVisible({ timeout: 30_000 });
    if (await practise.isVisible()) {
      await practise.getByRole("button", { name: /^Start$/ }).click();
      await expect(pop).toBeVisible({ timeout: 60_000 });
    }
    if (step.kind === "do" && PREPARE[step.signal!]) await PREPARE[step.signal!](page);
    if (step.target) {
      // A step that waits for a sample client gets time for them to act.
      await expect(page.locator(`[data-guide="${step.target}"]`).first()).toBeVisible({ timeout: step.arrives ? 45_000 : 15_000 });
    }
    await expect(pop.getByText("isn't showing right now")).toHaveCount(0);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${chapter.id}--${step.id}.jpg`, type: "jpeg", quality: 80 });
    if (step.kind === "do") await ACTIONS[step.signal!](page);
    else await pop.getByRole("button", { name: i === steps.length - 1 ? "Finish chapter" : "Next" }).click();
    await expect(pop).toBeHidden({ timeout: 15_000 });
  }
}

test.describe("Pro walkthrough", () => {
  test("every chapter plays through on a Pro account with synced workouts", async ({ page, request }) => {
    const { username, token } = await signUp(request, "wtpro", "Pro");
    // Four weeks of workouts, as if logged on the phone.
    const sessions = sampleHistory("conor", Date.now()).sessions.map(sessionDto);
    const pushed = await request.post(`${API}/sync/sessions`, { headers: { Authorization: `Bearer ${token}` }, data: { sessions } });
    expect(pushed.ok(), await pushed.text()).toBeTruthy();
    // The phone's profile, as the app pushes it after its first sync (goals are saved into it).
    const profile = await request.post(`${API}/sync/profile`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        displayName: "Dara", bio: "", avatarDataUrl: null, progressPhotoDataUrl: null, height: null, heightUnit: "cm",
        weight: 71.8, weightUnit: "kg", blocksCollapsedByDefault: false, restDefaultsJson: "{}", navConfigJson: null,
        homeConfigJson: null, activeSplitId: null, updatedAtMs: Date.now(),
      },
    });
    expect(profile.ok(), await profile.text()).toBeTruthy();
    await signIn(page, username);
    for (const chapter of PRO_CHAPTERS) await test.step(chapter.title, () => play(page, chapter));
  });
});

test.describe("Studio walkthrough", () => {
  test("every chapter plays through with sample clients", async ({ page, request }) => {
    const { username } = await signUp(request, "wtcoach", "Studio");
    await signIn(page, username);
    for (const chapter of STUDIO_CHAPTERS) await test.step(chapter.title, () => play(page, chapter));
  });
});
