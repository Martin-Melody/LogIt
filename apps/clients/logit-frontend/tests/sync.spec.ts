/**
 * Sync API contract tests.
 *
 * These tests specify the expected behaviour of the /sync endpoints.
 * Every test here defines a rule the server MUST honour — a failure means
 * there is a bug in the server, not in the test.
 *
 * All tests require a live API at localhost:5118. Run the API before running
 * this suite. Each test registers a fresh account and cleans it up after.
 */

import { test, expect } from "@playwright/test";

const API_BASE = "http://localhost:5118";

// ── Helpers ───────────────────────────────────────────────────────────────────

type AuthTokens = { accessToken: string; refreshToken: string };

async function register(suffix: string): Promise<AuthTokens> {
  const username = `sync_${suffix}_${Date.now()}`;
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      email: `${username}@test.example`,
      password: "TestPass123!",
      displayName: username,
    }),
  });
  if (!res.ok) throw new Error(`register failed: ${res.status}`);
  return res.json();
}

async function deleteAccount(accessToken: string): Promise<void> {
  await fetch(`${API_BASE}/auth/account`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    // Every account this helper deletes was created by register() above with this password.
    body: JSON.stringify({ password: "TestPass123!" }),
  }).catch(() => {});
}

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
}

function makeSessionPayload(id: string, startedAtMs: number) {
  const session = { id, startedAtMs, blocks: [] };
  return { id, startedAtMs, dataJson: JSON.stringify(session) };
}

function makeSplitPayload(id: string, updatedAtMs: number) {
  const split = { id, name: "Test Split", updatedAtMs, days: [] };
  return { id, updatedAtMs, dataJson: JSON.stringify(split) };
}

function makeExercisePayload(id: string, createdAtMs: number) {
  const exercise = { id, name: "Test Exercise", createdAtMs, isCore: false };
  return { id, createdAtMs, dataJson: JSON.stringify(exercise) };
}

// ── Prerequisite ──────────────────────────────────────────────────────────────

