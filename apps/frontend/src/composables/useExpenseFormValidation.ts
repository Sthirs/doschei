import { computed, type ComputedRef, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';

import type { ExpenseSplitState } from '@/composables/useExpenseSplit';

export type ExpenseFormValidationInput = {
  description: Ref<string>;
  amount: Ref<number | ''>;
  date: Ref<string>;
  paidByUserId: Ref<string>;
  numericAmount: ComputedRef<number>;
  split: ExpenseSplitState;
};

export type UseExpenseFormValidationReturn = {
  isFormValid: ComputedRef<boolean>;
  validationMessage: ComputedRef<string>;
};

export const useExpenseFormValidation = ({
  description,
  amount,
  date,
  paidByUserId,
  numericAmount,
  split,
}: ExpenseFormValidationInput): UseExpenseFormValidationReturn => {
  const { t } = useI18n();

  const isFormValid = computed(() => {
    if (!description.value) return false;
    if (typeof amount.value !== 'number' || amount.value <= 0) return false;
    if (!date.value) return false;
    if (!paidByUserId.value) return false;
    if (!split.isSplitValid) return false;
    return split.isSplitValid(numericAmount.value);
  });

  const validationMessage = computed(() => {
    if (!description.value) {
      return t('expenseForm.validationDescriptionAmount');
    }
    if (typeof amount.value !== 'number' || amount.value <= 0) {
      return t('expenseForm.validationDescriptionAmount');
    }
    if (!date.value) {
      return t('expenseForm.validationDescriptionDateAmount');
    }
    if (!paidByUserId.value) {
      return t('expenseForm.validationSelectPayer');
    }
    if (split.splitErrorMessage) {
      const splitErr = split.splitErrorMessage(numericAmount.value);
      if (splitErr) return splitErr;
    }
    return '';
  });

  return { isFormValid, validationMessage };
};
