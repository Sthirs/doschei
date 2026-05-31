<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { api } from '@/lib/api';
import type { Group } from '@/types/group';

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

onMounted(loadGroups);
</script>

<template>
  <main class="px-4 py-6 text-slate-50 sm:px-6 lg:px-8">
    <div class="mx-auto flex max-w-5xl flex-col gap-4">
      <section class="glass-panel overflow-hidden rounded-md">
        <div v-if="isLoading" class="px-6 py-5 text-slate-300 sm:px-8">Loading your groups...</div>

        <ul v-else-if="groups.length > 0" class="divide-y divide-white/10">
          <li v-for="group in groups" :key="group.id" class="px-6 py-4 sm:px-8">
            <div class="flex items-center gap-4">
              <img
                v-if="group.imageUrl"
                :src="group.imageUrl"
                :alt="`${group.name} image`"
                class="h-14 w-14 rounded-md object-cover"
              />

              <div
                v-else
                class="flex h-14 w-14 items-center justify-center rounded-md bg-white/10 text-slate-300"
                aria-hidden="true"
              >
                <svg viewBox="0 0 24 24" class="h-7 w-7 fill-none stroke-current" stroke-width="1.8">
                  <rect x="4" y="6" width="16" height="12" rx="3" />
                  <path d="M8 10h8" />
                  <path d="M8 14h5" />
                </svg>
              </div>

              <h2 class="text-base font-medium text-slate-100 sm:text-lg">{{ group.name }}</h2>
            </div>
          </li>
        </ul>

        <div v-else class="px-6 py-5 text-slate-300 sm:px-8">No groups yet.</div>
      </section>

      <p v-if="errorMessage" class="rounded-md border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
        {{ errorMessage }}
      </p>
    </div>
  </main>
</template>
