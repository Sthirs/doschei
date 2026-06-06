<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { api } from '@/lib/api';
import GroupSettingsPanel from '@/components/GroupSettingsPanel.vue';
import { currentPageTitle } from '@/router';
import type { GroupDetail } from '@/types/group';

const route = useRoute();
const router = useRouter();

const group = ref<GroupDetail | null>(null);
const isLoading = ref(true);
const errorMessage = ref('');

const groupId = computed(() => route.params.id as string);

const loadGroup = async () => {
  isLoading.value = true;
  errorMessage.value = '';

  try {
    const { data } = await api.get<{ group: GroupDetail }>(`/groups/${groupId.value}`);
    group.value = data.group;
    currentPageTitle.value = `${data.group.name} Settings`;
  } catch {
    errorMessage.value = 'We could not load this group.';
  } finally {
    isLoading.value = false;
  }
};

const goBack = () => {
  router.push({ name: 'group-detail', params: { id: groupId.value }, state: { groupName: group.value?.name } });
};

onMounted(() => {
  if (history.state.groupName) {
    currentPageTitle.value = `${history.state.groupName} Settings`;
  }
  loadGroup();
});

onBeforeUnmount(() => {
  currentPageTitle.value = null;
});
</script>

<template>
  <!-- Topbar: back arrow -->
  <Teleport to="#topbar-leading">
    <button
      type="button"
      class="flex h-9 w-9 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-slate-100"
      aria-label="Back to group"
      @click="goBack"
    >
      <svg viewBox="0 0 20 20" class="h-5 w-5 fill-current">
        <path
          fill-rule="evenodd"
          d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
          clip-rule="evenodd"
        />
      </svg>
    </button>
  </Teleport>

  <main class="px-4 py-6 text-slate-50 sm:px-6 lg:px-8">
    <div class="mx-auto flex max-w-5xl flex-col gap-4">
      <section v-if="isLoading" class="glass-panel rounded-md px-6 py-5 text-slate-300 sm:px-8">
        Loading settings...
      </section>

      <template v-else-if="group">
        <GroupSettingsPanel :group="group" @updated="loadGroup" />
      </template>

      <p
        v-if="errorMessage"
        class="rounded-md border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
      >
        {{ errorMessage }}
      </p>
    </div>
  </main>
</template>
