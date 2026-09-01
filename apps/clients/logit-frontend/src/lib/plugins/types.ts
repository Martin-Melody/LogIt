export type PluginFamily =
  | "widget"
  | "progression-algorithm"
  | "exercise-pack"
  | "analytics"
  | "nutrition-algorithm"
  | "nutrition-analytics";

export type PluginOrigin = "builtin" | "manual" | "url" | "activitypub" | "inline";

export type PluginFederationIdentity = {
  handle?: string;
  actorUrl?: string;
  inboxUrl?: string;
  outboxUrl?: string;
  profileUrl?: string;
};

export type PluginDistribution =
  | {
      origin: "builtin";
    }
  | {
      origin: "manual";
      sourceUrl?: string;
      bundleUrl?: string;
    }
  | {
      origin: "url";
      manifestUrl: string;
      bundleUrl?: string;
    }
  | {
      origin: "activitypub";
      actorUrl: string;
      manifestUrl?: string;
      bundleUrl?: string;
    }
  | {
      /**
       * Self-contained: the artifact is embedded in the manifest. Content
       * plugins only (exercise packs) — never executable code. Used by
       * "export as pack" so one file is the whole thing.
       */
      origin: "inline";
      data: unknown;
    };

export type WidgetPluginCapability = {
  family: "widget";
  widgetId: string;
  slot: "home";
  defaultEnabled: boolean;
  defaultOrder: number;
};

export type ProgressionAlgorithmPluginCapability = {
  family: "progression-algorithm";
  algorithmId: string;
};

export type ExercisePackPluginCapability = {
  family: "exercise-pack";
  exercisePackId: string;
  exerciseCount?: number;
};

export type AnalyticsPluginCapability = {
  family: "analytics";
  analyticsId: string;
};

export type NutritionAlgorithmPluginCapability = {
  family: "nutrition-algorithm";
  algorithmId: string;
};

export type NutritionAnalyticsPluginCapability = {
  family: "nutrition-analytics";
  analyticsId: string;
};

export type PluginCapability =
  | WidgetPluginCapability
  | ProgressionAlgorithmPluginCapability
  | ExercisePackPluginCapability
  | AnalyticsPluginCapability
  | NutritionAlgorithmPluginCapability
  | NutritionAnalyticsPluginCapability;

export type PluginManifest = {
  id: string;
  family: PluginFamily;
  name: string;
  description: string;
  version: string;
  author?: string;
  homepageUrl?: string;
  sourceUrl?: string;
  fediverse?: PluginFederationIdentity;
  distribution: PluginDistribution;
  capabilities: PluginCapability[];
  /**
   * Subresource integrity for the installed artifact (bundle for code plugins,
   * data file for content packs), as `sha256-<base64>`. Verified at install
   * time. Optional today; required for registry publication later.
   */
  integrity?: string;
  /** Minimum app version this plugin supports, e.g. "1.4.0". */
  minAppVersion?: string;
};

export type InstalledPlugin = {
  manifest: PluginManifest;
  enabled: boolean;
  installedAtMs: number;
};
