import { createPinia } from 'pinia';
import { createApp } from 'vue';
import { registerSW } from 'virtual:pwa-register';

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

// Mirror the active locale into <html lang> at boot; the auth store will
// call setAppLocale again after Task 8 wires the server-side preference.
setAppLocale(i18n.global.locale.value as Locale);

registerSW({ immediate: true });
