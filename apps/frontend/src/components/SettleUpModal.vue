<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue';
import { VueDatePicker } from '@vuepic/vue-datepicker';
import '@vuepic/vue-datepicker/dist/main.css';

import { api } from '@/lib/api';
import { computeSettleUpDefaults, settlementAmountFor } from '@/lib/settleUp';
import UserPicker from '@/components/UserPicker.vue';
import type { Expense, GroupMember, BalanceSummary } from '@/types/group';

const props = defineProps<{
  mode: 'create' | 'edit';
  groupId: string;
  members: GroupMember[];
  balance: BalanceSummary;
  currentUserId: string;
  settlement?: Expense;
}>();

const emit = defineEmits<{
  saved: [];
  deleted: [];
  close: [];
}>();

const payerId = ref('');
const payeeId = ref('');
const amount = ref<number | ''>('');
const date = ref('');
const errorMessage = ref('');
const submitting = ref(false);
const amountTouched = ref(false);
const showDeleteConfirm = ref(false);

const datePickerFormats = {
  input: 'yyyy-MM-dd',
};
const datePickerTimeConfig = {
  enableTimePicker: false,
};

const todayDateValue = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const initialise = () => {
  if (props.mode === 'edit' && props.settlement) {
    payerId.value = props.settlement.paidByUserId;
    payeeId.value = props.settlement.settledWithUserId ?? '';
    amount.value = props.settlement.amount;
    date.value = props.settlement.date;
  } else {
    const defaults = computeSettleUpDefaults(
      props.balance,
      props.members,
      props.currentUserId,
    );
    payerId.value = defaults.payerId;
    payeeId.value = defaults.payeeId;
    amount.value = defaults.amount;
    date.value = todayDateValue();
  }
};

onMounted(() => {
  initialise();
});

watch([payerId, payeeId], () => {
  if (amountTouched.value) return;
  const computed_amount = settlementAmountFor(
    props.balance,
    props.currentUserId,
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
    return 'The payer and the payee must be different people.';
  }
  if (typeof amount.value !== 'number' || amount.value <= 0) {
    return 'Please enter an amount greater than 0.';
  }
  return '';
});

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
    if (props.mode === 'create') {
      await api.post(`/groups/${props.groupId}/settlements`, body);
    } else {
      await api.patch(
        `/groups/${props.groupId}/settlements/${props.settlement!.id}`,
        body,
      );
    }
    emit('saved');
  } catch {
    errorMessage.value = 'Could not save the settlement. Please try again.';
  } finally {
    submitting.value = false;
  }
};

