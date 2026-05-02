import { apiClient, type AuthUser } from "./client";

function createAuthStore() {
  let user = $state<AuthUser | null>(null);
  let ready = $state(false);

  async function init() {
    await apiClient.init();
    user = apiClient.getUser();
    ready = true;
  }

  async function login(usernameOrEmail: string, password: string) {
    user = await apiClient.login(usernameOrEmail, password);
  }

  async function register(
    username: string,
    email: string,
    password: string,
    displayName: string,
  ) {
    user = await apiClient.register(username, email, password, displayName);
  }

  async function logout() {
    await apiClient.logout();
    user = null;
  }

  return {
    get user() { return user; },
    get ready() { return ready; },
    get isAuthenticated() { return user !== null; },
    init,
    login,
    register,
    logout,
  };
}

export const authStore = createAuthStore();
