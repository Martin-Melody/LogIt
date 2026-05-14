import { browser } from "$app/environment";
import { apiClient } from "./client";
import { testServerConnection } from "./testConnection";
import { getServerMode } from "./serverConfig";

export type ConnectionState = "connected" | "disconnected" | "unknown";

class ConnectionStatus {
  state = $state<ConnectionState>("unknown");

  private intervalId: ReturnType<typeof setInterval> | null = null;

  async check(): Promise<void> {
    if (!browser) return;
    if (getServerMode() === "offline") {
      this.state = "unknown";
      return;
    }
    const result = await testServerConnection(apiClient.getBaseUrl());
    this.state = result === "ok" ? "connected" : "disconnected";
  }

  startPolling(intervalMs = 30_000): void {
    if (this.intervalId) return;
    void this.check();
    this.intervalId = setInterval(() => void this.check(), intervalMs);
  }

  stopPolling(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

export const connectionStatus = new ConnectionStatus();
