declare module "d3-scale" {
  export function scaleUtc(): any;
}

declare module "d3-shape" {
  export const curveNatural: any;
}

// vitest is now a real devDependency (see package.json) — its own types are used instead of a
// hand-rolled ambient stub. That stub previously shadowed the real ones and meant
// src/lib/domain/test/workout/workout.test.ts type-checked but was never actually run by any
// script; it's now included by vitest.config.ts and genuinely executed by `npm run test:unit`.
