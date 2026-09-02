# Plugin Bundle Format

Logit community plugins are installed as two parts:

1. a manifest, which describes identity, distribution, and capabilities
2. a bundle, which provides the executable entry point

The bundle is a JavaScript module that exports a `pluginBundle` descriptor with
`formatVersion: 1`.

## Execution model

At install time the bundle is fetched **once**, verified against the manifest's
`integrity` hash (`sha256-<base64>`), and its source text stored locally — it
runs offline afterwards and updates are an explicit, reviewable action.

All pure-function families — `progression-algorithm`, `analytics`,
`nutrition-algorithm`, `nutrition-analytics` — run inside an **interpreter
sandbox** (QuickJS-WASM): a bare ES2020 environment with no DOM, no `fetch`, no
storage, no timers. The plugin receives a frozen JSON input and must return a
JSON-serialisable value within a hard wall-clock deadline (~300 ms). A fresh VM
per call means no state leaks between runs — persist state through the
contract's `nextState` (progression), never in a module-level variable.

Because the sandbox has no module loader, **a bundle must be a single file with
no `import` statements** (build with esbuild `--bundle --format=esm`). Top-level
`export const` / `export function` / `export default` are supported.

`widget` bundles export a `compute(input) => WidgetView` — a pure function, run
in the same sandbox. The plugin declares `needs: [...]` (which data slices the
host loads) and returns a declarative view built from a fixed primitive
vocabulary (`text`, `stat-grid`, `list`, `progress-rings`, `bar`, `line`,
`muscle-map`, `calendar-heatmap`, `button-row`). No markup, no components — see
`@logit/core/plugins/widgetView`. Actions are a host allow-list (`navigate`,
`startEmptyWorkout`, …), so a widget can't navigate or run arbitrary code.
`static/sample-plugins/week-recap` is a full example.

There is no longer any `import(url)` of remote code — every family runs in the
QuickJS sandbox.

## Required contract

```ts
export const pluginBundle = {
  formatVersion: 1,
  pluginId: "com.example.my-widget",
  family: "widget",
  entryExport: "default",
} as const;
```

The declared `pluginId` and `family` must match the installed manifest.
`entryExport` points to the actual executable export inside the module.

## Widget bundles

For widget plugins, `entryExport` can point to either:

- a Svelte component export
- an object export with a `renderHtml()` method

The app will host `renderHtml()` bundles inside a generic widget shell.

```ts
export const pluginBundle = {
  formatVersion: 1,
  pluginId: "com.example.my-widget",
  family: "widget",
  entryExport: "widget",
} as const;

export const widget = {
  renderHtml() {
    return "<div>Hello from a sample widget</div>";
  },
};
```

## Progression bundles

For progression algorithm plugins, `entryExport` should point to an object that
implements the progression algorithm contract.

```ts
export const pluginBundle = {
  formatVersion: 1,
  pluginId: "com.example.linear-plus",
  family: "progression-algorithm",
  entryExport: "algorithm",
} as const;

export const algorithm = {
  id: "com.example.linear-plus",
  name: "Linear Plus",
  description: "A community progression algorithm.",
  defaultState: {},
  suggest(input) {
    return { sets: [], nextState: input.state };
  },
};
```

## Nutrition algorithm bundles

For nutrition algorithm plugins (`family: "nutrition-algorithm"`), `entryExport`
points to an object implementing `computeTargets(input)` — it turns a goal plus
the user's real data into a daily calorie target.

```ts
export const pluginBundle = {
  formatVersion: 1,
  pluginId: "com.example.pure-trend",
  family: "nutrition-algorithm",
  entryExport: "algorithm",
} as const;

export const algorithm = {
  id: "com.example.pure-trend",
  name: "Pure Trend",
  description: "Sets the target from intake vs. weight trend.",
  // optional: defaultPreferences + preferencesSchema (same field shape as
  // progression algorithms — the app renders a settings screen)
  computeTargets(input) {
    // input: { goal, currentWeightKg, weightEntries, dailyIntakeKcal, userPreferences, now }
    return { kcal: 2000, sourceLabel: "Trend" };
    // may also return: macros, maintenanceKcal, notes
  },
};
```

The app owns two things the algorithm does not: a manual calorie override on the
goal (always wins), and deriving macros from the goal's protein g/kg + fat % when
the algorithm returns only `kcal`. Return `kcal: 0` to signal "not enough data".

See `apps/clients/logit-frontend/static/sample-plugins/pure-trend/` for a full example.

## Nutrition analytics bundles

For nutrition analytics plugins (`family: "nutrition-analytics"`), `entryExport`
points to an object with `metricDefinitions` and `compute(input)` — the same
shape as the workout analytics contract.

```ts
export const pluginBundle = {
  formatVersion: 1,
  pluginId: "com.example.weekly-recap",
  family: "nutrition-analytics",
  entryExport: "analytics",
} as const;

export const analytics = {
  id: "com.example.weekly-recap",
  name: "Weekly recap",
  description: "…",
  metricDefinitions: [{ id: "avgKcal", label: "Avg calories", unit: "kcal" }],
  compute(input) {
    // input: { days, weightEntries, goal, targets, range, now }
    return { metrics: [], series: [], insights: [] };
  },
};
```

## Compatibility

The app still tolerates legacy bundles that export `widget`, `algorithm`, or
`default` directly. New community bundles should use `pluginBundle` so the app
can validate the contract before enabling the plugin.
