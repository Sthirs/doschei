<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import type { Group } from '@/types/group';

const authStore = useAuthStore();
const router = useRouter();

const groups = ref<Group[]>([]);
const isLoading = ref(true);
const errorMessage = ref('');

const loadGroups = async () => {
  isLoading.value = true;
  errorMessage.value = '';

  try {
    const { data } = await api.get<{ groups: Group[] }>('/groups');
    groups.value = data.groups;
  } catch {
    errorMessage.value = 'We could not load your groups.';
  } finally {
    isLoading.value = false;
  }
};

const logout = async () => {
  authStore.logout();
  await router.push('/login');
};

onMounted(loadGroups);
</script>

<template>
  <main class="min-h-screen px-4 py-6 text-slate-50 sm:px-6 lg:px-8">
    <div class="mx-auto flex max-w-6xl flex-col gap-6">
      <header class="glass-panel flex flex-col gap-6 rounded-[2rem] p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
        <div>
          <p class="text-sm uppercase tracking-[0.35em] text-brand-100/70">Groups</p>
          <h1 class="mt-3 text-3xl font-semibold sm:text-4xl">Good to see you, {{ authStore.user?.displayName }}.</h1>
          <p class="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
            This is the first post-login landing screen. It proves the auth flow, protected routing, and basic group
            membership API.
          </p>
        </div>

        <button
          type="button"
          class="rounded-2xl border border-white/10 px-4 py-3 text-sm font-medium text-slate-100 transition hover:border-brand-500/40 hover:bg-brand-500/10"
          @click="logout"
        >
          Sign out
        </button>
      </header>

      <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <article v-if="isLoading" class="glass-panel rounded-[2rem] p-6 text-slate-300">Loading your groups...</article>

        <article
          v-for="group in groups"
          :key="group.id"
          class="glass-panel rounded-[2rem] p-6 transition hover:-translate-y-1 hover:border-brand-500/30"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs uppercase tracking-[0.3em] text-brand-100/70">Active group</p>
              <h2 class="mt-3 text-xl font-semibold">{{ group.name }}</h2>
            </div>
            <div class="rounded-full bg-brand-500/15 px-3 py-1 text-xs font-medium text-brand-100">
              {{ group.memberCount }} members
            </div>
          </div>

          <ul class="mt-6 space-y-3">
            <li
              v-for="member in group.members"
              :key="member.id"
              class="flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 px-4 py-3"
            >
              <span class="font-medium">{{ member.displayName }}</span>
              <span class="text-sm text-slate-400">{{ member.email }}</span>
            </li>
          </ul>
        </article>

        <article
          v-if="!isLoading && groups.length === 0"
          class="glass-panel rounded-[2rem] border-dashed p-6 text-slate-300 md:col-span-2 xl:col-span-3"
        >
          No groups yet. Seed data or future create-group flow will populate this view.
        </article>
      </section>

      <p v-if="errorMessage" class="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
        {{ errorMessage }}
      </p>
    </div>
  </main>
</template>
