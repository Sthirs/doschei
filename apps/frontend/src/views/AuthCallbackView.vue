<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

import { useAuthStore } from '@/stores/auth';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const error = ref('');

onMounted(async () => {
  const token = route.query.token;

  if (typeof token !== 'string' || !token) {
    error.value = t('auth.missingToken');
    setTimeout(() => router.replace({ name: 'login', query: { error: 'oauth_failed' } }), 2000);
    return;
  }

  // Strip token from URL IMMEDIATELY, before any async work (security:
  // prevents JWT leakage via history, referrer, or bookmark before redirect).
  history.replaceState({}, '', '/auth/callback');

  try {
    await authStore.loginWithToken(token);
    if (authStore.user) {
      const redirectTarget = typeof route.query.redirect === 'string' ? route.query.redirect : '/groups';
      await router.replace(redirectTarget);
      return;
    }
    throw new Error('loginWithToken did not set user');
  } catch {
    authStore.logout();
    await router.replace({ name: 'login', query: { error: 'oauth_failed' } });
  }
});
</script>

<template>
  <main class="flex min-h-screen items-center justify-center px-4 py-12 text-slate-50">
    <div class="glass-panel rounded-md p-10 text-center shadow-2xl" v-if="!error">
      <p class="text-lg font-medium">{{ t('auth.signingIn') }}</p>
      <div class="mt-4 h-1 w-48 mx-auto rounded-full bg-white/10 overflow-hidden">
        <div class="h-full animate-pulse rounded-full bg-brand-500 w-1/2" />
      </div>
    </div>
    <div class="glass-panel rounded-md p-10 text-center shadow-2xl" v-else>
      <p class="text-lg font-medium text-rose-300">{{ error }}</p>
      <p class="mt-2 text-sm text-slate-400">{{ t('auth.redirectingToLogin') }}</p>
    </div>
  </main>
</template>
