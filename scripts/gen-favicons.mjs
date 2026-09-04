// Copies the canonical LogIt staircase mark (brand-mark.png) out to every web app's
// favicon.png. Keeps them byte-identical to each other and to the mark the mobile app icon
// is generated from (see gen-app-assets.mjs) — don't hand-edit any of these, re-run this
// instead.
//
//   node scripts/gen-favicons.mjs
import { copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MARK_PATH } from "./brandMark.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const targets = [
  "apps/clients/logit-frontend/src/lib/assets/favicon.png",
  "apps/clients/logit-marketing/static/favicon.png",
  "apps/clients/logit-web/static/favicon.png",
  "apps/clients/docs-site/static/favicon.png",
];

for (const t of targets) {
  await copyFile(MARK_PATH, join(root, t));
  console.log("wrote", t);
}
