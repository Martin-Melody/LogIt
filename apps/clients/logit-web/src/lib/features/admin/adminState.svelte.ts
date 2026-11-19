import { adminApi, webOriginMismatch } from "./adminApi";

/** Whether the signed-in account is an admin (or may claim admin), and the counts the admin
 * sidebar shows. Loaded after sign-in; refreshed after anything that changes the counts. */
class AdminState {
  isAdmin = $state(false);
  claimOffered = $state(false);
  loaded = $state(false);
  openReports = $state(0);
  pluginsWaiting = $state(0);
  people = $state(0);
  emailConfigured = $state(true);
  webOrigin = $state<string | null>(null);
  /** Things on the Server page that need a look: email not set up, emails linking elsewhere. */
  serverWarnings = $derived((this.emailConfigured ? 0 : 1) + (webOriginMismatch(this.webOrigin) ? 1 : 0));

  async refresh(): Promise<void> {
    try {
      const me = await adminApi.me();
      this.isAdmin = me.isAdmin;
      this.claimOffered = me.claimOffered;
    } catch {
      // An older server without /admin/me: no admin console there.
      this.isAdmin = false;
      this.claimOffered = false;
    }
    this.loaded = true;
  }

  async refreshCounts(): Promise<void> {
    if (!this.isAdmin) return;
    try {
      const o = await adminApi.overview();
      this.setCounts(o);
    } catch {
      /* the badges just stay as they were */
    }
  }

  setCounts(o: { openReports: number; pluginsWaiting: number; people: number; server: { emailConfigured: boolean; webOrigin: string | null } }) {
    this.openReports = o.openReports;
    this.pluginsWaiting = o.pluginsWaiting;
    this.people = o.people;
    this.emailConfigured = o.server.emailConfigured;
    this.webOrigin = o.server.webOrigin;
  }

  reset() {
    this.isAdmin = false;
    this.claimOffered = false;
    this.loaded = false;
  }
}

export const adminState = new AdminState();
