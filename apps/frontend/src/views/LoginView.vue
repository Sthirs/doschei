<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const { t } = useI18n();
const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();

const form = reactive({
  email: 'demo@doschei.local',
  password: 'password123',
});

const errorMessage = ref('');
const showPassword = ref(false);
const oauthConfig = ref<{ enabled: boolean; buttonText: string; autoLaunch: boolean } | null>(null);
const authConfig = ref<{ localLoginEnabled: boolean; localRegistrationEnabled: boolean } | null>(null);

const redirectTarget = computed(() => String(route.query.redirect ?? '/groups'));

const submit = async () => {
  errorMessage.value = '';

  try {
    await authStore.login(form);
    await router.push(redirectTarget.value);
  } catch {
    errorMessage.value = t('login.loginFailed');
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
  try {
    const { data } = await api.get('/auth/config');
    authConfig.value = data;
  } catch {
    // auth/config unavailable — default to showing form
  }
});
</script>

<template>
  <main class="flex min-h-screen items-center justify-center px-5 py-8">
    <div class="w-full max-w-[390px]">
      <img src="/logo.svg" alt="Do Schèi logo" class="mx-auto h-35 w-35" />
      <h1 class="mt-4 text-center text-5xl font-bold text-[#C6BFFF]">Do Schèi</h1>
      <h2 class="mt-2 text-center text-3xl font-bold text-text-primary">{{ t('login.welcome') }}</h2>
      <p class="mt-2 text-center text-base text-text-secondary">{{ t('login.subtitle') }}</p>

      <div class="mt-8">
        <template v-if="authConfig === null || authConfig.localLoginEnabled">
          <form class="space-y-6" @submit.prevent="submit">
            <div>
              <label class="sr-only" for="email">{{ t('login.email') }}</label>
              <input
                id="email"
                v-model="form.email"
                type="email"
                required
                :placeholder="t('login.email')"
                class="h-[58px] w-full rounded-xl border border-white/10 bg-[#1E1E26] px-4 text-text-primary outline-none transition placeholder:text-text-secondary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
              />
            </div>

            <div class="relative">
              <label class="sr-only" for="password">{{ t('login.password') }}</label>
              <input
                id="password"
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                required
                :placeholder="t('login.password')"
                class="h-[58px] w-full rounded-xl border border-white/10 bg-[#1E1E26] px-4 pr-12 text-text-primary outline-none transition placeholder:text-text-secondary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
              />
              <button
                type="button"
                class="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary transition hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                :aria-label="showPassword ? t('login.hidePassword') : t('login.showPassword')"
                :aria-pressed="showPassword"
                @click="showPassword = !showPassword"
              >
                <img v-if="showPassword" src="/icons/eye-pwd-show.svg" alt="" aria-hidden="true" class="h-5 w-[22px]" />
                <img v-else src="/icons/eye-pwd-hide.svg" alt="" aria-hidden="true" class="h-5 w-[22px]" />
              </button>
            </div>

            <p v-if="errorMessage" class="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {{ errorMessage }}
            </p>

            <button
              type="submit"
              :disabled="authStore.isLoading"
              class="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-brand-500 font-semibold text-[#F0EBFF] transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {{ authStore.isLoading ? t('login.loggingIn') : t('login.logIn') }}
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F0EBFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </button>
          </form>
        </template>
        <template v-else-if="!oauthConfig?.enabled">
          <p class="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-center text-sm text-text-secondary">
            {{ t('login.signInUnavailable') }}
          </p>
        </template>

        <template v-if="oauthConfig?.enabled">
          <a
            href="/api/auth/oauth"
            class="mt-6 flex h-[52px] w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-[#1E1E26] font-medium text-white transition hover:bg-white/10"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            {{ oauthConfig.buttonText }}
          </a>
        </template>
      </div>
    </div>
  </main>
</template>
