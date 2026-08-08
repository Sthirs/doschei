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
      <div class="flex items-center gap-3 px-5 py-3.5" style="background: rgba(19, 18, 27, 0.8); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(255,255,255,0.05);">
        <!-- Leading slot (back arrow, contextual actions from child views) -->
        <div id="topbar-leading" class="flex shrink-0 items-center"></div>

        <div class="min-w-0 flex-1">
          <h1 class="truncate text-[20px] font-bold tracking-[-0.025em] text-[#E5E0ED]" style="line-height: 32px;">{{ currentTitle }}</h1>
        </div>

      <!-- Actions slot (Settings, Add Expense, etc. from child views) -->
      <div id="topbar-actions" class="flex shrink-0 items-center gap-2"></div>

      <button
        type="button"
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-[#E5E0ED] transition hover:border-brand-500/40 hover:bg-brand-500/10 focus:outline-none focus:ring-2 focus:ring-brand-500/40 sm:h-11 sm:w-11"
        aria-label="Open account page"
        @click="goToAccount"
      >
        <span aria-hidden="true">{{ userInitial }}</span>
      </button>
    </div>
  </header>
</template>
