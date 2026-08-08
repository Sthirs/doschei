<script setup lang="ts">
import axios from 'axios';
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { api } from '@/lib/api';
import {
  balanceChipKind,
  balanceChipLabel,
  balanceColorClass,
  groupInitials,
} from '@/lib/format';
import { currentPageTitle } from '@/router';
import type { Group } from '@/types/group';

const router = useRouter();
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
    if (
      axios.isAxiosError(error) &&
      typeof error.response?.data?.message === 'string'
    ) {
      createErrorMessage.value = error.response.data.message;
    } else {
      createErrorMessage.value = 'We could not create your group.';
    }
  } finally {
    isCreating.value = false;
  }
};

onMounted(() => {
  currentPageTitle.value = 'Do Schèi';
  loadGroups();
});

onUnmounted(() => {
  currentPageTitle.value = null;
});
</script>

<template>
  <main class="flex flex-col flex-1 min-h-0">
    <!-- Loading state -->
    <div
      v-if="isLoading"
      class="flex-1 flex items-center justify-center text-[#C8C4D7]"
    >
      Loading your groups...
    </div>

    <!-- Error state -->
    <div
      v-else-if="errorMessage"
      class="flex-1 flex items-center justify-center px-6"
    >
      <p
        class="rounded-md border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
      >
        {{ errorMessage }}
      </p>
    </div>

    <!-- Group list -->
    <ul
      v-else-if="groups.length > 0"
      class="flex-1 overflow-y-auto px-4 py-4 space-y-3"
    >
      <li
        v-for="group in groups"
        :key="group.id"
        class="bg-[#1E1E26] border border-white/[0.08] rounded-xl cursor-pointer transition hover:bg-white/5"
        @click="
          router.push({
            name: 'group-detail',
            params: { id: group.id },
            state: { groupName: group.name },
          })
        "
      >
        <div class="flex items-center gap-4 px-4 py-4">
          <!-- Thumbnail: gradient + initials placeholder -->
          <div v-if="group.imageUrl" class="h-14 w-14 rounded-xl shrink-0">
            <img
              :src="group.imageUrl"
              :alt="`${group.name} image`"
              class="h-full w-full rounded-xl object-cover"
            />
          </div>
          <div
            v-else
            class="h-14 w-14 rounded-xl shrink-0 flex items-center justify-center bg-gradient-to-br from-[#6554E7] to-[#4a485d] text-white font-semibold text-lg"
            :aria-label="`${group.name} thumbnail`"
          >
            {{ groupInitials(group.name) }}
          </div>

          <!-- Middle: name + avatars + balance -->
          <div class="flex-1 min-w-0">
            <h2
              class="text-[20px] font-semibold tracking-[-0.025em] text-[#E5E0ED] truncate"
              style="line-height: 28px"
            >
              {{ group.name }}
            </h2>

            <!-- Member avatars: overlapping circles, max 3 + +N -->
            <div class="flex items-center mt-1.5 -space-x-2">
              <div
                v-for="(member, i) in group.members.slice(0, 3)"
                :key="member.id"
                class="h-6 w-6 rounded-full flex items-center justify-center bg-gradient-to-br from-[#6554E7]/60 to-[#4a485d]/60 text-white text-[11px] font-semibold ring-2 ring-[#13121B]"
                :style="{ zIndex: 3 - i }"
                :aria-label="member.displayName"
              >
                {{ member.displayName.trim().charAt(0).toUpperCase() }}
              </div>
              <div
                v-if="group.members.length > 3"
                class="h-6 w-6 rounded-full flex items-center justify-center bg-white/10 text-[#C8C4D7] text-[11px] font-medium ring-2 ring-[#13121B] z-0"
              >
                +{{ group.members.length - 3 }}
              </div>
            </div>

            <!-- Balance chip -->
            <p
              class="mt-1 text-xs"
              :class="
                balanceColorClass(balanceChipKind(group.netForCurrentUser))
              "
            >
              {{ balanceChipLabel(group.netForCurrentUser) }}
            </p>
          </div>

          <!-- Right chevron -->
          <svg
            class="h-5 w-5 shrink-0 text-[#C8C4D7]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </div>
      </li>
    </ul>

    <!-- Empty state -->
    <div v-else class="flex-1 flex items-center justify-center text-[#C8C4D7]">
      No groups yet.
    </div>

    <!-- Bottom: + Create group button -->
    <div class="shrink-0 relative">
      <!-- Gradient fade overlay above button -->
      <div
        class="absolute inset-x-0 bottom-full h-4 bg-gradient-to-t from-[#13121B] via-[#13121B]/50 to-transparent pointer-events-none"
      ></div>
      <div v-if="!isCreateFormVisible" class="px-4">
        <button
          type="button"
          class="mb-4 w-full rounded-xl bg-[#6554E7] py-4 text-[18px] font-normal text-[#F0EBFF] transition hover:bg-[#5a44cf] active:scale-[0.98]"
          style="line-height: 27px"
          @click="openCreateForm"
        >
          + Create group
        </button>
      </div>

      <!-- Inline create form (shown when button tapped) -->
      <form
        v-else
        class="flex flex-col gap-3 px-4 py-4"
        @submit.prevent="createGroup"
      >
        <label class="flex-1">
          <span class="sr-only">Group name</span>
          <input
            v-model="newGroupName"
            type="text"
            name="groupName"
            placeholder="Group name"
            autocomplete="off"
            class="w-full rounded-xl border border-[rgba(71,69,84,0.3)] bg-[#201F27] px-4 py-3 text-base text-[#E5E0ED] outline-none transition placeholder:text-[#C8C4D7] focus:border-brand-500/40 shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]"
          />
        </label>
        <div class="flex gap-3">
          <button
            type="submit"
            class="flex-1 rounded-xl bg-[#6554E7] py-3 text-base font-normal text-[#F0EBFF] transition hover:bg-[#5a44cf] disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="isCreating"
          >
            {{ isCreating ? 'Creating...' : 'Create' }}
          </button>
          <button
            type="button"
            class="rounded-xl border border-white/10 px-6 py-3 text-base font-medium text-[#E5E0ED] transition hover:border-white/20 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="isCreating"
            @click="closeCreateForm"
          >
            Cancel
          </button>
        </div>
        <p
          v-if="createErrorMessage"
          class="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
        >
          {{ createErrorMessage }}
        </p>
      </form>
    </div>
  </main>
</template>