test.describe("sync API — requires live API", () => {
  test("API is reachable", async () => {
    const res = await fetch(`${API_BASE}/health`).catch(() => null);
    expect(res?.ok, `API not reachable at ${API_BASE} — start the server first`).toBeTruthy();
  });

  // ── Sessions ────────────────────────────────────────────────────────────────

  test.describe("sessions", () => {
    let tokens: AuthTokens;

    test.beforeEach(async () => { tokens = await register("sess"); });
    test.afterEach(async () => { await deleteAccount(tokens.accessToken); });

    test("pushing a session stores it on the server", async () => {
      const session = makeSessionPayload("sess-abc", Date.now());

      const pushRes = await fetch(`${API_BASE}/sync/sessions`, {
        method: "POST",
        headers: authHeaders(tokens.accessToken),
        body: JSON.stringify({ sessions: [session] }),
      });
      expect(pushRes.status).toBe(204);

      // Pull it back with since=0 to confirm it's stored
      const pullRes = await fetch(`${API_BASE}/sync/sessions?since=0`, {
        headers: authHeaders(tokens.accessToken),
      });
      expect(pullRes.ok).toBeTruthy();
      const { sessions } = await pullRes.json();
      expect(sessions.some((s: { id: string }) => s.id === "sess-abc")).toBe(true);
    });

    test("pushing the same session twice does not create a duplicate", async () => {
      const session = makeSessionPayload("sess-dup", Date.now());

      await fetch(`${API_BASE}/sync/sessions`, {
        method: "POST",
        headers: authHeaders(tokens.accessToken),
        body: JSON.stringify({ sessions: [session] }),
      });
      await fetch(`${API_BASE}/sync/sessions`, {
        method: "POST",
        headers: authHeaders(tokens.accessToken),
        body: JSON.stringify({ sessions: [session] }),
      });

      const pullRes = await fetch(`${API_BASE}/sync/sessions?since=0`, {
        headers: authHeaders(tokens.accessToken),
      });
      const { sessions } = await pullRes.json();
      const matches = sessions.filter((s: { id: string }) => s.id === "sess-dup");
      expect(matches).toHaveLength(1);
    });

    test("pull with since timestamp only returns sessions started after that time", async () => {
      const past = Date.now() - 10_000;
      const future = Date.now() + 10_000;

      await fetch(`${API_BASE}/sync/sessions`, {
        method: "POST",
        headers: authHeaders(tokens.accessToken),
        body: JSON.stringify({
          sessions: [
            makeSessionPayload("sess-old", past),
            makeSessionPayload("sess-new", future),
          ],
        }),
      });

      // Pull with since = now — only the future-dated one should come back
      const since = Date.now();
      const pullRes = await fetch(`${API_BASE}/sync/sessions?since=${since}`, {
        headers: authHeaders(tokens.accessToken),
      });
      const { sessions } = await pullRes.json();

      const ids = sessions.map((s: { id: string }) => s.id);
      expect(ids).not.toContain("sess-old");
      expect(ids).toContain("sess-new");
    });

    test("pushing an empty sessions array returns 204 without error", async () => {
      const res = await fetch(`${API_BASE}/sync/sessions`, {
        method: "POST",
        headers: authHeaders(tokens.accessToken),
        body: JSON.stringify({ sessions: [] }),
      });
      expect(res.status).toBe(204);
    });

    test("sessions from one user are not visible to another", async () => {
      const other = await register("sess_other");
      try {
        await fetch(`${API_BASE}/sync/sessions`, {
          method: "POST",
          headers: authHeaders(tokens.accessToken),
          body: JSON.stringify({ sessions: [makeSessionPayload("sess-private", Date.now())] }),
        });

        const pullRes = await fetch(`${API_BASE}/sync/sessions?since=0`, {
          headers: authHeaders(other.accessToken),
        });
        const { sessions } = await pullRes.json();
        expect(sessions.some((s: { id: string }) => s.id === "sess-private")).toBe(false);
      } finally {
        await deleteAccount(other.accessToken);
      }
    });

    test("pull requires authentication", async () => {
      const res = await fetch(`${API_BASE}/sync/sessions?since=0`);
      expect(res.status).toBe(401);
    });

    test("push requires authentication", async () => {
      const res = await fetch(`${API_BASE}/sync/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessions: [] }),
      });
      expect(res.status).toBe(401);
    });
  });

  // ── Splits ──────────────────────────────────────────────────────────────────

  test.describe("splits", () => {
    let tokens: AuthTokens;

    test.beforeEach(async () => { tokens = await register("split"); });
    test.afterEach(async () => { await deleteAccount(tokens.accessToken); });

    test("pushing a split stores it on the server", async () => {
      const split = makeSplitPayload("split-abc", Date.now());

      await fetch(`${API_BASE}/sync/splits`, {
        method: "POST",
        headers: authHeaders(tokens.accessToken),
        body: JSON.stringify({ splits: [split] }),
      });

      const pullRes = await fetch(`${API_BASE}/sync/splits?since=0`, {
        headers: authHeaders(tokens.accessToken),
      });
      const { splits } = await pullRes.json();
      expect(splits.some((s: { id: string }) => s.id === "split-abc")).toBe(true);
    });

    test("pushing a newer version of a split overwrites the stored one", async () => {
      const id = "split-conflict";
      const original = makeSplitPayload(id, 1000);
      const updated = { ...makeSplitPayload(id, 2000), dataJson: JSON.stringify({ id, name: "Updated", updatedAtMs: 2000, days: [] }) };

      await fetch(`${API_BASE}/sync/splits`, {
        method: "POST",
        headers: authHeaders(tokens.accessToken),
        body: JSON.stringify({ splits: [original] }),
      });

      await fetch(`${API_BASE}/sync/splits`, {
        method: "POST",
        headers: authHeaders(tokens.accessToken),
        body: JSON.stringify({ splits: [updated] }),
      });

      const pullRes = await fetch(`${API_BASE}/sync/splits?since=0`, {
        headers: authHeaders(tokens.accessToken),
      });
      const { splits } = await pullRes.json();
      const match = splits.find((s: { id: string }) => s.id === id);
      expect(match).toBeDefined();
      const parsed = JSON.parse(match.dataJson);
      expect(parsed.name).toBe("Updated");
    });

    test("pushing an older version of a split does not overwrite the stored one", async () => {
      const id = "split-stale";
      const newer = makeSplitPayload(id, 2000);
      const older = { ...makeSplitPayload(id, 500), dataJson: JSON.stringify({ id, name: "Stale", updatedAtMs: 500, days: [] }) };

      await fetch(`${API_BASE}/sync/splits`, {
        method: "POST",
        headers: authHeaders(tokens.accessToken),
        body: JSON.stringify({ splits: [newer] }),
      });

      await fetch(`${API_BASE}/sync/splits`, {
        method: "POST",
        headers: authHeaders(tokens.accessToken),
        body: JSON.stringify({ splits: [older] }),
      });

      const pullRes = await fetch(`${API_BASE}/sync/splits?since=0`, {
        headers: authHeaders(tokens.accessToken),
      });
      const { splits } = await pullRes.json();
      const match = splits.find((s: { id: string }) => s.id === id);
      const parsed = JSON.parse(match.dataJson);
      // The server must not overwrite with the older payload
      expect(parsed.name).not.toBe("Stale");
    });

    test("pull with since only returns splits updated after that time", async () => {
      const past = Date.now() - 10_000;
      const future = Date.now() + 10_000;

      await fetch(`${API_BASE}/sync/splits`, {
        method: "POST",
        headers: authHeaders(tokens.accessToken),
        body: JSON.stringify({
          splits: [
            makeSplitPayload("split-old", past),
            makeSplitPayload("split-new", future),
          ],
        }),
      });

      const since = Date.now();
      const pullRes = await fetch(`${API_BASE}/sync/splits?since=${since}`, {
        headers: authHeaders(tokens.accessToken),
      });
      const { splits } = await pullRes.json();

      const ids = splits.map((s: { id: string }) => s.id);
      expect(ids).not.toContain("split-old");
      expect(ids).toContain("split-new");
    });

    test("splits from one user are not visible to another", async () => {
      const other = await register("split_other");
      try {
        await fetch(`${API_BASE}/sync/splits`, {
          method: "POST",
          headers: authHeaders(tokens.accessToken),
          body: JSON.stringify({ splits: [makeSplitPayload("split-private", Date.now())] }),
        });

        const pullRes = await fetch(`${API_BASE}/sync/splits?since=0`, {
          headers: authHeaders(other.accessToken),
        });
        const { splits } = await pullRes.json();
        expect(splits.some((s: { id: string }) => s.id === "split-private")).toBe(false);
      } finally {
        await deleteAccount(other.accessToken);
      }
    });
  });

  // ── Exercises ────────────────────────────────────────────────────────────────

  test.describe("exercises", () => {
    let tokens: AuthTokens;

    test.beforeEach(async () => { tokens = await register("ex"); });
    test.afterEach(async () => { await deleteAccount(tokens.accessToken); });

    test("pushing a custom exercise stores it on the server", async () => {
      const exercise = makeExercisePayload("ex-abc", Date.now());

      await fetch(`${API_BASE}/sync/exercises`, {
        method: "POST",
        headers: authHeaders(tokens.accessToken),
        body: JSON.stringify({ exercises: [exercise] }),
      });

      const pullRes = await fetch(`${API_BASE}/sync/exercises?since=0`, {
        headers: authHeaders(tokens.accessToken),
      });
      const { exercises } = await pullRes.json();
      expect(exercises.some((e: { id: string }) => e.id === "ex-abc")).toBe(true);
    });

    test("pushing the same exercise twice does not create a duplicate", async () => {
      const exercise = makeExercisePayload("ex-dup", Date.now());

      await fetch(`${API_BASE}/sync/exercises`, {
        method: "POST",
        headers: authHeaders(tokens.accessToken),
        body: JSON.stringify({ exercises: [exercise] }),
      });
      await fetch(`${API_BASE}/sync/exercises`, {
        method: "POST",
        headers: authHeaders(tokens.accessToken),
        body: JSON.stringify({ exercises: [exercise] }),
      });

      const pullRes = await fetch(`${API_BASE}/sync/exercises?since=0`, {
        headers: authHeaders(tokens.accessToken),
      });
      const { exercises } = await pullRes.json();
      const matches = exercises.filter((e: { id: string }) => e.id === "ex-dup");
      expect(matches).toHaveLength(1);
    });

    test("pull with since only returns exercises created after that time", async () => {
      const past = Date.now() - 10_000;
      const future = Date.now() + 10_000;

      await fetch(`${API_BASE}/sync/exercises`, {
        method: "POST",
        headers: authHeaders(tokens.accessToken),
        body: JSON.stringify({
          exercises: [
            makeExercisePayload("ex-old", past),
            makeExercisePayload("ex-new", future),
          ],
        }),
      });

      const since = Date.now();
      const pullRes = await fetch(`${API_BASE}/sync/exercises?since=${since}`, {
        headers: authHeaders(tokens.accessToken),
      });
      const { exercises } = await pullRes.json();

      const ids = exercises.map((e: { id: string }) => e.id);
      expect(ids).not.toContain("ex-old");
      expect(ids).toContain("ex-new");
    });

    test("exercises from one user are not visible to another", async () => {
      const other = await register("ex_other");
      try {
        await fetch(`${API_BASE}/sync/exercises`, {
          method: "POST",
          headers: authHeaders(tokens.accessToken),
          body: JSON.stringify({ exercises: [makeExercisePayload("ex-private", Date.now())] }),
        });

        const pullRes = await fetch(`${API_BASE}/sync/exercises?since=0`, {
          headers: authHeaders(other.accessToken),
        });
        const { exercises } = await pullRes.json();
        expect(exercises.some((e: { id: string }) => e.id === "ex-private")).toBe(false);
      } finally {
        await deleteAccount(other.accessToken);
      }
    });
  });

  // ── Profile ──────────────────────────────────────────────────────────────────

  test.describe("profile", () => {
    let tokens: AuthTokens;

    test.beforeEach(async () => { tokens = await register("profile"); });
    test.afterEach(async () => { await deleteAccount(tokens.accessToken); });

    function makeProfile(displayName: string, updatedAtMs: number) {
      return {
        displayName,
        bio: "",
        avatarDataUrl: null,
        height: null,
        heightUnit: "cm",
        weight: null,
        weightUnit: "kg",
        blocksCollapsedByDefault: false,
        restDefaultsJson: "{}",
        updatedAtMs,
      };
    }

    test("pushing a profile stores it and pull returns it", async () => {
      await fetch(`${API_BASE}/sync/profile`, {
        method: "POST",
        headers: authHeaders(tokens.accessToken),
        body: JSON.stringify(makeProfile("Martin", Date.now())),
      });

      const pullRes = await fetch(`${API_BASE}/sync/profile`, {
        headers: authHeaders(tokens.accessToken),
      });
      expect(pullRes.ok).toBeTruthy();
      const { profile } = await pullRes.json();
      expect(profile?.displayName).toBe("Martin");
    });

    test("pushing a newer profile overwrites the stored one", async () => {
      const now = Date.now();

      await fetch(`${API_BASE}/sync/profile`, {
        method: "POST",
        headers: authHeaders(tokens.accessToken),
        body: JSON.stringify(makeProfile("OldName", now - 1000)),
      });

      await fetch(`${API_BASE}/sync/profile`, {
        method: "POST",
        headers: authHeaders(tokens.accessToken),
        body: JSON.stringify(makeProfile("NewName", now)),
      });

      const pullRes = await fetch(`${API_BASE}/sync/profile`, {
        headers: authHeaders(tokens.accessToken),
      });
      const { profile } = await pullRes.json();
      expect(profile?.displayName).toBe("NewName");
    });

    test("pushing an older profile does not overwrite the stored one", async () => {
      const now = Date.now();

      await fetch(`${API_BASE}/sync/profile`, {
        method: "POST",
        headers: authHeaders(tokens.accessToken),
        body: JSON.stringify(makeProfile("CurrentName", now)),
      });

      await fetch(`${API_BASE}/sync/profile`, {
        method: "POST",
        headers: authHeaders(tokens.accessToken),
        body: JSON.stringify(makeProfile("StaleName", now - 5000)),
      });

      const pullRes = await fetch(`${API_BASE}/sync/profile`, {
        headers: authHeaders(tokens.accessToken),
      });
      const { profile } = await pullRes.json();
      // Must not overwrite with the stale name
      expect(profile?.displayName).toBe("CurrentName");
    });

    test("pull returns null profile when none has been pushed", async () => {
      const pullRes = await fetch(`${API_BASE}/sync/profile`, {
        headers: authHeaders(tokens.accessToken),
      });
      expect(pullRes.ok).toBeTruthy();
      const { profile } = await pullRes.json();
      expect(profile).toBeNull();
    });

    test("profile requires authentication", async () => {
      const res = await fetch(`${API_BASE}/sync/profile`);
      expect(res.status).toBe(401);
    });
  });
});
