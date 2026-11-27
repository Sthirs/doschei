import axios from 'axios';
import {
  computed,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue';
import { useI18n } from 'vue-i18n';

import { useCachedGroupsList } from '@/composables/useGroupData';
import { api } from '@/lib/api';
import { balanceChipKind, formatEur } from '@/lib/format';
import { currentPageTitle } from '@/router';
import { useGroupDataStore } from '@/stores/groupData';
import type { Group, InvitationListItem } from '@/types/group';

export type UseGroupsViewReturn = {
  groups: ComputedRef<Group[]>;
  invitations: ComputedRef<InvitationListItem[]>;
  isLoading: ComputedRef<boolean>;
  errorMessage: ComputedRef<string>;
  refreshFailed: ComputedRef<boolean>;
  acceptingInvitationId: Ref<string | null>;
  decliningInvitationId: Ref<string | null>;
  invitationErrorMessage: Ref<string>;
  failingInvitationId: Ref<string | null>;
  acceptInvitation: (invitation: InvitationListItem) => Promise<void>;
  declineInvitation: (invitation: InvitationListItem) => Promise<void>;
  newGroupName: Ref<string>;
  isCreateFormVisible: Ref<boolean>;
  isCreating: Ref<boolean>;
  createErrorMessage: Ref<string>;
  openCreateForm: () => void;
  closeCreateForm: () => void;
  createGroup: () => Promise<void>;
  balanceChipLabel: (netForCurrentUser: number) => string;
};

/**
 * View model for `GroupsView`: the cached group + invitation list, the
 * invitation accept/decline responses, the inline create-group form, the
 * localized balance-chip label, and the `currentPageTitle` mount/unmount
 * coupling every view shares.
 *
 * Unlike `useExpenseSplit` — a *shared*, deliberately i18n-free logic
 * composable — this one is bound to a single view and already depends on the
 * API client and the module-level `currentPageTitle` ref, so it resolves its
 * own strings through `useI18n()` instead of taking injected messages.
 *
 * MUST be called synchronously from `setup()`: it registers `onMounted` /
 * `onUnmounted`.
 */
export const useGroupsView = (): UseGroupsViewReturn => {
  const { t, locale } = useI18n();

  // ADR-0030: the list renders from the in-memory cache and revalidates.
  const store = useGroupDataStore();
  const list = useCachedGroupsList();
  const groups = computed(() => list.data.value?.groups ?? []);
  const invitations = computed(() => list.data.value?.invitations ?? []);
  const isLoading = list.isInitialLoading;
  const errorMessage = computed(() =>
    list.blockingError.value ? t('groups.loadFailed') : '',
  );

  const loadGroups = async () => {
    store.invalidateList();
    await list.refresh();
  };

  // Warm the first groups' details so opening one is instant (ADR-0030 §5).
  watch(groups, (next) => store.prefetchDetails(next.map((g) => g.id)), {
    immediate: true,
  });

  const acceptingInvitationId = ref<string | null>(null);
  const decliningInvitationId = ref<string | null>(null);
  const invitationErrorMessage = ref('');
  const failingInvitationId = ref<string | null>(null);

  const respondToInvitation = async (
    invitation: InvitationListItem,
    action: 'accept' | 'decline',
    pendingId: Ref<string | null>,
    errorKey: 'groups.acceptError' | 'groups.declineError',
  ): Promise<void> => {
    invitationErrorMessage.value = '';
    failingInvitationId.value = null;
    pendingId.value = invitation.id;
    try {
      await api.post(
        `/groups/${invitation.groupId}/invitations/${invitation.id}/${action}`,
      );
      await loadGroups();
    } catch {
      invitationErrorMessage.value = t(errorKey);
      failingInvitationId.value = invitation.id;
    } finally {
      pendingId.value = null;
    }
  };

  const acceptInvitation = (invitation: InvitationListItem): Promise<void> =>
    respondToInvitation(
      invitation,
      'accept',
      acceptingInvitationId,
      'groups.acceptError',
    );

  const declineInvitation = (invitation: InvitationListItem): Promise<void> =>
    respondToInvitation(
      invitation,
      'decline',
      decliningInvitationId,
      'groups.declineError',
    );

  const newGroupName = ref('');
  const isCreateFormVisible = ref(false);
  const isCreating = ref(false);
  const createErrorMessage = ref('');

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
      createErrorMessage.value = t('groups.enterGroupName');
      return;
    }

    isCreating.value = true;
    createErrorMessage.value = '';

    try {
      await api.post('/groups', { name });
      closeCreateForm();
      await loadGroups();
    } catch (error: unknown) {
      if (
        axios.isAxiosError(error) &&
        typeof error.response?.data?.message === 'string'
      ) {
        createErrorMessage.value = error.response.data.message;
      } else {
        createErrorMessage.value = t('groups.createFailed');
      }
    } finally {
      isCreating.value = false;
    }
  };

  // Compose the per-row balance label inline (was `balanceChipLabel` in
  // format.ts before Task 2 extracted the sentence into the message catalog).
  const balanceChipLabel = (netForCurrentUser: number): string => {
    const kind = balanceChipKind(netForCurrentUser);
    const amount = formatEur(Math.abs(netForCurrentUser), locale.value);
    if (kind === 'owed') return t('common.balanceOwed', { amount });
    if (kind === 'owe') return t('common.balanceOwe', { amount });
    return t('common.balanceSettled');
  };

  onMounted(() => {
    currentPageTitle.value = t('groups.title');
  });

  onUnmounted(() => {
    currentPageTitle.value = null;
  });

  return {
    groups,
    invitations,
    isLoading,
    errorMessage,
    refreshFailed: list.refreshFailed,
    acceptingInvitationId,
    decliningInvitationId,
    invitationErrorMessage,
    failingInvitationId,
    acceptInvitation,
    declineInvitation,
    newGroupName,
    isCreateFormVisible,
    isCreating,
    createErrorMessage,
    openCreateForm,
    closeCreateForm,
    createGroup,
    balanceChipLabel,
  };
};
