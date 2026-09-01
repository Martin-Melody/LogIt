# Plugin Architecture

Status: design doc. Supersedes the original phased roadmap on `feat/plugin-foundation-ui`.

**Build progress**: Phases 1–3 merged to `main` — trust model (Restricted Mode + `integrity`),
exercise packs end to end (incl. "export as pack" via the `inline` distribution origin),
multi-source static registry. **Phase 4 in progress** (branch `feat/plugin-sandbox`):
QuickJS-WASM interpreter sandbox + `progression-algorithm` routed through it
(fetch → hash-verify → store bundle at install; `suggest()` runs in a fresh VM with a
wall-clock deadline). Remaining pure-function families + widgets are Phase 5+.

## Goal

Let the community build and share extensions to Logit:

- exercise packs / food packs (data)
- progression algorithms
- nutrition algorithms (goal + weight trend + intake → calorie target)
- workout + nutrition analytics modules (weekly recaps, adherence, custom insights)
- home widgets

...without compromising the three hard constraints Logit is built on:

1. **Offline-first.** A plugin must keep working with zero network access after it
   is installed. Installation may require network; *running* an installed plugin
   must not.
2. **User-owned data.** A plugin must never be able to exfiltrate the user's
   workout, nutrition, or PT data, or their sync credentials.
3. **Self-host / hosted parity.** The same client code runs in both. Discovery and
   publishing may differ; the install + execution model may not.

## What already exists (as of this doc)

- `apps/clients/logit-frontend/src/lib/plugins/`
  - `types.ts` — `PluginManifest`, `PluginCapability` per family, `PluginDistribution`
    (`builtin | manual | url | activitypub`), `InstalledPlugin`.
  - `discovery.ts` — resolves a manifest from a raw URL, a pasted JSON blob, or an
    ActivityPub actor (crawls the outbox for manifest URLs). Manifest shape
    validation.
  - `catalog.ts` — install state in `localStorage` (`logit:plugins:installed:v1`),
    builtin-manifest synthesis from the local registries, home-widget slot sync.
  - `bundle.ts` — validates a `pluginBundle` contract object on the loaded module
    (shape check only, **not** a security boundary).
  - `runtime.ts` — **loads bundles with `import(/* @vite-ignore */ url)` at
    runtime** and merges installed algorithms/analytics/widgets into the builtin
    registries.
  - `registry.ts`, `publish.ts`, `publishQueue.ts` — early publish workflow.
- Routes: `/plugins`, `/plugins/browse`, `/plugins/import`, `/plugins/publish`,
  `/plugins/[id]`.
- Sample plugins in `static/sample-plugins/` — `focus-card` (widget), `linear-plus`
  (progression), `pure-trend` (nutrition-algorithm) — plus a `registry.json`.
- Bundle format: `docs/plugin-bundle-format.md`.

### The gap

The runtime does `import(url)` on a remote bundle on every load. That is arbitrary
remote code execution in the app origin — full access to `localStorage`, the SQLite
DB, sync tokens, the DOM, and the network. On web it is XSS-as-a-feature; on
Capacitor it also reaches native bridges. It also violates constraint 1 (a network
fetch on every page load) and risks Apple guideline 2.5.2 (downloading code that
changes app behavior).

Closing this gap is the whole job. Everything below is organised around it.

## The three execution tiers

The plugin families split cleanly into three tiers. Each tier gets a different
storage model, a different sandbox, and a different authoring story. **Do not build
one mechanism for all of them.**

| Tier | Families | Payload | Sandbox | Authoring |
|---|---|---|---|---|
| **Content** | `exercise-pack`, `food-pack` (new), `split-pack` (new) | Pure JSON | None — it is not code | In-app "export as pack" |
| **Pure function** | `progression-algorithm`, `nutrition-algorithm`, `analytics`, `nutrition-analytics` | JS module, `(input) => output`, deterministic, no I/O | Interpreter sandbox (see below) | Template repo + build step, or a formula DSL |
| **UI** | `widget` | `compute(input) => WidgetView` — a pure function returning a declarative view tree | Same interpreter sandbox as pure-function tier | Same as pure-function tier, plus an end-user widget builder |

