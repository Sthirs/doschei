import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

import { api } from '@/lib/api';
import { computeSettleUpDefaults, settlementAmountFor } from '@/lib/settleUp';
import { currentPageTitle, sharedGroup } from '@/router';
import type { GroupDetail } from '@/types/group';

export type UseSettleUpFormReturn = {
  mode: ComputedRef<'create' | 'edit'>;
  group: Ref<GroupDetail | null>;
  notFound: Ref<boolean>;
  loadError: Ref<boolean>;
  payerId: Ref<string>;
  payeeId: Ref<string>;
  amount: Ref<number | ''>;
  date: Ref<string>;
  errorMessage: Ref<string>;
  submitting: Ref<boolean>;
  amountTouched: Ref<boolean>;
  showDeleteConfirm: Ref<boolean>;
  isValid: ComputedRef<boolean>;
  validationMessage: ComputedRef<string>;
  goBack: () => void;
  submit: () => Promise<void>;
  deleteSettlement: () => Promise<void>;
};

const todayDateValue = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * View model for `SettleUpView`: route-derived mode, the group fetch with its
 * `sharedGroup` deep-link fallback, settlement form state, validation, and the
 * create / edit / delete submissions.
 *
 * Unlike `useExpenseSplit` — a *shared*, deliberately i18n-free logic
 * composable — this one is bound to a single view and already depends on the
 * router, the API client, and the module-level `currentPageTitle` /
 * `sharedGroup` refs. There is no purity left to protect by injecting
 * messages, so it resolves its own strings through `useI18n()`.
 *
 * MUST be called synchronously from `setup()`: it registers `onMounted` /
 * `onBeforeUnmount`, and it keeps `watch([payerId, payeeId])` co-located with
 * the refs whose settlement amount it derives.
 */
export const useSettleUpForm = (): UseSettleUpFormReturn => {
  const { t } = useI18n();
  const route = useRoute();
  const router = useRouter();

  const mode = computed<'create' | 'edit'>(() =>
    route.name === 'settleup-edit' ? 'edit' : 'create',
  );
  const groupId = computed(() => route.params.id as string);
  const sid = computed(() => (route.params as Record<string, string>).sid);

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

  const payerId = ref('');
  const payeeId = ref('');
  const amount = ref<number | ''>('');
  const date = ref('');
  const errorMessage = ref('');
  const submitting = ref(false);
  const amountTouched = ref(false);
  const showDeleteConfirm = ref(false);

  const initialise = () => {
    if (!group.value) return;

    if (mode.value === 'edit') {
      const settlement = group.value.expenses.find(
        (e) => e.id === sid.value && e.kind === 'SETTLEMENT',
      );
      if (!settlement) {
        notFound.value = true;
        return;
      }
      payerId.value = settlement.paidByUserId;
      payeeId.value = settlement.settledWithUserId ?? '';
      amount.value = settlement.amount;
      date.value = settlement.date;
    } else {
      const defaults = computeSettleUpDefaults(
        group.value.balance,
        group.value.members,
        group.value.balance.currentUserId,
      );
      payerId.value = defaults.payerId;
      payeeId.value = defaults.payeeId;
      amount.value = defaults.amount;
      date.value = todayDateValue();
    }
  };

  onMounted(async () => {
    // Title set synchronously so the topbar shows the right label even before
    // the group state is applied.
    currentPageTitle.value =
      mode.value === 'edit' ? t('settleUp.editTitle') : t('settleUp.addTitle');

    const passedGroup = sharedGroup.value;
    sharedGroup.value = null;
    if (passedGroup?.id === groupId.value) {
      group.value = passedGroup;
      initialise();
      return;
    }

    await loadGroup();
    if (group.value) initialise();
  });

  onBeforeUnmount(() => {
    currentPageTitle.value = null;
  });

  watch([payerId, payeeId], () => {
    if (amountTouched.value) return;
    if (!group.value) return;
    const computed_amount = settlementAmountFor(
      group.value.balance,
      group.value.balance.currentUserId,
      payerId.value,
      payeeId.value,
    );
    if (computed_amount !== '') {
      amount.value = computed_amount;
    }
  });

  const isValid = computed(() => {
    return (
      payerId.value !== '' &&
      payeeId.value !== '' &&
      payerId.value !== payeeId.value &&
      typeof amount.value === 'number' &&
      amount.value > 0
    );
  });

  const validationMessage = computed(() => {
    if (
      payerId.value !== '' &&
      payeeId.value !== '' &&
      payerId.value === payeeId.value
    ) {
      return t('settleUp.payerPayeeDifferent');
    }
    if (typeof amount.value !== 'number' || amount.value <= 0) {
      return t('settleUp.amountGreaterThanZero');
    }
    return '';
  });

  const goToGroupDetail = () => {
    router.push({
      name: 'group-detail',
      params: { id: groupId.value },
      state: { groupName: group.value?.name },
    });
  };

  const submit = async () => {
    if (!isValid.value) return;
    submitting.value = true;
    errorMessage.value = '';
    try {
      const body = {
        paidByUserId: payerId.value,
        paidToUserId: payeeId.value,
        amount: amount.value as number,
        date: date.value,
      };
      if (mode.value === 'create') {
        await api.post(`/groups/${groupId.value}/settlements`, body);
      } else {
        await api.patch(
          `/groups/${groupId.value}/settlements/${sid.value}`,
          body,
        );
      }
      goToGroupDetail();
    } catch {
      errorMessage.value = t('settleUp.saveError');
    } finally {
      submitting.value = false;
    }
  };

  const deleteSettlement = async () => {
    submitting.value = true;
    errorMessage.value = '';
    try {
      await api.delete(`/groups/${groupId.value}/settlements/${sid.value}`);
      goToGroupDetail();
    } catch {
      errorMessage.value = t('settleUp.deleteError');
    } finally {
      submitting.value = false;
    }
  };

  return {
    mode,
    group,
    notFound,
    loadError,
    payerId,
    payeeId,
    amount,
    date,
    errorMessage,
    submitting,
    amountTouched,
    showDeleteConfirm,
    isValid,
    validationMessage,
    goBack: goToGroupDetail,
    submit,
    deleteSettlement,
  };
};
