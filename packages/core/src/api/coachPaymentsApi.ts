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
  /** Listed on the coach's public profile (canvas K17 "Offer it"). */
  showOnProfile?: boolean;
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
  /** A client's payments with what's been refunded from each (canvas Q9). */
  async receipts(relationshipId: string): Promise<{ id: string; amountCents: number; currency: string; paidAt: string; refundedCents: number; packageName: string | null }[]> {
    return (await apiClient.fetch<{ receipts: { id: string; amountCents: number; currency: string; paidAt: string; refundedCents: number; packageName: string | null }[] }>(`/coach/payments/clients/${relationshipId}/receipts`)).receipts;
  },

  /** Refund part of a payment; coaching carries on (canvas Q9). */
  async refund(relationshipId: string, receiptId: string, amountCents: number, reason?: string): Promise<{ refundedCents: number; status: string }> {
    return apiClient.fetch(`/coach/payments/clients/${relationshipId}/refund`, { method: "POST", body: JSON.stringify({ receiptId, amountCents, reason }) });
  },

  /** Offer a client a different package (canvas K14): null = no payment through LogIt. */
  async changePackage(relationshipId: string, packageId: string | null, message?: string): Promise<{ offerId: string }> {
    return apiClient.fetch(`/coach/payments/clients/${relationshipId}/change-package`, { method: "POST", body: JSON.stringify({ packageId, message }) });
  },

  /** Stop taking payments through LogIt (canvas K18): plans run out, then "paid elsewhere". */
  async stopTakingPayments(): Promise<{ plansStopped: number }> {
    return apiClient.fetch("/coach/payments/stop", { method: "POST" });
  },

  /** Client: accept or decline a change of package. */
  async answerPackageChange(relationshipId: string, offerId: string, accept: boolean): Promise<void> {
    await apiClient.fetch(`/coach/coaches/${relationshipId}/package-change/${offerId}/${accept ? "accept" : "decline"}`, { method: "POST" });
  },

  /** Client: pay for the package changed to, when it's due. */
  async payChange(relationshipId: string, successUrl: string, cancelUrl: string): Promise<{ url: string }> {
    return apiClient.fetch(`/coach/coaches/${relationshipId}/pay-change`, { method: "POST", body: JSON.stringify({ successUrl, cancelUrl }) });
  },

  /** Client: back from paying for a change of package. */
  async confirmChangeCheckout(relationshipId: string, sessionId: string): Promise<{ status: "active" | "pending" }> {
    return apiClient.fetch("/coach/payments/checkout/confirm", { method: "POST", body: JSON.stringify({ relationshipId, sessionId }) });
  },

  async myBillingPage(relationshipId: string): Promise<{ url: string }> {
    return apiClient.fetch(`/coach/payments/mine/${relationshipId}/billing`, { method: "POST" });
  },

  /** The "update your card" link from a failed-payment email; works signed out. */
  async billingPageFromEmail(token: string): Promise<{ url: string }> {
    return apiClient.fetch("/coach/payments/fix", { method: "POST", body: JSON.stringify({ token }) });
  },
};
