import { createPinia } from 'pinia';
import { createApp } from 'vue';
import { registerSW } from 'virtual:pwa-register';
import { createBrowserPorts, checkForNewBuild, shouldRunCheck } from '@/lib/appVersion';
import { setupPushNotifications } from '@/lib/push';
import { onAccessTokenChange, onSessionExpired } from '@/lib/sessionRefresh';
import { useAuthStore } from '@/stores/auth';

import App from './App.vue';
import { i18n, setAppLocale, type Locale } from './i18n';
import { router } from './router';
import '@fontsource-variable/inter';
import '@fontsource-variable/geist';
import 'v-calendar/dist/style.css';
import SetupCalendar from 'v-calendar';
import './style.css';

const app = createApp(App);

// i18n must be registered before the router: route components call useI18n()
// during the first navigation, before they reach `app.mount`.
app.use(i18n);
app.use(createPinia());
app.use(router);
app.use(SetupCalendar, {});

app.mount('#app');

// ADR-0023: `lib/sessionRefresh` cannot import the store (that would close a
// cycle through `lib/api`), so the wiring is registered here, after Pinia is
// installed.
onAccessTokenChange((token) => {
  useAuthStore().setToken(token);
});

onSessionExpired(() => {
  useAuthStore().clearSession();

  const current = router.currentRoute.value;
  // Only bounce from a guarded page; redirecting while already on /login would
  // loop. `redirect` is preserved so re-authenticating lands the user back where
  // they were, matching the router guard and LoginView's redirectTarget.
  if (current.meta.requiresAuth) {
    void router.replace({
      name: 'login',
      query: { redirect: current.fullPath, error: 'expired' },
    });
  }
});

// ADR-0025: there is no settings UI for push, so it is wired to the
// authenticated session itself rather than to any one user action.
// `$subscribe` reacts to every path that establishes a token — login,
// silent refresh, and cold-boot cookie restore — without adding an import
// to stores/auth.ts. The `pushWired` guard keeps this to real
// signed-out→signed-in transitions instead of firing on every unrelated
// state mutation (e.g. `isLoading` toggling during login).
{
  const authStore = useAuthStore();
  let pushWired = false;

  const wirePushIfNeeded = () => {
    if (authStore.token && !pushWired) {
      pushWired = true;
      setupPushNotifications();
    } else if (!authStore.token) {
      pushWired = false;
    }
  };

  authStore.$subscribe(wirePushIfNeeded);
  wirePushIfNeeded();
}

// Mirror the active locale into <html lang> at boot; the auth store will
// call setAppLocale again after Task 8 wires the server-side preference.
setAppLocale(i18n.global.locale.value as Locale);

registerSW({ immediate: true });

// Version check probe — runs at boot and on visibility change, throttled to 30s
const ports = createBrowserPorts();
let lastCheckMs: number | undefined;

const probe = () => {
  const now = Date.now();
  if (!shouldRunCheck(now, lastCheckMs)) return;
  lastCheckMs = now;
  void checkForNewBuild(ports).catch(() => undefined);
};

probe();

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') probe();
});
