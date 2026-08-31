import { computed, reactive, ref, toRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';

import { api } from '@/lib/api';
import {
  useExpenseSplit,
  type UseExpenseSplitReturn,
} from '@/composables/useExpenseSplit';
import { useExpenseCategorySuggest } from '@/composables/useExpenseCategorySuggest';
import { DEFAULT_CATEGORY_KEY } from '@/lib/categories';
import type { Expense, GroupDetail } from '@/types/group';

const padDatePart = (value: number) => String(value).padStart(2, '0');

const todayDateValue = () => {
  const today = new Date();
  return `${today.getFullYear()}-${padDatePart(today.getMonth() + 1)}-${padDatePart(today.getDate())}`;
};

const getExpenseDateValue = (expense: Expense) => {
  return expense.date || expense.createdAt.slice(0, 10);
};

/**
 * Route-derived mode, group loading, and the editable form state of
 * `ExpenseFormView`, including the split composable and the ADR-0017 category
 * suggestion wiring. `initialise()` (re-)seeds every field once the group is
 * available.
 */
export const useExpenseFormState = () => {
  const { t } = useI18n();
  const route = useRoute();

  const mode = computed<'create' | 'edit'>(() =>
    route.name === 'expense-edit' ? 'edit' : 'create',
  );
  const groupId = computed(() => route.params.id as string);
  const expenseId = computed(
    () => (route.params as Record<string, string>).expenseId,
  );

  const group = ref<GroupDetail | null>(null);
  const notFound = ref(false);
  const loadError = ref(false);

  const loadGroup = async () => {
    try {
      const { data } = await api.get<{ group: GroupDetail }>(
        `/groups/${groupId.value}`,
      );
      group.value = data.group;
    } catch {
      loadError.value = true;
    }
  };

  const description = ref('');
  const amount = ref<number | ''>('');
  const date = ref('');
  const category = ref(DEFAULT_CATEGORY_KEY);
  const paidByUserId = ref('');
  const errorMessage = ref('');
  const submitting = ref(false);
  const deleting = ref(false);
  const showDeleteConfirm = ref(false);

  const {
    onCategoryPicked,
    scheduleSuggestion,
    cancelSuggestion,
    resetSuggestion,
  } = useExpenseCategorySuggest(
    description,
    category,
    () => group.value?.expenses ?? [],
  );

  // The composable must be called once the group is loaded so it sees the real
  // `members` and (in edit mode) the existing splits. We store its return in a
  // `reactive` proxy and assign the properties after the fetch, so the template
  // can use `split.selectedSplitUserIds` etc. with full reactivity.
  const membersRef = toRef(() => group.value?.members ?? []);
  const split = reactive<UseExpenseSplitReturn>(
    {} as unknown as UseExpenseSplitReturn,
  );

  // Localized messages for `useExpenseSplit`. Resolved here so the composable
  // stays free of any i18n dependency (ADR-0006/0017 purity).
  const splitMessages = {
    noMembersSelected: t('expenseForm.splitNoMembersSelected'),
    percentagesMustSum: (current: string): string =>
      t('expenseForm.splitPercentagesMustSum', { current }),
    fixedMustSum: (current: string, total: string): string =>
      t('expenseForm.splitFixedMustSum', { current, total }),
  };

  const initialise = () => {
    showDeleteConfirm.value = false;
    errorMessage.value = '';
    // Reset the manual-selection flag so a freshly loaded form can still
    // auto-pick the default slot. Any pending suggestion is also dropped — it
    // belongs to the previous form instance and would otherwise fire against
    // freshly-loaded state.
    resetSuggestion();

    let expense: Expense | undefined;
    if (mode.value === 'edit' && group.value) {
      expense = group.value.expenses.find((e) => e.id === expenseId.value);
      if (!expense) {
        notFound.value = true;
        return;
      }
    }

    // Initialise the split composable with the freshly-loaded members and (in
    // edit mode) the existing expense splits. Calling it here (post-fetch) is
    // essential: at setup time `membersRef.value` is empty, so the composable
    // would not see any members and would not set up its re-init watcher.
    Object.assign(
      split,
      useExpenseSplit(
        membersRef,
        expense ? expense.splits : undefined,
        splitMessages,
      ),
    );

    if (expense) {
      description.value = expense.description;
      amount.value = expense.amount;
      date.value = getExpenseDateValue(expense);
      category.value = expense.category || DEFAULT_CATEGORY_KEY;
      paidByUserId.value = expense.paidByUserId;
    } else {
      description.value = '';
      amount.value = '';
      date.value = todayDateValue();
      category.value = DEFAULT_CATEGORY_KEY;
      const currentUserId = group.value?.balance.currentUserId;
      paidByUserId.value =
        currentUserId &&
        group.value?.members.some((member) => member.id === currentUserId)
          ? currentUserId
          : (group.value?.members[0]?.id ?? '');
    }
  };

  const numericAmount = computed(() => Number(amount.value));

  return {
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
    showDeleteConfirm,
    split,
    numericAmount,
    initialise,
    onCategoryPicked,
    scheduleSuggestion,
    cancelSuggestion,
  };
};
