<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { currentPageTitle } from '@/router';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const currentTitle = computed(() => String(currentPageTitle.value ?? route.meta.title ?? route.name ?? 'App'));
const userInitial = computed(() => authStore.user?.displayName?.trim().charAt(0).toUpperCase() ?? 'U');

const goToAccount = async () => {
  await router.push({ name: 'account' });
};
</script>

<template>
  <header>
    <div class="glass-panel flex items-center gap-3 px-4 py-3 sm:px-6 sm:py-4 border-l-0! border-r-0! border-t-0!">
      <!-- Leading slot (back arrow, contextual actions from child views) -->
      <div id="topbar-leading" class="flex shrink-0 items-center"></div>

      <div class="min-w-0 flex-1">
        <p class="text-[10px] uppercase tracking-[0.2em] text-brand-100/70 sm:text-xs">Do Schèi</p>
        <h1 class="mt-0.5 truncate text-lg font-semibold text-slate-50 sm:mt-1 sm:text-xl">{{ currentTitle }}</h1>
      </div>

      <!-- Actions slot (Settings, Add Expense, etc. from child views) -->
      <div id="topbar-actions" class="flex shrink-0 items-center gap-2"></div>

      <button
        type="button"
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-slate-100 transition hover:border-brand-500/40 hover:bg-brand-500/10 focus:outline-none focus:ring-2 focus:ring-brand-500/40 sm:h-11 sm:w-11"
        aria-label="Open account page"
        @click="goToAccount"
      >
        <span aria-hidden="true">{{ userInitial }}</span>
      </button>
    </div>
  </header>
</template>
