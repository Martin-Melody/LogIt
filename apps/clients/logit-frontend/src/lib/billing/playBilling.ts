import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

/** The native Google Play Billing bridge (android/app/src/main/java/ie/logit/app/PlayBillingPlugin.java). */

export type PlayPricingPhase = {
  formattedPrice: string;
  priceMicros: number;
  currency: string;
  /** ISO 8601 period: P1M, P1Y, P7D… */
  billingPeriod: string;
  cycles: number;
  /** 1 = renews forever, 2 = a fixed number of cycles, 3 = no recurrence (free trial). */
  recurrence: number;
};

export type PlayOffer = {
  basePlanId: string;
  offerId: string | null;
  offerToken: string;
  phases: PlayPricingPhase[];
};

export type PlayProduct = { productId: string; name: string; offers: PlayOffer[] };

export type PlayPurchase = {
  purchaseToken: string;
  productIds: string[];
  state: "purchased" | "pending" | "unknown";
  acknowledged: boolean;
  autoRenewing: boolean;
  accountId?: string;
};

export type PlayPurchaseResult =
  | { status: "purchased" | "pending"; purchaseToken: string }
  | { status: "cancelled" };

interface PlayBillingPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  getProducts(options: { productIds: string[] }): Promise<{ products: PlayProduct[] }>;
  purchase(options: {
    productId: string;
    offerToken: string;
    accountId: string;
    oldPurchaseToken?: string;
  }): Promise<PlayPurchaseResult>;
  getPurchases(): Promise<{ purchases: PlayPurchase[] }>;
  openSubscriptions(options: { productId?: string }): Promise<void>;
  addListener(
    event: "purchasesUpdated",
    fn: (e: { purchases: PlayPurchase[] }) => void,
  ): Promise<PluginListenerHandle>;
}

export const PlayBilling = registerPlugin<PlayBillingPlugin>("PlayBilling");

/** Google Play Billing only exists in the Android app. */
export function hasPlayBilling(): boolean {
  return Capacitor.getPlatform() === "android";
}
