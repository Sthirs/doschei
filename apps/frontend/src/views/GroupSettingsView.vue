<script setup lang="ts">
import { onMounted, onBeforeUnmount, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

import { goBackTo } from '@/lib/backNavigation';
import GroupSettingsPanel from '@/components/GroupSettingsPanel.vue';
import StatusNotice from '@/components/StatusNotice.vue';
import { useCachedGroupDetail } from '@/composables/useGroupData';
import { currentPageTitle } from '@/router';
import { useGroupDataStore } from '@/stores/groupData';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useGroupDataStore();

const groupId = computed(() => route.params.id as string);

// ADR-0030: read the shared cache entry; a settings change invalidates it
// (and the list), and the mounted read refetches.
const {
  data: group,
  isInitialLoading: isLoading,
  refreshFailed,
  blockingError,
} = useCachedGroupDetail(groupId);
const errorMessage = computed(() =>
  blockingError.value ? t('groupDetail.loadFailed') : '',
);

const setTitle = (name: string) => {
  currentPageTitle.value = t('groupDetail.settingsTitleSuffix', { name });
};
watch(
  () => group.value?.name,
  (name) => {
    if (name) setTitle(name);
  },
  { immediate: true },
);

const onUpdated = () => store.invalidateGroup(groupId.value);

const goBack = () => {
  goBackTo(router, {
    name: 'group-detail',
    params: { id: groupId.value },
    state: { groupName: group.value?.name },
  });
};

onMounted(() => {
  if (!group.value && history.state.groupName) {
    setTitle(String(history.state.groupName));
  }
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
      :aria-label="t('groupSettings.backToGroup')"
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

  <main class="flex-1 overflow-y-auto text-slate-50 sm:px-6 lg:px-8">
    <div class="mx-auto flex max-w-5xl flex-col gap-4">
      <section
        v-if="isLoading"
        class="glass-panel rounded-md px-6 py-5 text-slate-300 sm:px-8"
      >
        {{ t('groupSettings.loading') }}
      </section>

      <template v-else-if="group">
        <StatusNotice v-if="refreshFailed" :message="t('common.refreshFailed')" live />
        <GroupSettingsPanel :group="group" @updated="onUpdated" />
      </template>

      <StatusNotice v-if="errorMessage" :message="errorMessage" />
    </div>
  </main>
</template>
