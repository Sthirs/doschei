import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { computed, defineComponent, h, reactive, ref } from 'vue';

import { i18n } from '@/i18n';
import type { ExpenseSplitState } from '@/composables/useExpenseSplit';
import {
  useExpenseFormValidation,
  type UseExpenseFormValidationReturn,
} from '@/composables/useExpenseFormValidation';

const mountValidation = (amountValue: number) => {
  const amount = ref<number | ''>(amountValue);
  const split = reactive({
    isSplitValid: () => true,
    splitErrorMessage: () => '',
  }) as unknown as ExpenseSplitState;
  let result!: UseExpenseFormValidationReturn;
  const Host = defineComponent({
    setup() {
      result = useExpenseFormValidation({
        description: ref('Dinner'),
        amount,
        date: ref('2026-06-01'),
        paidByUserId: ref('user-1'),
        numericAmount: computed(() => Number(amount.value)),
        split,
      });
      return () => h('div');
    },
  });
  mount(Host, { global: { plugins: [i18n] } });
  return result;
};

describe('useExpenseFormValidation — amount precision', () => {
  it('accepts an amount with two decimals', () => {
    const { isFormValid, validationMessage } = mountValidation(12.34);

    expect(isFormValid.value).toBe(true);
    expect(validationMessage.value).toBe('');
  });

  it.each([12.345, 100_000_000])('blocks %s, which the API would reject, and says why', (value) => {
    const { isFormValid, validationMessage } = mountValidation(value);

    expect(isFormValid.value).toBe(false);
    expect(validationMessage.value).toBe('Enter an amount with at most two decimals, up to 99,999,999.99.');
  });
});
