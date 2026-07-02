<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();

const form = reactive({
  email: 'demo@doschei.local',
  password: 'password123',
});

const errorMessage = ref('');
const oauthConfig = ref<{ enabled: boolean; buttonText: string; autoLaunch: boolean } | null>(null);

const redirectTarget = computed(() => String(route.query.redirect ?? '/groups'));

const submit = async () => {
  errorMessage.value = '';

  try {
    await authStore.login(form);
    await router.push(redirectTarget.value);
  } catch {
    errorMessage.value = 'We could not sign you in with those credentials.';
  }
};

onMounted(async () => {
  try {
    const { data } = await api.get('/auth/oauth/config');
    oauthConfig.value = data;
    if (data.autoLaunch && data.enabled) {
      window.location.href = '/api/auth/oauth';
    }
  } catch {
    // OAuth config endpoint unavailable — hide the button
  }
});
</script>

<template>
  <main class="flex min-h-screen items-center justify-center px-4 py-12 text-slate-50">
    <div class="grid w-full max-w-5xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <section class="hidden rounded-md border border-white/10 bg-white/5 p-10 shadow-glow lg:block">
        <p class="mb-4 text-sm uppercase tracking-[0.35em] text-brand-100/80">Do Schèi</p>
        <h1 class="max-w-md text-5xl font-semibold leading-tight">
          Manage and share your expenses
        </h1>
        <div class="px-20">
          <img src="/logo.svg">
        </div>
        <div class="mt-10 grid gap-4 sm:grid-cols-2">
          <div class="glass-panel rounded-md p-5">
            <p class="text-xs uppercase tracking-[0.3em] text-brand-100/70">Demo user</p>
            <p class="mt-3 font-medium">demo@doschei.local</p>
          </div>
          <div class="glass-panel rounded-md p-5">
            <p class="text-xs uppercase tracking-[0.3em] text-brand-100/70">Password</p>
            <p class="mt-3 font-medium">password123</p>
          </div>
        </div>
      </section>

      <section class="glass-panel rounded-md p-6 shadow-2xl sm:p-10">
        <div class="mx-auto max-w-md">
          <p class="text-sm uppercase tracking-[0.35em] text-brand-100/70">Welcome back</p>
          <h2 class="mt-3 text-3xl font-semibold">Sign in to your workspace</h2>
          <p class="mt-3 text-sm leading-6 text-slate-300">
            Local email/password auth is enabled first so the bootstrap can be tested quickly in development.
          </p>

          <form class="mt-10 space-y-5" @submit.prevent="submit">
            <label class="block">
              <span class="mb-2 block text-sm text-slate-200">Email</span>
              <input
                v-model="form.email"
                type="email"
                required
                class="w-full rounded-md border border-white/10 bg-slate-950/60 px-4 py-3 text-slate-50 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
              />
            </label>

            <label class="block">
              <span class="mb-2 block text-sm text-slate-200">Password</span>
              <input
                v-model="form.password"
                type="password"
                required
                class="w-full rounded-md border border-white/10 bg-slate-950/60 px-4 py-3 text-slate-50 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
              />
            </label>

            <p v-if="errorMessage" class="rounded-md border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {{ errorMessage }}
            </p>

            <button
              type="submit"
              class="w-full rounded-md bg-brand-500 px-4 py-3 font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="authStore.isLoading"
            >
              {{ authStore.isLoading ? 'Signing in...' : 'Sign in' }}
            </button>
          </form>

          <template v-if="oauthConfig?.enabled">
            <div class="mt-6 flex items-center gap-3">
              <span class="h-px flex-1 bg-white/10"></span>
              <span class="text-xs uppercase tracking-widest text-slate-400">or</span>
              <span class="h-px flex-1 bg-white/10"></span>
            </div>

            <a
              href="/api/auth/oauth"
              class="mt-6 flex w-full items-center justify-center gap-3 rounded-md border border-white/10 bg-white/5 px-4 py-3 font-medium text-slate-50 transition hover:bg-white/10"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              {{ oauthConfig.buttonText }}
            </a>
          </template>
        </div>
      </section>
    </div>
  </main>
</template>
