# Plugin Bundle Format

Logit community plugins are installed as two parts:

1. a manifest, which describes identity, distribution, and capabilities
2. a bundle, which provides the executable entry point

The bundle is a JavaScript/TypeScript module that exports a `pluginBundle`
descriptor with `formatVersion: 1`.

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

## Compatibility

The app still tolerates legacy bundles that export `widget`, `algorithm`, or
`default` directly. New community bundles should use `pluginBundle` so the app
can validate the contract before enabling the plugin.