Why this works: the pure-function contracts are *already* pure —
`suggest(input)`, `computeTargets(input)`, `compute(input)`. They need no access to
storage, network, or the DOM. The host passes a frozen input, the plugin returns a
structured-clone-able result under a hard timeout. That is the entire API surface.

**Widgets collapse into the pure-function tier** once you split "compute" from
"render" — see Decision 4. This is a change from the earlier plan, which treated
widgets as a separate, harder problem needing an iframe. They aren't, as long as
the plugin returns a *description* of what to show rather than markup.

## Decision 1 — Trust model: install, hash, run locally

**Bundles are installed, never streamed.**

On install:

1. Fetch the bundle once.
2. Hash it (SHA-256) and compare against `manifest.integrity`. Reject on mismatch.
3. Store the **bundle source text** locally (same storage tier as the install
   record; on native this can be the filesystem, on web `localStorage`/IndexedDB).
4. From then on, execute **only the local copy**. Never re-fetch to run.

Updates are an explicit user action: the app may check a registry for a newer
`version`, but installing it is a reviewable step ("v1.3.0 available — changelog,
new integrity hash") not a silent swap.

Manifest additions:

```jsonc
{
  // ...existing fields...
  "integrity": "sha256-<base64>",   // required for non-builtin bundle families
  "signature": "<detached sig>",     // optional; registry-issued, phase 5
  "minAppVersion": "1.4.0",          // compatibility gate
  "engine": "quickjs-1"              // which sandbox the bundle targets
}
```

Remove live `import(url)` from `runtime.ts`. The runtime loads from the stored
source string via the sandbox, not the network.

## Decision 2 — The sandbox for pure-function plugins

Two viable engines. **This is the main open call.**

### Option A — Web Worker (lighter, ships sooner, residual risk)

Run the bundle in a dedicated Worker with a restrictive CSP. Pros: no new
dependency, familiar, fast to build. Cons: a Worker still has `fetch`,
`IndexedDB`, WebSockets, timers — you are relying on CSP + code review + the
absence of secrets in the Worker scope, not on a hard boundary. Behavior can drift
between web and the Capacitor WebView.

### Option B — QuickJS compiled to WASM (recommended)

Feed the plugin **source as a string** to a QuickJS-WASM interpreter (~1 MB, e.g.
`quickjs-emscripten`). The plugin gets a pure ES2020 environment: no DOM, no
`fetch`, no storage, no timers unless the host injects them. Identical behavior on
web, iOS, and Android. Cleanly satisfies Apple 2.5.2 (fully sandboxed interpreted
code that cannot change the app's primary purpose). Cons: ~1 MB WASM payload, more
integration work, need to marshal input/output across the boundary (JSON only).

**Recommendation: Option B**, if the plugin system is meant to be a real
differentiator rather than a liability. Pick A only if the timeline forces it, and
treat it as provisional.

Sandbox contract, either way:

- Input is frozen and passed by value (structured clone / JSON).
- Output must be JSON-serializable; anything else is a plugin error.
- Hard wall-clock timeout (e.g. 100 ms for `suggest`, 500 ms for analytics over a
  range). Timeout = plugin disabled with a surfaced error, never a hang.
- No host callbacks in v1. If a plugin needs reference data (exercise catalog,
  food DB rows), the host puts it *in the input*.
- Plugins are **stateless**. Progression "state" is already threaded through the
  contract (`defaultState` → `nextState`); the host persists it. Keep that pattern
  for every family that needs memory. Plugin-owned persistence, if it ever exists,
  is a host-owned namespaced KV store that syncs as opaque blobs and is deleted on
  uninstall.

## Decision 3 — Discovery is a static file

A **registry is a JSON document** — an array of manifests (or an ActivityPub
outbox). No server compute. This maps onto the existing hosting split:

- The app ships with a **default registry URL** baked in — a static
  `registry.json` on Cloudflare Pages (`registry.logit.ie` or similar).
- Settings → **"Add registry URL"**. Self-hosters point at their own or add
  community registries. Multiple registries merge in the browse view, tagged by
  source.
- **Install-by-URL and install-by-pasted-JSON always work** with no registry
  involved at all.
- The `activitypub` discovery adapter (already written) stays as an *optional*
  extra source, not the primary path.

Self-host vs hosted:

- The official curated registry, moderation, and trust badges are a **hosted**
  concern. Self-hosters consume the official registry read-only with no account
  (same reasoning as the free social tier).
- **Publishing to the official registry requires a hosted account.** That is the
  moderation leverage — consistent with the "registered federation" stance in the
  cloud/social plan. Self-hosters and independents publish by hosting their own
  registry JSON or opening a PR against the registry repo.

## Decision 4 — Widgets: split compute from render

The earlier plan treated widgets as the hard tier needing an iframe. They don't,
if the plugin returns a **declarative view** instead of markup.

### The current widget contract (to be replaced)

`renderHtml() => string`, injected with `{@html}` in `WidgetHost.svelte`. Three
problems: it is a raw XSS injection point if the bundle is untrusted; it depends
on Tailwind classes surviving the app's CSS purge (a plugin using a class the app
doesn't use elsewhere gets no styles); and it can't reach host components (shadcn
`Card`, the theme tokens, the muscle-map SVG).

### The replacement: `compute(input) => WidgetView`

A widget plugin is a **pure function**, sandboxed exactly like an analytics
plugin. It receives the data it declared it needs and returns a view tree built
from a **fixed primitive vocabulary the host knows how to render**:

```ts
export const widget = {
  // declares which read-only data slices the host must load into `input`
  needs: ["workouts", "exercises"],
  compute(input) {
    // input: { workouts, exercises, nutrition?, bodyweight?, range, now, prefs }
    const sets = countSetsPerMuscle(input.workouts, input.exercises, input.range);
    return {
      title: "Muscle Focus",
      subtitle: "Sets logged this week",
      body: { kind: "muscle-map", values: sets, scale: [0, 5, 12] },
      // optional: tapping the widget navigates somewhere host-approved
      action: { navigate: "/progress/muscles" },
    };
  },
};
```

Primitive vocabulary (host-rendered, themed, accessible, offline): `stat-grid`,
`bar`, `line`, `sparkline`, `progress-ring`, `calendar-heatmap`, `heatmap`,
`muscle-map`, `list`, `table`, `text`, `button` (with an action from a fixed
allow-list). Every current builtin widget maps onto this set:

| Builtin widget | Primitives |
|---|---|
| Muscle Focus / heat map | `muscle-map` |
| Weight Trend | `line` + `sparkline` |
| Activity Tracker | `calendar-heatmap` |
| Today's Nutrition | `progress-ring` ×N |
| Last Session | `stat-grid` + `list` |
| Today's Plan | `list` |
| Progression | `list` / `text` |
| Quick Start | `button` ×N |

Benefits: automatic theme + dark-mode match, accessibility handled once by the
host, no iframe (real cost on a mobile home screen with several widgets), no
sanitiser dependency, works identically web + native, and the plugin is
~40 lines of pure computation.

Cost: a plugin can only compose primitives the host ships. A genuinely novel
visualisation needs the host to add that primitive first. This is the same
tradeoff Apple WidgetKit and Android's Glance make — home-screen widgets get a
constrained view vocabulary, never arbitrary code — and it is the right tradeoff.

### The iframe escape hatch — later, if ever

For visualisations the primitives can't express, a `render` family variant could
give the plugin a sandboxed `iframe` (`srcdoc`, `sandbox="allow-scripts"`, CSP
`default-src 'none'`), data in via `postMessage`, theme vars injected by the
host. Defer this. Ship the declarative model first; add the escape hatch only if
real demand shows the vocabulary is too narrow.

### Yes — the muscle heat map still works as a community plugin

Under this model it is a `compute` function that counts sets per muscle group
from `input.workouts` + `input.exercises` and returns
`{ body: { kind: "muscle-map", values } }`. `muscle-map` becomes a host
primitive (the `body-muscles` dependency already exists). The plugin never
touches a repo, the DOM, or the network. It is a good Phase 4 pilot precisely
because it exercises the compute/view split end to end.

## Authoring — no online editor required (build it in tiers)

1. **Content packs** — reuse the existing CRUD UI. Add "Export my custom
   exercises / foods as a pack": the user curates a list, gets a
   `manifest.json` + data file, hosts it anywhere or submits it. Near-zero build
   cost, big adoption lever, no execution risk. **This is the starting point.**
2. **Formula-level schemes** — a constrained JSON rule format or a small
   expression builder ("add 2.5 kg when all sets hit the top of the rep range").
   Covers ~80% of progression / nutrition-algorithm demand with no code and no
   sandbox.
3. **End-user widget builder** — pick a data source, a metric, and a primitive
   (`line`, `bar`, `stat-grid`, `muscle-map`…), get a widget on the home screen.
   Produces a declarative `WidgetView` spec with **no code at all** — same output
   shape a `compute` plugin returns, just built by a form. This is the "custom
   widgets for everyone" path and it rides entirely on Decision 4's vocabulary.
4. **Real code plugins** — a `create-logit-plugin` GitHub template: esbuild →
   one ESM file exporting `pluginBundle`. Local dev by pointing the app at
   `http://localhost:5173/bundle.js` (dev-mode override that skips the hash
   check). Publishing = PR to the registry repo (GitHub does moderation + hosting
   for free at first).
5. **Web editor** — Monaco + in-browser esbuild + live preview against sample
   data. Entirely client-side, hostable as static content. Genuinely nice,
   explicitly **last**, blocks nothing.

## Phased plan

### Phase 1 — Trust model (foundation)

- `integrity` / `minAppVersion` / `engine` manifest fields + validation.
- Install flow downloads the bundle, verifies the hash, stores the source text.
- `runtime.ts` executes stored source, not a live URL. Delete `import(url)`.
- Update-check + reviewable update flow (version compare against registry).
- Uninstall removes stored source + any host-held plugin state.

Deliverable: no plugin code path touches the network at run time.

### Phase 2 — Content packs end to end

- `exercise-pack` install → merges into the exercise catalog, offline, removable.
- New `food-pack` family for nutrition, same shape.
- "Export as pack" from the custom-exercise and custom-food UIs.
- Browse + detail + install/uninstall UI polished for the no-code case.

Deliverable: a user can build a pack in-app, share the file, and another user can
install it with no server involved. Exercises the whole
manifest/registry/install/offline pipeline with zero sandbox risk.

### Phase 3 — Static registry

- `registry.json` schema + a static deploy on Cloudflare Pages.
- Default registry URL baked into the client.
- "Add registry URL" in settings; multi-registry merge in browse.
- Publishing v0: PR to the registry repo, with a manifest linter in CI.

Deliverable: discovery works for self-host and hosted from the same static file.

### Phase 4 — One pure-function family through the real sandbox

- Decide Worker vs QuickJS-WASM (Decision 2).
- Implement the sandbox host: frozen input, JSON output, timeout, error surface.
- Pilot with `progression-algorithm` — smallest pure function, existing
  `linear-plus` sample, crisp input/output.
- Fallback: plugin unavailable / invalid / timed out → app uses a builtin, shows
  why.

Deliverable: a community progression algorithm runs sandboxed, offline, with no
access to storage or network.

### Phase 5 — Widgets (compute/view split) + remaining pure-function families

- Define the `WidgetView` primitive vocabulary + host renderers (Decision 4).
- Replace `renderHtml()` / `WidgetHost.svelte` with `compute(input) => WidgetView`.
- Port the builtin widgets onto the vocabulary (proves it covers real cases).
- Pilot a community widget: the muscle heat map as a sandboxed `compute` plugin.
- `nutrition-algorithm`, `analytics`, `nutrition-analytics` through the same
  sandbox (contracts are already the right shape).
- Registry-issued `signature` field + verification.
- Trust badges (verified author, install count, reported), moderation queue on the
  hosted registry.
- Formula DSL as a no-code authoring path for the algorithm families.

### Phase 6 — End-user builders + the iframe escape hatch

- **Widget builder UI** — form-driven `WidgetView` construction, no code.
- Only if demand shows the vocabulary is too narrow: a `render`-variant widget
  family with a sandboxed `iframe` + `postMessage` + injected theme.

### Phase 7 — Web editor + richer federation

- Client-side plugin playground (Monaco + esbuild + sample-data preview).
- ActivityPub plugin actor, announcement posts, update notifications from
  federated sources (build on the existing `discovery.ts` adapter).

## Open questions

- ~~**Sandbox engine**~~ — **decided: QuickJS-WASM** (`quickjs-emscripten`),
  2026-09-01. Hard boundary, identical web/iOS/Android, clean for Apple 2.5.2.
  The WASM + Capacitor wiring needs on-device verification.
- **Registry hosting** — dedicated `registry.logit.ie` static site vs a
  `registry.json` in a public GitHub repo consumed via raw URL / Pages (the
  Obsidian model).
- **Signing** — is registry-issued signing worth it in Phase 5, or does
  hash + curated-registry + open-source-bundle cover the threat model?
- **Widget vocabulary scope** — how many primitives to ship in Phase 5 before the
  "add a primitive" friction pushes toward the iframe escape hatch.

## Prior art — Obsidian

Obsidian is the closest working model: same shape (Electron desktop + Capacitor
mobile), Core plugins vs Community plugins, a thriving ecosystem (2000+), and it
ships community plugins on both app stores. Worth copying deliberately, and worth
being clear about where Logit should diverge.

### The app-store question is solved

What Apple 2.5.2 and Google Play actually permit is **interpreted JavaScript
running in the system WebView** — not "dynamic code" in general. Play's rule
explicitly exempts "code that runs in a virtual machine or an interpreter where
either provides indirect access to Android APIs (such as JavaScript in a
webview)." Apple's carve-out: interpreted code is fine if it does not change the
app's *primary purpose* and is not a storefront for *native* code. Obsidian
mobile has shipped under this since 2021. Conditions Logit must keep:

- Plugin code is JS in the WebView runtime (a Worker or QuickJS-WASM both qualify).
- Extensibility is part of the *advertised* purpose, so plugins don't change it.
- No payment flow for plugins (also matches the existing Apple 3.1.1 no-IAP note).
- Opt-in by default, like Obsidian's Restricted Mode.

### Logit's ask is *less* intrusive than an Obsidian plugin

Obsidian community plugins have **no sandbox** — full DOM, network (`requestUrl`
bypasses CORS), the whole vault filesystem, they monkey-patch app internals, Node
on desktop. Obsidian *can't* sandbox because their plugins do deep UI integration
(commands, ribbon icons, settings tabs, editor extensions, custom views).

Every Logit code-plugin type is a **pure function** — progression, nutrition,
analytics, and (post Decision 4) widgets all take data and return data. That is
why Logit *can* sandbox where Obsidian can't, and can offer a stronger safety
story while giving up almost nothing.

### Copy from Obsidian

- Registry = a JSON file in a public GitHub repo; PR to submit; **first
  submission human-reviewed, updates not re-reviewed** (author pushes a GitHub
  release, users get an update prompt). Scales to thousands with ~no infra.
- Plugins are GitHub releases — author owns distribution, the registry only
  indexes; offline-after-install falls out for free.
- Restricted Mode default-on, explicit opt-in, blunt warning dialog.
- `minAppVersion` in the manifest.
- Open-source by strong convention, not enforced.

### Diverge from Obsidian

- **Sandbox the code path.** Cheap for Logit (pure-function surface), impossible
  for Obsidian. Fitness history + sync tokens justify it.
- **Content packs are pure data**, not code — a whole class of zero-risk plugins
  Obsidian has no equivalent for.
- **Widgets are declarative** (Decision 4), not arbitrary rendering — this is the
  one place Obsidian took the unsandboxed path and Logit deliberately doesn't.
