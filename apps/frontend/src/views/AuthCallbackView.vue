<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

import { suppressSessionRestore } from '@/lib/sessionRefresh';
import { useAuthStore } from '@/stores/auth';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const error = ref('');
let redirectTimer: ReturnType<typeof setTimeout> | undefined;

onBeforeUnmount(() => {
  if (redirectTimer !== undefined) clearTimeout(redirectTimer);
});

onMounted(async () => {
  const token = route.query.token;

  if (typeof token !== 'string' || !token) {
    // No token means the backend never completed a callback, so no refresh
    // family was minted for us. Suppress the restore anyway: otherwise the
    // router guard fires a speculative refresh on the /login navigation below,
    // and a surviving cookie would turn this failure into a silent sign-in.
    error.value = t('auth.missingToken');
    suppressSessionRestore();
    redirectTimer = setTimeout(
      () => router.replace({ name: 'login', query: { error: 'oauth_failed' } }),
      2000,
    );
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
    // The IdP handshake DID succeed: oauthController mints a refresh family and
    // sets the cookie before redirecting here (ADR-0023), so a live 90-day
    // credential exists even though /auth/me just failed. A local-only
    // clearSession() would leave it in the browser, and the /login navigation's
    // guard would restore from it — bouncing a "failed" sign-in straight to
    // /groups, and on a shared device signing the next visitor in as this user.
    // logout() suppresses the restore synchronously, then revokes the family
    // server-side; it is best-effort and always clears locally.
    await authStore.logout();
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
