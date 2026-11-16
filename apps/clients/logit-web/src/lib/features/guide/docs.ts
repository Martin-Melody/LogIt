import { featureById } from "@logit/core/guide/features";

export const DOCS_BASE: string = `${import.meta.env.VITE_MARKETING_URL || "https://getlogit.app"}`;

/** The docs page for a feature (features.ts), or the docs home. */
export function docsUrl(featureId?: string): string {
  const f = featureId ? featureById(featureId) : undefined;
  return `${DOCS_BASE}${f?.docs ?? "/docs"}`;
}
