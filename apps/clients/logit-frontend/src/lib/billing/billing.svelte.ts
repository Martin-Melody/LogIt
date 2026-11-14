import { apiClient, ApiError, type BillingStatus } from "@logit/core/api/client";
import { getServerMode } from "@logit/core/api/serverConfig";
import { log } from "@logit/core/platform/log";
import { authStore } from "$lib/api/authStore.svelte";
import { PlayBilling, hasPlayBilling, type PlayProduct, type PlayPurchase } from "./playBilling";
import { PRODUCT_IDS, pickOffer, type PaidPlan, type Period } from "./plans";

/**
 * Plans in the app. Play does the paying; the LogIt server decides what someone has (it
 * checks every purchase with Google). This store keeps the server's billing status and
 * Play's prices, and reports purchases to the server: right after buying, on every app
 * start (restore, and purchases that finished while the app was closed), and when Play
 * says a pending payment cleared.
 */

export type BuyOutcome =
  | { kind: "success"; plan: PaidPlan }
  | { kind: "pending" }
  | { kind: "cancelled" }
  | { kind: "needAccount" }
  | { kind: "otherAccount" }
  /** Paid, but the server couldn't confirm it yet. Retried on every start. */
  | { kind: "unverified" }
  | { kind: "error"; message: string };

const VERIFY_RETRY_MS = [0, 2000, 5000];

