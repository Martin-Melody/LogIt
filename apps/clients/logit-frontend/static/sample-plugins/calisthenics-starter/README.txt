Calisthenics Starter — sample exercise pack
===========================================

An exercise pack is a *content* plugin: pure JSON, no code. It installs a list
of exercise definitions into your catalogue. Because there's nothing to execute,
packs install regardless of Restricted Mode.

Files
-----
  manifest.json    identity + distribution + integrity hash of exercises.json
  exercises.json   the pack payload (see @logit/core/plugins/exercisePack)

The manifest's `integrity` field is the SHA-256 of exercises.json, formatted
like an HTML subresource-integrity attribute:

  printf 'sha256-%s\n' "$(openssl dgst -sha256 -binary exercises.json | openssl base64)"

The app re-computes this on install and refuses the pack if it doesn't match.

Payload format
--------------
  {
    "formatVersion": 1,
    "pluginId": "<must equal manifest.id>",
    "exercises": [
      {
        "name": "Push-Up",
        "primaryMuscles": ["chest"],
        "secondaryMuscles": ["triceps", "shoulders", "core"],
        "exerciseType": "bodyweight"   // normal | assisted | bodyweight (optional)
      }
    ]
  }

Muscle groups must be from: chest, back, shoulders, biceps, triceps, quads,
hamstrings, glutes, calves, core, forearms. Max 500 exercises per pack.

Installed pack exercises get namespaced ids (pack:<pluginId>:<slug>) and are
removed cleanly when the pack is uninstalled or disabled. A core or user
exercise with the same name always wins.
