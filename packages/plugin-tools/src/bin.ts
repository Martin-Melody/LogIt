import { validateRegistry } from "./validate.js";

/**
 * `logit-plugin-lint [registry-dir]` — validate a Logit plugin registry.
 * Exits non-zero if anything is wrong. Run in the registry repo's CI on PRs.
 */
async function main() {
  const dir = process.argv[2] ?? ".";
  const problems = await validateRegistry(dir);

  if (problems.length === 0) {
    console.log("✓ registry is valid");
    process.exit(0);
  }

  console.error(`\n✗ ${problems.length} problem${problems.length === 1 ? "" : "s"}:\n`);
  for (const p of problems) {
    console.error(`  ${p.where}\n    ${p.message}\n`);
  }
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
