declare module "d3-scale" {
  export function scaleUtc(): any;
}

declare module "d3-shape" {
  export const curveNatural: any;
}

declare module "vitest" {
  export const describe: (name: string, fn: () => void) => void;
  export const it: (name: string, fn: () => void) => void;
  export const expect: (value: unknown) => {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toHaveLength(length: number): void;
    toBeNull(): void;
  };
}
