import { apiClient } from "./client";
import type { Sharing } from "./coachApi";
import type {
  CoachPackage,
  PaymentAccount,
  PaymentInterval,
  PaymentRule,
  PaymentSettings,
  PaymentsOverview,
} from "../domain/coachPayments";

export interface PackageInput {
  name: string;
  description: string;
  amountCents: number;
  interval: PaymentInterval;
  weeks: number | null;
  hidden: boolean;
}

/** Coach payments (Studio coaches' own Stripe accounts). Paying happens on the web only. */
export const coachPaymentsApi = {
  // ── Coach ──
  async overview(): Promise<PaymentsOverview> {
    return apiClient.fetch("/coach/payments");
  },

  /** Make the coach's Stripe account if needed; returns Stripe's onboarding page. */
  async connect(input: { country: string; returnUrl: string; refreshUrl: string }): Promise<{ url: string }> {
    return apiClient.fetch("/coach/payments/connect", { method: "POST", body: JSON.stringify(input) });
  },

  async refresh(): Promise<PaymentAccount> {
    return apiClient.fetch("/coach/payments/refresh", { method: "POST" });
  },

  async saveSettings(settings: PaymentSettings): Promise<PaymentSettings> {
    return apiClient.fetch("/coach/payments/settings", { method: "PUT", body: JSON.stringify(settings) });
  },

  async createPackage(input: PackageInput): Promise<CoachPackage> {
    return apiClient.fetch("/coach/payments/packages", { method: "POST", body: JSON.stringify(input) });
  },

  async updatePackage(id: string, input: PackageInput): Promise<CoachPackage> {
    return apiClient.fetch(`/coach/payments/packages/${id}`, { method: "PUT", body: JSON.stringify(input) });
  },

  async setLinkPackage(linkId: string, packageId: string | null): Promise<void> {
    await apiClient.fetch(`/coach/links/${linkId}/package`, { method: "PUT", body: JSON.stringify({ packageId }) });
  },

  /** One client's own rule; null rule = back to the default. */
  async setClientRule(relationshipId: string, rule: PaymentRule | null, days: number | null): Promise<void> {
    await apiClient.fetch(`/coach/payments/clients/${relationshipId}/rule`, {
      method: "PUT",
      body: JSON.stringify({ rule, days }),
    });
  },

  /** Mark paid outside LogIt up to a day ("2026-12-31"), or with no end date. Stops any plan through LogIt. */
  async markPaidElsewhere(relationshipId: string, until: string | null): Promise<void> {
    await apiClient.fetch(`/coach/payments/clients/${relationshipId}/paid-elsewhere`, {
      method: "POST",
      body: JSON.stringify({ until }),
    });
  },

  /** Coach: stop (or un-stop) a client's monthly plan at the end of the month paid for. */
  async stopClientPlan(relationshipId: string, stop: boolean): Promise<{ stopsAtPeriodEnd: boolean; paidUntil: string | null }> {
    return apiClient.fetch(`/coach/payments/clients/${relationshipId}/stop`, { method: "POST", body: JSON.stringify({ stop }) });
  },

  // ── Client ──
  /** Start paying through an invite link. Web only: returns Stripe's payment page. */
  async startCheckout(code: string, input: { sharing: Sharing; successUrl: string; cancelUrl: string }): Promise<{ url: string }> {
    return apiClient.fetch(`/coach/links/code/${encodeURIComponent(code)}/checkout`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  /** Back from Stripe: start coaching without waiting for Stripe's webhook. */
  async confirmCheckout(code: string, sessionId: string): Promise<{ status: "active" | "pending"; relationshipId?: string }> {
    return apiClient.fetch("/coach/payments/checkout/confirm", { method: "POST", body: JSON.stringify({ code, sessionId }) });
  },

  /** Client: stop (or un-stop) my monthly plan with a coach at the end of the month paid for. */
  async stopMyPlan(relationshipId: string, stop: boolean): Promise<{ stopsAtPeriodEnd: boolean; paidUntil: string | null }> {
    return apiClient.fetch(`/coach/payments/mine/${relationshipId}/stop`, { method: "POST", body: JSON.stringify({ stop }) });
  },

  /** Client: Stripe's billing page for my plan with a coach (change the card, receipts). */
  async myBillingPage(relationshipId: string): Promise<{ url: string }> {
    return apiClient.fetch(`/coach/payments/mine/${relationshipId}/billing`, { method: "POST" });
  },

  /** The "update your card" link from a failed-payment email; works signed out. */
  async billingPageFromEmail(token: string): Promise<{ url: string }> {
    return apiClient.fetch("/coach/payments/fix", { method: "POST", body: JSON.stringify({ token }) });
  },
};
