<script setup lang="ts">
import axios from 'axios';
import { onMounted, ref } from 'vue';

import { api } from '@/lib/api';
import type { Group } from '@/types/group';

const groups = ref<Group[]>([]);
const isLoading = ref(true);
const errorMessage = ref('');
const newGroupName = ref('');
const isCreateFormVisible = ref(false);
const isCreating = ref(false);
const createErrorMessage = ref('');

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

const openCreateForm = () => {
  isCreateFormVisible.value = true;
  createErrorMessage.value = '';
};

const closeCreateForm = () => {
  isCreateFormVisible.value = false;
  isCreating.value = false;
  newGroupName.value = '';
  createErrorMessage.value = '';
};

const createGroup = async () => {
  const name = newGroupName.value.trim();

  if (!name) {
    createErrorMessage.value = 'Enter a group name.';
    return;
  }

  isCreating.value = true;
  createErrorMessage.value = '';

  try {
    await api.post('/groups', { name });
    closeCreateForm();
    await loadGroups();
  } catch (error) {
    if (axios.isAxiosError(error) && typeof error.response?.data?.message === 'string') {
      createErrorMessage.value = error.response.data.message;
    } else {
      createErrorMessage.value = 'We could not create your group.';
    }
  } finally {
    isCreating.value = false;
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

      <section class="glass-panel rounded-md px-6 py-5 sm:px-8">
        <div class="flex flex-col gap-4">
          <button
            v-if="!isCreateFormVisible"
            type="button"
            class="w-full rounded-md border border-white/10 px-4 py-3 text-sm font-medium text-slate-100 transition hover:border-brand-500/40 hover:bg-brand-500/10 sm:w-fit"
            @click="openCreateForm"
          >
            Create group
          </button>

          <form v-else class="flex flex-col gap-3 sm:flex-row sm:items-start" @submit.prevent="createGroup">
            <label class="flex-1">
              <span class="sr-only">Group name</span>
              <input
                v-model="newGroupName"
                type="text"
                name="groupName"
                placeholder="Group name"
                autocomplete="off"
                class="w-full rounded-md border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-brand-500/40 focus:bg-white/10"
              />
            </label>

            <div class="flex gap-3">
              <button
                type="submit"
                class="rounded-md bg-brand-500 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="isCreating"
              >
                {{ isCreating ? 'Creating...' : 'Create' }}
              </button>

              <button
                type="button"
                class="rounded-md border border-white/10 px-4 py-3 text-sm font-medium text-slate-100 transition hover:border-white/20 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="isCreating"
                @click="closeCreateForm"
              >
                Cancel
              </button>
            </div>
          </form>

          <p
            v-if="createErrorMessage"
            class="rounded-md border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
          >
            {{ createErrorMessage }}
          </p>
        </div>
      </section>

      <p v-if="errorMessage" class="rounded-md border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
        {{ errorMessage }}
      </p>
    </div>
  </main>
</template>
