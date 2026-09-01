# Logit plugin registry

A registry is a plain static site: `registry.json` plus a folder of plugins.
The Logit app fetches `registry.json` and shows the plugins in **Plugins →
Browse**. Anyone can run their own registry; this is the community one.

## Layout

```
registry.json                       array of catalogue entries
plugins/
  <plugin-id>/
    manifest.json                   identity + distribution + integrity
    bundle.js                       code plugins (progression / analytics / nutrition / widget)
    exercises.json                  exercise packs
scripts/lint.mjs                    the validator (vendored — see below)
.github/workflows/validate.yml      runs the validator on every PR
```

`manifestUrl` and `distribution.bundleUrl` are **repo-relative paths**
(`plugins/<id>/...`), not URLs.

## Submitting a plugin

1. Fork this repo.
2. Add `plugins/<your-plugin-id>/` with `manifest.json` and your `bundle.js`
   (or `exercises.json`). See `docs/publishing-plugins.md` in the Logit repo
   for the manifest fields and how to build a bundle.
3. Compute the integrity hash and put it in the manifest:
   ```sh
   printf 'sha256-%s\n' "$(openssl dgst -sha256 -binary plugins/<id>/bundle.js | openssl base64)"
   ```
4. Add an entry to `registry.json`.
5. Run `npm install && npm run lint` — fix anything it reports.
6. Open a PR. CI runs the same check; a maintainer reviews the bundle and merges.

Updates: bump `version` in the manifest, regenerate the hash, PR again.

## Keeping the validator current

`scripts/lint.mjs` is built from the Logit monorepo. Refresh it with:

```sh
curl -sL https://raw.githubusercontent.com/Martin-Melody/LogIt/main/packages/plugin-tools/registry-template/scripts/lint.mjs -o scripts/lint.mjs
```