const deleteSettlement = async () => {
  submitting.value = true;
  errorMessage.value = '';
  try {
    await api.delete(
      `/groups/${props.groupId}/settlements/${props.settlement!.id}`,
    );
    emit('deleted');
  } catch {
    errorMessage.value = 'Could not delete the settlement. Please try again.';
  } finally {
    submitting.value = false;
  }
};
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
    role="dialog"
    aria-label="Settle up"
  >
    <template v-if="!showDeleteConfirm">
      <div
        class="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-[#1E1E26] border border-white/[0.08] p-6 max-h-[90vh] overflow-y-auto"
      >
        <h3 class="text-center text-xl font-semibold text-[#E5E0ED] mb-6">
          Record a Payment
        </h3>

        <form class="flex flex-col gap-4" @submit.prevent="submit">
          <div
            class="bg-[#201F27] rounded-2xl border border-[rgba(71,69,84,0.3)] py-8 text-center"
          >
            <label class="flex flex-col items-center gap-1">
              <span class="text-sm text-[#C8C4D7]">Amount</span>
              <input
                v-model.number="amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                class="w-full bg-transparent text-center text-3xl font-bold text-[#E5E0ED] outline-none placeholder-[#C8C4D7]"
                @input="amountTouched = true"
              />
            </label>
          </div>

          <div class="flex gap-3">
            <label class="flex-1 flex flex-col gap-1.5">
              <span
                class="font-display text-[10px] font-medium uppercase tracking-[0.05em] text-[#C8C4D7]"
                >Who paid</span
              >
              <UserPicker v-model="payerId" :members="members" />
            </label>
            <label class="flex-1 flex flex-col gap-1.5">
              <span
                class="font-display text-[10px] font-medium uppercase tracking-[0.05em] text-[#C8C4D7]"
                >To whom</span
              >
              <UserPicker v-model="payeeId" :members="members" />
            </label>
          </div>

          <label class="flex flex-col gap-1.5">
            <span
              class="font-display text-[10px] font-medium uppercase tracking-[0.05em] text-[#C8C4D7]"
              >Date</span
            >
            <div
              class="bg-[#201F27] rounded-xl border border-[rgba(71,69,84,0.3)] px-4 py-3"
            >
              <VueDatePicker
                v-model="date"
                auto-apply
                model-type="yyyy-MM-dd"
                :formats="datePickerFormats"
                :time-config="datePickerTimeConfig"
                dark
                :clearable="false"
              />
            </div>
          </label>

          <label class="flex flex-col gap-1.5">
            <span
              class="font-display text-[10px] font-medium uppercase tracking-[0.05em] text-[#C8C4D7]"
              >Note (optional)</span
            >
            <input
              type="text"
              placeholder="Add a note"
              class="w-full bg-[#201F27] rounded-xl border border-[rgba(71,69,84,0.3)] px-4 py-3 text-sm text-[#E5E0ED] outline-none placeholder-[#C8C4D7]"
            />
          </label>

          <p
            v-if="validationMessage"
            class="rounded-xl border border-[#FFB4AB]/20 bg-[#FFB4AB]/10 px-4 py-3 text-sm text-[#FFB4AB]"
          >
            {{ validationMessage }}
          </p>

          <p
            v-if="errorMessage"
            class="rounded-xl border border-[#FFB4AB]/20 bg-[#FFB4AB]/10 px-4 py-3 text-sm text-[#FFB4AB]"
          >
            {{ errorMessage }}
          </p>

          <button
            type="submit"
            class="w-full rounded-xl bg-[#6554E7] py-4 text-base font-semibold text-[#F0EBFF] transition hover:bg-[#5a44cf] disabled:cursor-not-allowed disabled:opacity-60 shadow-[0px_4px_6px_-4px_rgba(101,84,231,0.2),0px_10px_15px_-3px_rgba(101,84,231,0.2)]"
            :disabled="!isValid || submitting"
          >
            <span v-if="submitting">Saving...</span>
            <span v-else>+ Record Payment</span>
          </button>

          <button
            type="button"
            class="w-full py-2 text-center text-sm text-[#C8C4D7] transition hover:text-[#E5E0ED]"
            @click="emit('close')"
          >
            Cancel
          </button>

          <button
            v-if="mode === 'edit'"
            type="button"
            class="text-center text-sm font-medium text-[#FFB4AB] transition hover:text-[#ff8a80] mt-2"
            @click="showDeleteConfirm = true"
          >
            Delete this payment
          </button>
        </form>
      </div>
    </template>

    <template v-else>
      <div
        class="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-[#1E1E26] border border-white/[0.08] p-6"
      >
        <h3 class="text-center text-xl font-semibold text-[#E5E0ED] mb-4">
          Delete payment?
        </h3>
        <p class="text-center text-sm text-[#C8C4D7] mb-6">
          This action cannot be undone.
        </p>
        <p
          v-if="errorMessage"
          class="mb-4 rounded-xl border border-[#FFB4AB]/20 bg-[#FFB4AB]/10 px-4 py-3 text-sm text-[#FFB4AB]"
        >
          {{ errorMessage }}
        </p>
        <div class="flex gap-3">
          <button
            type="button"
            class="flex-1 rounded-xl border border-white/[0.08] py-3 text-sm font-medium text-[#C8C4D7] transition hover:bg-white/5"
            :disabled="submitting"
            @click="showDeleteConfirm = false"
          >
            Cancel
          </button>
          <button
            type="button"
            class="flex-1 rounded-xl bg-[#FFB4AB] py-3 text-sm font-semibold text-[#13121B] transition hover:bg-[#ff8a80] disabled:opacity-60"
            :disabled="submitting"
            @click="deleteSettlement"
          >
            {{ submitting ? 'Deleting...' : 'Delete' }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
