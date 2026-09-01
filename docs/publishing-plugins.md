# Publishing a Logit plugin

This is the author-facing guide. For the architecture see `plugin-roadmap.md`;
for the bundle contract see `plugin-bundle-format.md`.

## What a plugin is

A plugin is **a manifest plus one artifact**:

| Family | Artifact | Runs as |
|---|---|---|
| `exercise-pack` | `exercises.json` (data) | not code — merged into the catalogue |
| `progression-algorithm` | `bundle.js` | `suggest(input)` in the sandbox |
| `analytics` | `bundle.js` | `compute(input)` in the sandbox |
| `nutrition-algorithm` | `bundle.js` | `computeTargets(input)` in the sandbox |
| `nutrition-analytics` | `bundle.js` | `compute(input)` in the sandbox |
| `widget` | `bundle.js` | legacy loader (migrating — see roadmap) |

Code runs in a QuickJS-WASM sandbox: **no DOM, no `fetch`, no storage, no
timers**, a frozen JSON input, a JSON-serialisable return, a ~300 ms deadline,
a fresh VM per call. Persist nothing in module scope — thread state through the
contract's `nextState` (progression only).

## Building a bundle

A bundle is **one JavaScript file with no `import` statements** — the sandbox
has no module loader. Write TypeScript if you like, then:

```sh
npx esbuild src/index.ts --bundle --format=esm --outfile=bundle.js
```

It must export a `pluginBundle` descriptor and one entry:

```ts
export const pluginBundle = {
  formatVersion: 1,
  pluginId: "com.you.my-algorithm",   // must match the manifest id
  family: "progression-algorithm",
  entryExport: "algorithm",
} as const;

export const algorithm = {
  id: "com.you.my-algorithm",
  name: "My Algorithm",
  description: "...",
  defaultState: {},
  suggest(input) {
    // input: ProgressionInput  (see @logit/core/domain/progression)
    return { sets: [{ reps: 8, weight: 20 }], nextState: input.state };
  },
};
```

`analytics` / `nutrition-analytics` also export `metricDefinitions: [...]`.
`nutrition-algorithm` / progression may export `preferencesSchema` +
`defaultPreferences` — the app then renders a settings screen.

## The manifest

```jsonc
{
  "id": "com.you.my-algorithm",
  "family": "progression-algorithm",
  "name": "My Algorithm",
  "description": "One sentence.",
  "version": "1.0.0",                    // semver; bump on every change
  "author": "You",
  "integrity": "sha256-…",              // hash of the artifact, see below
  "minAppVersion": "1.4.0",             // optional
  "distribution": {
    "origin": "url",
    "manifestUrl": "plugins/my-algorithm/manifest.json",
    "bundleUrl": "plugins/my-algorithm/bundle.js"
  },
  "capabilities": [
    { "family": "progression-algorithm", "algorithmId": "com.you.my-algorithm" }
  ]
}
```

The capability's id field (`algorithmId` / `analyticsId` / `exercisePackId` /
`widgetId`) must equal the manifest `id`.

Generate the integrity hash:

```sh
printf 'sha256-%s\n' "$(openssl dgst -sha256 -binary bundle.js | openssl base64)"
```

The app re-computes this on install and refuses a mismatch. Regenerate it every
time the artifact changes.

## Exercise packs

No manifest hand-writing needed for the common case: build a pack in the app
(**Exercises → select some → Export as pack**) and it produces a self-contained
`.logit-pack.json`. To publish it in a registry, split it into
`manifest.json` + `exercises.json` (`distribution.origin: "url"`), or keep it
inline. Pack format: `@logit/core/plugins/exercisePack`.

## Getting it into a registry

Discovery is just a static `registry.json`. Options:

- **Community registry** — fork `logit-plugin-registry`, add your plugin under
  `plugins/`, add a `registry.json` entry, run `npm run lint`, open a PR. See
  that repo's `README.md`. First submission is human-reviewed; version bumps
  after that are lighter.
- **Your own registry** — host a `registry.json` anywhere. Users add its URL in
  **Plugins → Browse → Sources**. A self-hosted Logit can point its default
  there.
- **No registry** — send someone the manifest URL or the inline JSON file;
  **Plugins → Add** takes a URL, a file, or pasted JSON.

## Validating locally

`packages/plugin-tools` has the linter the registry CI runs (build it once with
`npm run build -w @logit/plugin-tools`):

```sh
node packages/plugin-tools/dist/lint.mjs path/to/registry-dir
```

It checks every `registry.json` entry, every manifest, every integrity hash,
parses packs, and loads each code bundle in a real sandbox VM to confirm it has
the method its family needs.
