import { defineStore } from 'pinia';

import { api } from '@/lib/api';
import type { AuthUser } from '@/types/auth';

type LoginPayload = {
  email: string;
  password: string;
};

const TOKEN_KEY = 'doschei.auth.token';

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
  },
});
