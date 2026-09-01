import axios from 'axios';
import { onMounted, onUnmounted, ref, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { api } from '@/lib/api';
import { balanceChipKind, formatEur } from '@/lib/format';
import { currentPageTitle } from '@/router';
import type {
  Group,
  GroupsListResponse,
  InvitationListItem,
} from '@/types/group';

export type UseGroupsViewReturn = {
  groups: Ref<Group[]>;
  invitations: Ref<InvitationListItem[]>;
  isLoading: Ref<boolean>;
  errorMessage: Ref<string>;
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
 * View model for `GroupsView`: the group + invitation list fetch, the
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

  const groups = ref<Group[]>([]);
  const invitations = ref<InvitationListItem[]>([]);
  const isLoading = ref(true);
  const errorMessage = ref('');

  const loadGroups = async () => {
    isLoading.value = true;
    errorMessage.value = '';

    try {
      const { data } = await api.get<GroupsListResponse>('/groups');
      groups.value = data.groups;
      invitations.value = data.invitations ?? [];
    } catch {
      errorMessage.value = t('groups.loadFailed');
    } finally {
      isLoading.value = false;
    }
  };

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
    loadGroups();
  });

  onUnmounted(() => {
    currentPageTitle.value = null;
  });

  return {
    groups,
    invitations,
    isLoading,
    errorMessage,
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
