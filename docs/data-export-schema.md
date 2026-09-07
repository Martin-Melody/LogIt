# Logit data export schema

The **Backup & Restore** feature (Settings → Backup & Restore) writes a single
JSON file: `logit-backup-YYYY-MM-DD.json`. This document is the stable contract
for that file so third-party tools can read exported data.

Source of truth: `apps/clients/logit-frontend/src/lib/usecases/exportData.ts`.

## Versioning

The top-level `version` field is an integer. The app imports any file whose
version is `1 ≤ version ≤ EXPORT_VERSION` (currently **2**). Sections added in a
later version are simply absent from an older file; importers must treat every
section as optional.

| Version | Added |
|---------|-------|
| 1 | `profile`, `homeConfig`, `profileConfig`, `exercises`, `splits`, `sessions`, `progression` |
| 2 | `nutrition`, `habits`, `plugins` |

## Top-level shape

```jsonc
{
  "version": 2,
  "exportedAtMs": 1788768000000,          // Date.now() at export

  "profile": { /* UserProfile */ },        // name, bio, height/weight (+units), restDefaults, …
  "homeConfig": { /* HomeConfig */ },       // home widget layout
  "profileConfig": { /* HomeConfig */ },    // profile widget layout

  "exercises": [ /* Exercise[] */ ],        // USER-CREATED only; built-ins are always in the app

  "splits": {
    "splits": [ /* WorkoutSplit[] */ ],     // includes archived
    "activeSplitId": "split_… | null"
  },

  "sessions": [ /* WorkoutSession[] */ ],   // every workout, finished or draft

  "progression": {
    "config": { /* UserProgressionConfig */ } | null,
    "states": [ /* ExerciseProgressionState[] */ ]
  },

  "nutrition": {
    "days":          [ /* DiaryDay[] */ ],       // one per calendar date; may carry deletedAtMs tombstones
    "customFoods":   [ /* CustomFood[] */ ],
    "recipes":       [ /* Recipe[] */ ],
    "favorites":     [ /* FavoriteFood[] */ ],
    "mealTemplates": [ /* MealTemplate[] */ ],
    "weightEntries": [ /* WeightEntry[] */ ],     // bodyweight log, weightKg canonical
    "goal":          { /* NutritionGoal */ } | null
  },

  "habits": {
    "habits":  [ /* Habit[] */ ],            // includes archived
    "entries": [ /* HabitEntry[] */ ]        // check-offs
  },

  // Raw localStorage snapshot of the plugin subsystem — key → the stored JSON string.
  // Keys: logit:plugins:installed:v1, logit:plugins:bundles:v1, logit:plugin-settings:v1,
  //       logit:plugins:packs:v1, logit:plugins:registries:v1
  "plugins": { "logit:plugins:installed:v1": "…", … }
}
```

Field-level shapes come from `@logit/core/domain/*` (`workout.ts`, `exercise.ts`,
`WorkoutSplit.ts`, `progression.ts`, `nutrition.ts`, `habit.ts`) — those types are
the canonical definitions.

## Units

Every weight in the file is **kilograms**. `profile.weightUnit` /
`profile.heightUnit` only affect display; a reader wanting the user's preferred
unit converts from kg itself.

## Restore semantics

- `profile`, `exercises`, `splits`, `sessions`, `progression`, `plugins` —
  **replace**: the category's existing data is cleared, then the file's data is
  written.
- `nutrition`, `habits` — **merge**: rows are upserted (last-write-wins by
  `updatedAtMs`, same as cloud sync). Nothing local is deleted.

Coach-assigned data (programs, assigned habits, check-ins, coach nutrition plans)
is **not** in the export — it is server-authoritative and re-syncs from the
coach relationship.
