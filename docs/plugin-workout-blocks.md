# Workout block plugins (design, not built)

Status: design agreed in principle with Martin on 2026-11-20 ("should we allow the community to
create plugins for workout blocks? I think yes"). Nothing here is built. Mockups: the design
canvas, row "Workout block plugins": B1 a BJJ rounds block live with its timer, B2 in history,
B3 on a phone without the plugin.

## Why

A workout is made of blocks: strength (sets of weight × reps), cardio (intervals of time and
distance) and mobility (holds or reps, per side). Those are built in. Plenty of training doesn't
fit them: BJJ and wrestling rounds, a run club's intervals, climbing problems, boxing rounds,
kettlebell flows, swim sets. We won't build all of them, and the people who do these sports know
better than us what's worth logging. So the community makes them, as plugins.

It also fits the bigger plan (Martin, 2026-11-20): events (a BJJ comp, a race, a meet) and groups
(a run club, a team) will be general in the app, and the sports that use them come as plugins. The
meet mockups E4 to E4d on the canvas are the powerlifting example.

## The rule: a plugin describes the block, the app draws it

Same rule as widget plugins (`plugins/widgetView.ts`, and Decision 4 in `plugin-roadmap.md`): a
plugin never ships screens or markup. It declares the block's fields, and the app renders them
with its own components. Because:

- **It runs mid-workout.** That screen has to be fast, offline, readable with sweaty hands and
  never crash. If the app draws everything, a plugin can't break it.
- **The data outlives the plugin.** Two years of BJJ rounds must still show in history after the
  plugin is uninstalled, on a phone that never had it, and on the web dashboard. A declared block
  can always be shown plainly from its own data.
- **It looks like LogIt.** Same inputs, timers, sheets, motion and accessibility as built-in blocks.

The trade-off, as with widgets: a plugin can only use field types and timer patterns the app ships.
A new one is a deliberate app change.

## What a block plugin is

A new family, `workout-block`, in two parts:

1. **The declaration** (data, like a content pack): name, the fields of one entry (a round, a set,
   a problem), fields set once per block, a timer pattern, and how to summarise it.
2. **Optional pure functions** (sandboxed, like progression plugins): `suggest` to prefill the next
   session, `summarise` when a template isn't enough, `stats` for the exercise's progress screen.

```ts
export const pluginBundle = {
  formatVersion: 1,
  pluginId: "app.getlogit.bjj-rounds",
  family: "workout-block",
  entryExport: "block",
} as const;

export const block = {
  id: "app.getlogit.bjj-rounds",
  name: "BJJ rounds",
  icon: "icon.svg",                     // its own (see Icons), or a name from the app's icon list
  entry: { one: "Round", many: "Rounds" },
  blockFields: [
    { key: "gi", type: "choice", label: "Gi or no-gi", options: ["Gi", "No-gi"], remember: true },
  ],
  fields: [
    { key: "length", type: "duration", label: "Length", default: 360, timer: "work", column: true },
    { key: "partner", type: "text", label: "Partner", optional: true, suggestions: "previous", column: true },
    { key: "start", type: "choice", label: "Started", options: ["Standing", "Guard", "Top", "Bottom"], optional: true },
    { key: "finish", type: "choice", label: "Got the sub with", options: "list:submissions", optional: true },
    { key: "subs", type: "counter", label: "Subs", column: true },
    { key: "taps", type: "counter", label: "Tapped", column: true },
    { key: "effort", type: "scale", label: "How hard", min: 1, max: 5, optional: true },
    { key: "note", type: "text", label: "Note", multiline: true, optional: true },
  ],
  timer: { pattern: "rounds", work: "length", rest: { default: 60, label: "Rest" } },
  summary: "{count} rounds · {sum:subs} subs · {sum:taps} tapped",
  countsAs: { activeMinutes: "length" },
};
```

### Field types (the app's to draw)

| Type | Shown as | Stored as |
|---|---|---|
| `number` | number box, optional unit (reps, m, km, bpm, cal) and step | number |
| `weight` | weight box in the person's kg or lb | kg (converted by the app, like strength sets) |
| `distance` | distance box in km/mi or m | metres |
| `duration` | mm:ss box, filled by the timer when there is one | seconds |
| `counter` | − n + buttons, big enough to tap mid-round | integer |
| `scale` | row of 1..N buttons (like the RPE row) | integer |
| `choice` | chips, one picked | the option's text |
| `tags` | chips, several picked | list of texts |
| `toggle` | switch | boolean |
| `text` | text box, `multiline` for notes, `suggestions: "previous"` offers earlier values | text |

`optional: true` fields start folded under "More" so a round can be logged in two taps.
`remember: true` prefills a field from the last block of this kind. `column: true` puts the field
in the entries table (history, finished rounds); without any, the first four fields are shown.

### Timer patterns (the app's to run)

- `none`: entries are logged by hand.
- `rounds`: work and rest, repeated: BJJ, boxing, wrestling. The work length comes from a field;
  the rest has a default. Uses the existing rest-timer notification and sounds.
- `intervals`: a list of work and rest steps (run club 6 × 400 m), repeated as a set.
- `emom`: every N seconds for M minutes.
- `stopwatch`: one running clock per entry (a climb, a swim length).

Rounds come first (BJJ); the rest follow when a plugin needs one.

### Summary

A template over the entries: `{count}`, `{sum:key}`, `{max:key}`, `{avg:key}`, `{first:key}`,
plus block fields as `{gi}`. When that isn't enough, a `summarise(block)` function returns the
line. The summary is what history, the web dashboard and the social feed show.

### `countsAs`

How the block shows up in the app's own numbers without the app knowing the sport:
`activeMinutes` (a duration field adds to weekly activity), `distance` (adds to cardio
distance), `sets: { muscles: [...] }` (each entry is a hard set for those muscles, for a
kettlebell flow). Nothing counts unless declared.

## What a plugin's functions see

Pure functions, frozen input, structured-clone output, hard timeout: the same sandbox and
contract as progression plugins.

- `suggest(input)`: this block's past sessions (newest first), the block's own state, the
  person's settings for the plugin, units, and later the next event of a matching sport ("BJJ
  competition in 5 weeks, -82 kg, gi") and the groups they're in. Returns prefilled entries and
  block fields, plus an optional "why" line, like progression's.
- `stats(input)`: the same history; returns a `WidgetView` (line, bar, stat-grid, calendar heatmap)
  for the block's progress page. Reuses the widget renderer.

## How it's stored and synced

A session block already has a type and its own data, and syncs as JSON, so nothing changes on
the server:

```ts
{ id, type: "plugin:app.getlogit.bjj-rounds", orderIndex,
  data: {
    v: 1,                                  // declaration version the data was written with
    blockFields: { gi: "No-gi" },
    entries: [{ length: 360, partner: "Conor", subs: 2, taps: 0 }, …],
    shape: [["length", "duration", "Length"], ["subs", "counter", "Subs"], …],
    summary: "6 rounds · 4 subs · 1 tapped",
    card: { … }                            // only when the plugin has a feed card: its WidgetView
  } }
```

`shape` (each field's key, type and label), the last `summary` and the feed `card` (if any) are
worked out when the workout is finished and travel with the data, a few hundred bytes. That's what lets any phone or the web show the block plainly without the plugin:
a table of the entries with their labels, in the person's units.

**Versions.** A declaration may add fields, rename labels, and rename keys with `was: "oldKey"`.
It may never change a key's type or reuse a key for something else; the linter checks this
against the previous published version. Old data keeps its `v` and shape, so it always reads.

### Icons

A plugin can ship its own icon as an SVG (Martin, 2026-11-20), or name one from the app's list.
The app keeps it looking like LogIt and safe to draw: the linter accepts a single SVG up to 8 KB,
24 × 24 viewBox, paths and basic shapes only (no scripts, `<foreignObject>`, embedded images,
external links or CSS), and the app draws it in the current text colour, so it fits light and dark
mode and every icon looks like a line icon. One that fails gets the default block icon.

### Lists it ships

A plugin can ship its own lists (Martin, 2026-11-20): submissions, belt colours, climbing grades,
boxing combos, swim strokes. They come with the plugin as data, like an exercise pack, and a
`choice` or `tags` field points at one with `options: "list:<id>"`:

```ts
export const lists = {
  submissions: { label: "Submissions", items: ["Rear naked choke", "Armbar", "Triangle", "Kimura", …], add: true },
  grades: { label: "Font grades", items: ["4", "5", "5+", "6A", "6A+", …], ordered: true },
};
```

`add: true` lets the person add their own items (kept with their data, not the plugin's);
`ordered: true` means the order is meaningful, so stats can say "hardest" or "highest". Items are
stored by their text, so a later version can add items but the old ones keep reading.

### Its card in the feed

The default in the social feed is the summary line. A plugin can also declare a feed card
(Martin, 2026-11-20): a `feedCard(block)` function returning a `WidgetView` (stat grid, list, bar,
the widget renderer's parts), shown under the workout's title. Friends without the plugin see the
same card, since it's drawn from the stored result, not by running the plugin on their phone.

## Where blocks appear

- **Add block** in a workout lists installed block plugins after Strength, Cardio and Mobility.
- **Split days** can plan one, with its fields' defaults (6 rounds of 6 minutes).
- **History, session detail, web dashboard:** the summary line, then the entries table.
- **Export:** the backup JSON carries the block as stored; the CSV export gets one row per entry.
- **Progress:** a page per block plugin, from `stats` if it has one, else counts over time.

## Safety and review

The sandbox protects the app; it doesn't make a plugin's advice good. Declarations are checked by
`logit-plugin-lint` (field types, keys stable across versions, summary template valid, timer
fields exist, the icon passes the SVG rules, every `list:` a field points at is shipped). Training plugins (block and progression) should get the "verified" review badge
discussed for powerlifting before they're promoted in the catalog.

## What the app needs to build, in order

1. The renderer for declared blocks: live workout, history, session detail, web dashboard, and
   the plain fallback from `shape`. **Built 2026-11-20** (`core/domain/blockPlugin.ts`,
   `features/session/blocks/plugin/`); declarations are read from `blockPluginStore.ts`, which
   step 3 fills when a plugin is installed.
2. The `rounds` timer pattern (with the existing notification and sounds). **Partly there:** a
   plugin block in a superset/circuit already runs in the circuit countdown (an entry with a
   work timer is a timed hold, else a Done), and so do strength sets (a rep goal with the weight).
   A plugin block on its own doesn't have a timer yet.
3. The `workout-block` family in the sandbox, the linter and the registry; split-day planning.
4. The first plugin, BJJ rounds, published first-party through this mechanism (not built in), as
   the example to copy.
5. Later: `suggest` and `stats`, `countsAs`, the other timer patterns, and the event and group
   inputs once events and groups exist.

## Decided (Martin, 2026-11-20)

- Plugins can upload their own icons (checked SVG, drawn in the app's colour; see Icons).
- Plugins can ship their own lists (see Lists it ships).
- Feed: the summary line by default; a plugin may add a card (see Its card in the feed).
