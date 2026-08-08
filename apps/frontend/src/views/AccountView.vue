<script setup lang="ts">
import { useRouter } from 'vue-router';

import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
const router = useRouter();

const logout = async () => {
  authStore.logout();
  await router.push('/login');
};
</script>

<template>
  <main class="flex-1 overflow-y-auto px-4 py-6 text-slate-50 sm:px-6 lg:px-8">
    <div class="mx-auto max-w-3xl">
      <section class="glass-panel rounded-md p-6 sm:p-8">
        <div class="space-y-6">
          <div>
            <p class="text-sm uppercase tracking-[0.35em] text-brand-100/70">Profile</p>
            <h2 class="mt-3 text-2xl font-semibold">Your account</h2>
          </div>

          <dl class="space-y-4">
            <div class="rounded-md border border-white/10 bg-white/5 px-4 py-4">
              <dt class="text-sm text-slate-400">Name</dt>
              <dd class="mt-1 font-medium text-slate-100">{{ authStore.user?.displayName ?? '—' }}</dd>
            </div>

            <div class="rounded-md border border-white/10 bg-white/5 px-4 py-4">
              <dt class="text-sm text-slate-400">Email</dt>
              <dd class="mt-1 font-medium text-slate-100">{{ authStore.user?.email ?? '—' }}</dd>
            </div>
          </dl>

          <button
            type="button"
            class="rounded-md border border-white/10 px-4 py-3 text-sm font-medium text-slate-100 transition hover:border-brand-500/40 hover:bg-brand-500/10"
            @click="logout"
          >
            Sign out
          </button>
        </div>
      </section>
    </div>
  </main>
</template>
