import { apiClient } from "./client";

export interface DiagnosticReportInput {
  /** What the user says went wrong (optional). */
  note: string;
  appVersion: string;
  platform: string;
  /** The formatted log text (see formatLog). */
  log: string;
}

/** Biggest log the server accepts, in characters. Keep in step with DiagnosticsEndpoints.MaxLogChars. */
export const MAX_REPORT_LOG_CHARS = 500_000;

export const diagnosticsApi = {
  /** Send a diagnostics report to the hosted Logit service. Self-hosted servers answer 404. */
  sendReport(input: DiagnosticReportInput): Promise<{ id: string }> {
    return apiClient.fetch("/diagnostics/reports", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
};
