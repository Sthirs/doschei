<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const currentTitle = computed(() => String(route.meta.title ?? route.name ?? 'App'));
const userInitial = computed(() => authStore.user?.displayName?.trim().charAt(0).toUpperCase() ?? 'U');

const goToAccount = async () => {
  await router.push({ name: 'account' });
};
</script>

<template>
  <header>
    <div class="glass-panel flex items-center justify-between px-5 py-4 sm:px-6 !border-l-0 !border-r-0 !border-t-0">
      <div>
        <p class="text-xs uppercase  text-brand-100/70">Do Schèi</p>
        <h1 class="mt-2 text-xl font-semibold text-slate-50 sm:text-2xl">{{ currentTitle }}</h1>
      </div>

      <button
        type="button"
        class="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-slate-100 transition hover:border-brand-500/40 hover:bg-brand-500/10 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        aria-label="Open account page"
        @click="goToAccount"
      >
        <span aria-hidden="true">{{ userInitial }}</span>
      </button>
    </div>
  </header>
</template>
