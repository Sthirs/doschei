import { createPinia } from 'pinia';
import { createApp } from 'vue';
import { registerSW } from 'virtual:pwa-register';

import App from './App.vue';
import { router } from './router';
import '@fontsource-variable/inter';
import '@fontsource-variable/geist';
import '@vuepic/vue-datepicker/dist/main.css';
import 'v-calendar/dist/style.css';
import SetupCalendar from 'v-calendar';
import './style.css';

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(SetupCalendar, {});

app.mount('#app');

registerSW({ immediate: true });
