import { defineStore } from 'pinia';
import axios from 'axios';

import { api } from '@/lib/api';
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from '@/lib/authToken';
import {
  suppressSessionRestore,
  tryRestoreSession as restoreSession,
} from '@/lib/sessionRefresh';
import { normalizeLocale, setAppLocale, type Locale } from '@/i18n';
import { removePushSubscription } from '@/lib/push';
import type { AuthUser } from '@/types/auth';

type LoginPayload = {
  email: string;
  password: string;
};

const applyUserLanguage = (user: AuthUser | null | undefined): void => {
  if (user?.language) setAppLocale(normalizeLocale(user.language));
};

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: getAccessToken() ?? '',
    user: null as AuthUser | null,
    isLoading: false,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token),
  },
  actions: {
    async login(payload: LoginPayload) {
      this.isLoading = true;

      try {
        const { data } = await api.post<{ token: string; user: AuthUser }>(
          '/auth/login',
          payload,
        );
        this.setToken(data.token);
        this.user = data.user;
        applyUserLanguage(this.user);
      } finally {
        this.isLoading = false;
      }
    },
    async fetchCurrentUser() {
      if (!this.token) {
        this.user = null;
        return null;
      }

      try {
        const { data } = await api.get<{ user: AuthUser }>('/auth/me');
        this.user = data.user;
        applyUserLanguage(this.user);
        return data.user;
      } catch (err: unknown) {
        if (axios.isAxiosError(err)) {
          const status = err.response?.status;
          // A 401 here has already been through the renew-and-retry
          // interceptor, so reaching this branch means the refresh cookie is
          // gone too. Network errors and 5xx deliberately keep the session.
          if (status === 401 || status === 403) {
            this.clearSession();
          }
        }
        return null;
      }
    },
    /**
     * Adopt a freshly minted access token. Kept as an action rather than a
     * direct assignment so `lib/sessionRefresh` can push rotated tokens into
     * the store without importing it (see main.ts).
     */
    setToken(token: string) {
      this.token = token;
      setAccessToken(token);
    },
    /**
     * User-initiated sign-out: revokes the refresh-token family server-side
     * (ADR-0023) before clearing local state, so the long-lived credential
     * cannot be replayed. The revocation is best-effort — a failed request
     * must still leave the user signed out locally.
     */
    async logout() {
      // Signing out is explicit, so stop the router guard from speculatively
      // trying to restore the session on the next navigation.
      suppressSessionRestore();
      try {
        await api.post('/auth/session/logout');
      } catch {
        // Offline, or the cookie was already dead. Clearing locally is the
        // part the user asked for.
      }
      // ADR-0025: must run before clearSession() drops the token, and before
      // the next person uses this device, or they would receive this user's
      // notifications.
      await removePushSubscription();
      this.clearSession();
    },
    /**
     * Drop local session state without touching the network. Used on paths
     * where the credential is already known to be dead, so a logout request
     * would be pointless.
     */
    clearSession() {
      this.token = '';
      this.user = null;
      clearAccessToken();
    },
    /**
     * Cold-boot restore from the refresh cookie when localStorage has no access
     * token — see `lib/sessionRefresh.tryRestoreSession`.
     */
    async tryRestoreSession() {
      const session = await restoreSession();
      if (!session) return null;

      this.token = session.token;

      if (session.user) {
        this.user = session.user;
        applyUserLanguage(this.user);
        return this.user;
      }

      // Another tab won the refresh, so there is no user in the response body.
      return this.fetchCurrentUser();
    },
    async loginWithToken(token: string) {
      this.setToken(token);
      await this.fetchCurrentUser();
    },
    async updateProfile(changes: { displayName?: string; language?: Locale }) {
      this.isLoading = true;

      try {
        const { data } = await api.patch<{ user: AuthUser }>(
          '/auth/me',
          changes,
        );
        this.user = data.user;
        if (changes.language) setAppLocale(changes.language);
        return data.user;
      } finally {
        this.isLoading = false;
      }
    },
    async uploadImage(file: File) {
      this.isLoading = true;

      try {
        const formData = new FormData();
        formData.append('image', file);
        const { data } = await api.post<{ user: AuthUser }>(
          '/auth/me/image',
          formData,
        );
        this.user = data.user;
        return data.user;
      } finally {
        this.isLoading = false;
      }
    },
  },
});
