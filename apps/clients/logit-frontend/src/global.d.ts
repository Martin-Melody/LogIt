/** Build id injected by vite.config.ts (commit and build date). */
declare const __LOGIT_BUILD__: string;

declare module "d3-scale" {
  // Just what the app uses. scaleUtc stays loose (layerchart takes it as-is).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function scaleUtc(): any;
  interface ContinuousScale<D> {
    (value: D): number;
    domain(d: D[]): this;
    range(r: number[]): this;
    nice(count?: number): this;
    ticks(count?: number): D[];
  }
  export function scaleLinear(): ContinuousScale<number>;
}

declare module "d3-shape" {
  export const curveMonotoneX: any;
}

// vitest is now a real devDependency (see package.json) — its own types are used instead of a
// hand-rolled ambient stub. That stub previously shadowed the real ones and meant
// src/lib/domain/test/workout/workout.test.ts type-checked but was never actually run by any
// script; it's now included by vitest.config.ts and genuinely executed by `npm run test:unit`.