function createBilling() {
  let status = $state<BillingStatus | null>(null);
  let products = $state<PlayProduct[]>([]);
  let productsState = $state<"idle" | "loading" | "ready" | "error">("idle");
  let busy = $state(false);
  /** Play purchases on this device that belong to a different LogIt account (or none). */
  let foreignPurchases = $state<PlayPurchase[]>([]);
  let listening = false;

  /** Signed in to getlogit.app (plans don't exist on a self-hosted server or offline). */
  function onHostedAccount(): boolean {
    return authStore.isAuthenticated && getServerMode() === "cloud" && !apiClient.isSelfHosted();
  }

  async function refreshStatus(): Promise<void> {
    if (!onHostedAccount()) {
      status = null;
      return;
    }
    try {
      status = await apiClient.getBillingStatus();
      // The app keeps the tier it saw at sign-in; a store notice may have changed it since.
      if (status && authStore.user && status.tier !== authStore.user.tier) await authStore.refreshUser();
    } catch (e) {
      log.warn("billing", "Couldn't load the plan status", e);
    }
  }

  async function loadProducts(): Promise<void> {
    if (!hasPlayBilling() || productsState === "loading") return;
    productsState = "loading";
    try {
      const res = await PlayBilling.getProducts({ productIds: Object.values(PRODUCT_IDS) });
      products = res.products;
      productsState = res.products.length ? "ready" : "error";
      if (!res.products.length) log.warn("billing", "Google Play returned no products");
    } catch (e) {
      productsState = "error";
      log.warn("billing", "Couldn't load prices from Google Play", e);
    }
  }

  /** Reports one purchase token to the server, retrying a little. Throws the last error. */
  async function verify(token: string): Promise<BillingStatus> {
    let last: unknown;
    for (const wait of VERIFY_RETRY_MS) {
      if (wait) await new Promise((r) => setTimeout(r, wait));
      try {
        return await apiClient.verifyGooglePurchase(token);
      } catch (e) {
        last = e;
        // Only "try again later" answers are worth retrying.
        if (e instanceof ApiError && e.status < 500 && e.status !== 0) break;
      }
    }
    throw last;
  }

  async function buy(plan: PaidPlan, period: Period): Promise<BuyOutcome> {
    if (!onHostedAccount() || !authStore.user) return { kind: "needAccount" };
    if (busy) return { kind: "cancelled" };
    const product = products.find((p) => p.productId === PRODUCT_IDS[plan]);
    const offer = pickOffer(product, period);
    if (!offer) return { kind: "error", message: "Google Play didn't return this plan. Try again in a moment." };

    busy = true;
    try {
      // Switching Pro <-> Studio replaces the current Play subscription instead of adding one.
      let oldPurchaseToken: string | undefined;
      const current = status?.subscription;
      if (current?.source === "google" && current.grantsAccess && current.productId !== PRODUCT_IDS[plan]) {
        const owned = await PlayBilling.getPurchases().catch(() => ({ purchases: [] as PlayPurchase[] }));
        oldPurchaseToken = owned.purchases.find((p) => p.productIds.includes(current.productId))?.purchaseToken;
      }

      const result = await PlayBilling.purchase({
        productId: PRODUCT_IDS[plan],
        offerToken: offer.offerToken,
        accountId: authStore.user.id,
        oldPurchaseToken,
      });
      log.info("billing", "Play purchase finished", { plan, period, status: result.status });
      if (result.status === "cancelled") return { kind: "cancelled" };
      if (result.status === "pending") return { kind: "pending" };

      try {
        status = await verify(result.purchaseToken);
      } catch (e) {
        if (e instanceof ApiError && e.code === "other_account") return { kind: "otherAccount" };
        log.warn("billing", "Paid, but the server couldn't confirm the purchase yet", e);
        return { kind: "unverified" };
      }
      await authStore.refreshUser().catch(() => {});
      return { kind: "success", plan };
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === "already_owned") {
        // Play says this Google account already has it: claim it instead.
        const restored = await restore();
        return restored.otherAccount ? { kind: "otherAccount" } : { kind: "success", plan };
      }
      log.warn("billing", "Purchase failed", e);
      return {
        kind: "error",
        message: code === "unavailable"
          ? "Couldn't reach Google Play. Check your connection and try again."
          : "Google Play couldn't start the purchase. Try again in a moment.",
      };
    } finally {
      busy = false;
    }
  }

  /**
   * Reports every subscription Play lists for this Google account to the server. Covers
   * "Restore purchases", purchases that finished while the app was closed, and acknowledging
   * anything that wasn't (Google refunds purchases left unacknowledged for 3 days).
   */
  async function restore(): Promise<{ restored: boolean; otherAccount: boolean; failed: boolean }> {
    const out = { restored: false, otherAccount: false, failed: false };
    if (!hasPlayBilling() || !onHostedAccount()) return out;
    let purchases: PlayPurchase[];
    try {
      purchases = (await PlayBilling.getPurchases()).purchases;
    } catch (e) {
      log.warn("billing", "Couldn't list Google Play purchases", e);
      await refreshStatus();
      return { ...out, failed: true };
    }

    const foreign: PlayPurchase[] = [];
    for (const p of purchases.filter((p) => p.state === "purchased")) {
      // Bought for another LogIt account: don't even ask, the server would refuse.
      if (p.accountId && p.accountId !== authStore.user?.id) {
        foreign.push(p);
        continue;
      }
      try {
        status = await verify(p.purchaseToken);
        out.restored = true;
      } catch (e) {
        if (e instanceof ApiError && e.code === "other_account") foreign.push(p);
        else out.failed = true;
      }
    }
    foreignPurchases = foreign;
    out.otherAccount = foreign.length > 0;
    await refreshStatus();
    return out;
  }

  /** On start-up and after signing in. Quiet: nothing is shown unless something changed. */
  async function start(): Promise<void> {
    if (!hasPlayBilling()) return startWithoutStore();
    if (!listening) {
      listening = true;
      void PlayBilling.addListener("purchasesUpdated", () => void restore());
    }
    if (onHostedAccount()) await restore();
    else await checkForeignOnly();
  }

  /** Without Play Billing (web, iPhone for now): just keep the plan in step with the server. */
  async function startWithoutStore(): Promise<void> {
    if (!hasPlayBilling()) await refreshStatus();
  }

  /** On a self-hosted server or signed out: just notice Play subscriptions still running. */
  async function checkForeignOnly(): Promise<void> {
    try {
      const { purchases } = await PlayBilling.getPurchases();
      foreignPurchases = purchases.filter((p) => p.state === "purchased" && p.autoRenewing);
    } catch {
      foreignPurchases = [];
    }
  }

  async function openSubscriptions(productId?: string): Promise<void> {
    if (hasPlayBilling()) {
      await PlayBilling.openSubscriptions({ productId });
    } else {
      window.open(status?.subscription?.manageUrl ?? "https://play.google.com/store/account/subscriptions", "_blank", "noopener");
    }
  }

  return {
    get status() { return status; },
    get products() { return products; },
    get productsState() { return productsState; },
    get busy() { return busy; },
    get foreignPurchases() { return foreignPurchases; },
    /** A Google Play subscription on this phone is still renewing for this account. */
    get paysThroughPlay() {
      const s = status?.subscription;
      return !!s && s.source === "google" && s.autoRenewing && s.state !== "expired" && s.state !== "revoked";
    },
    onHostedAccount,
    refreshStatus,
    loadProducts,
    buy,
    restore,
    start,
    startWithoutStore,
    checkForeignOnly,
    openSubscriptions,
  };
}

export const billing = createBilling();
