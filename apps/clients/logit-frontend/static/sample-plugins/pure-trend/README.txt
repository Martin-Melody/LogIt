Pure Trend sample plugin

Demonstrates the v1 plugin bundle contract for the nutrition-algorithm family.
Safe to import locally from the sample manifest URL:

  /sample-plugins/pure-trend/manifest.json

The bundle is a plain JavaScript module that exports:

  - pluginBundle   (contract: formatVersion 1, family "nutrition-algorithm")
  - algorithm      (id, name, description, computeTargets(input), + optional
                    defaultPreferences / preferencesSchema)

computeTargets receives { goal, currentWeightKg, weightEntries, dailyIntakeKcal,
userPreferences, now } and returns { kcal, macros?, maintenanceKcal?,
sourceLabel?, notes? }. The app applies any manual override on the goal and
derives macros from the goal when the algorithm doesn't return them.
