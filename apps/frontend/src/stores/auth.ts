import { defineStore } from 'pinia';

import { api } from '@/lib/api';
import { normalizeLocale, setAppLocale, type Locale } from '@/i18n';
import type { AuthUser } from '@/types/auth';

type LoginPayload = {
  email: string;
  password: string;
};

const TOKEN_KEY = 'doschei.auth.token';

const applyUserLanguage = (user: AuthUser | null | undefined): void => {
  if (user?.language) setAppLocale(normalizeLocale(user.language));
};

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem(TOKEN_KEY) ?? '',
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
        const { data } = await api.post<{ token: string; user: AuthUser }>('/auth/login', payload);
        this.token = data.token;
        this.user = data.user;
        localStorage.setItem(TOKEN_KEY, data.token);
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
      } catch {
        this.logout();
        return null;
      }
    },
    logout() {
      this.token = '';
      this.user = null;
      localStorage.removeItem(TOKEN_KEY);
    },
    async loginWithToken(token: string) {
      this.token = token;
      localStorage.setItem(TOKEN_KEY, token);
      await this.fetchCurrentUser();
    },
    async updateProfile(changes: { displayName?: string; language?: Locale }) {
      this.isLoading = true;

      try {
        const { data } = await api.patch<{ user: AuthUser }>('/auth/me', changes);
        this.user = data.user;
        if (changes.language) setAppLocale(changes.language);
        return data.user;
      } finally {
        this.isLoading = false;
      }
    },
  },
});
