import { computed, onBeforeUnmount, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

import { api } from '@/lib/api';
import { goBackTo } from '@/lib/backNavigation';
import { currentPageTitle } from '@/router';
import { useGroupDataStore } from '@/stores/groupData';
import { useExpenseFormState } from '@/composables/useExpenseFormState';
import { useExpenseFormValidation } from '@/composables/useExpenseFormValidation';
import { useRoutedOverlay } from '@/composables/useRoutedOverlay';

/**
 * View model for `ExpenseFormView`: composes form state, validation, and the
 * create/update/delete actions, and owns the topbar-title lifecycle.
 */
export const useExpenseForm = () => {
  const { t } = useI18n();
  const router = useRouter();
  const store = useGroupDataStore();

  const {
    mode,
    groupId,
    expenseId,
    group,
    notFound,
    loadError,
    loadGroup,
    description,
    amount,
    date,
    category,
    paidByUserId,
    errorMessage,
    submitting,
    deleting,
    split,
    numericAmount,
    initialise,
    onCategoryPicked,
    scheduleSuggestion,
    cancelSuggestion,
  } = useExpenseFormState();

  const {
    isOpen: showDeleteConfirm,
    open: startDelete,
    close: cancelDelete,
    closeBeforeLeaving: closeDeleteConfirmBeforeLeaving,
  } = useRoutedOverlay('delete');

  const { isFormValid, validationMessage } = useExpenseFormValidation({
    description,
    amount,
    date,
    paidByUserId,
    numericAmount,
    split,
  });

  const pageTitle = computed(() =>
    mode.value === 'edit'
      ? t('expenseForm.editTitle')
      : t('expenseForm.addTitle'),
  );

  const goBack = () => {
    goBackTo(router, {
      name: 'group-detail',
      params: { id: groupId.value },
      state: { groupName: group.value?.name },
    });
  };

  const submit = async () => {
    if (
      !description.value ||
      typeof amount.value !== 'number' ||
      amount.value <= 0
    ) {
      errorMessage.value = t('expenseForm.validationDescriptionAmount');
      return;
    }

    if (!date.value) {
      errorMessage.value = t('expenseForm.validationDescriptionDateAmount');
      return;
    }

    if (!paidByUserId.value) {
      errorMessage.value = t('expenseForm.validationSelectPayer');
      return;
    }

    if (!split.isSplitValid || !split.isSplitValid(numericAmount.value)) {
      errorMessage.value =
        (split.splitErrorMessage &&
          split.splitErrorMessage(numericAmount.value)) ||
        t('expenseForm.validationFixSplit');
      return;
    }

    submitting.value = true;
    errorMessage.value = '';

    try {
      const amt = numericAmount.value;
      const splits = split.buildSplitPayload();
      const payload: Record<string, unknown> = {
        description: description.value,
        amount: amt,
        date: date.value,
        category: category.value,
        paidByUserId: paidByUserId.value,
        splits: splits.map((s) => ({
          userId: s.userId,
          shareType: s.shareType,
          shareValue: s.shareValue,
        })),
      };

      if (mode.value === 'create') {
        await api.post(`/groups/${groupId.value}/expenses`, payload);
      } else {
        await api.patch(
          `/groups/${groupId.value}/expenses/${expenseId.value}`,
          payload,
        );
      }
      store.invalidateGroup(groupId.value);
      goBack();
    } catch {
      errorMessage.value =
        mode.value === 'edit'
          ? t('expenseForm.updateError')
          : t('expenseForm.addError');
    } finally {
      submitting.value = false;
    }
  };

  const confirmDelete = async () => {
    deleting.value = true;
    errorMessage.value = '';

    try {
      await api.delete(`/groups/${groupId.value}/expenses/${expenseId.value}`);
      store.invalidateGroup(groupId.value);
      // The overlay's own entry points at this now-deleted expense, so it
      // must be dropped (replace), not popped, before goBack() pops again.
      await closeDeleteConfirmBeforeLeaving();
      goBack();
    } catch {
      errorMessage.value = t('expenseForm.deleteError');
    } finally {
      deleting.value = false;
    }
  };

  onMounted(async () => {
    // Set the topbar title synchronously so AppTopbar renders the right label on
    // first paint.
    currentPageTitle.value = pageTitle.value;

    // ADR-0030: use the cached group when it is fresh (not stale, last
    // refresh succeeded) and has what this form needs; a stale entry, an
    // edit target missing from it (e.g. just added by another member) or a
    // cold deep link fetches instead.
    const cached = store.freshDetail(groupId.value);
    if (
      cached &&
      (mode.value === 'create' ||
        cached.expenses.some((e) => e.id === expenseId.value))
    ) {
      group.value = cached;
      initialise();
      return;
    }

    const fetched = await loadGroup();
    if (fetched) {
      group.value = fetched;
      initialise();
    }
  });

  onBeforeUnmount(() => {
    currentPageTitle.value = null;
    cancelSuggestion();
  });

  return {
    mode,
    group,
    notFound,
    loadError,
    description,
    amount,
    date,
    category,
    paidByUserId,
    errorMessage,
    submitting,
    deleting,
    showDeleteConfirm,
    split,
    isFormValid,
    validationMessage,
    onCategoryPicked,
    scheduleSuggestion,
    goBack,
    submit,
    startDelete,
    cancelDelete,
    confirmDelete,
  };
};
