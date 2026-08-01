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
    const defaults = computeSettleUpDefaults(props.balance, props.members, props.currentUserId);
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
  const computed_amount = settlementAmountFor(props.balance, props.currentUserId, payerId.value, payeeId.value);
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
  if (payerId.value !== '' && payeeId.value !== '' && payerId.value === payeeId.value) {
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
      await api.patch(`/groups/${props.groupId}/settlements/${props.settlement!.id}`, body);
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
    await api.delete(`/groups/${props.groupId}/settlements/${props.settlement!.id}`);
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
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
    role="dialog"
    aria-label="Settle up"
  >
    <template v-if="!showDeleteConfirm">
      <div class="glass-panel w-full max-w-md rounded-md p-6 shadow-xl">
        <h3 class="mb-4 text-lg font-medium text-slate-100">
          {{ mode === 'create' ? 'Settle up' : 'Edit settlement' }}
        </h3>

        <form class="flex flex-col gap-4" @submit.prevent="submit">
          <div class="flex flex-col gap-1.5">
            <span class="text-sm text-slate-300">Paid by</span>
            <UserPicker v-model="payerId" :members="members" />
          </div>

          <div class="flex flex-col gap-1.5">
            <span class="text-sm text-slate-300">Paid to</span>
            <UserPicker v-model="payeeId" :members="members" />
          </div>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm text-slate-300">Amount</span>
            <input
              v-model.number="amount"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              class="w-full rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-brand-500/40 focus:bg-white/10"
              @input="amountTouched = true"
            />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm text-slate-300">Date</span>
            <VueDatePicker
              v-model="date"
              auto-apply
              model-type="yyyy-MM-dd"
              :formats="datePickerFormats"
              :time-config="datePickerTimeConfig"
              dark
              :clearable="false"
            />
          </label>

          <p
            v-if="validationMessage"
            class="rounded-md border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
          >
            {{ validationMessage }}
          </p>

          <p
            v-if="errorMessage"
            class="rounded-md border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
          >
            {{ errorMessage }}
          </p>

          <div class="mt-2 flex items-center justify-between">
            <button
              v-if="mode === 'edit'"
              type="button"
              class="rounded-md border border-rose-500/50 px-4 py-2 text-sm font-medium text-rose-400 transition hover:bg-rose-500/10"
              @click="showDeleteConfirm = true"
            >
              Delete
            </button>
            <span v-else />
            <div class="flex gap-3">
              <button
                type="button"
                class="rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-white/20 hover:bg-white/5 disabled:opacity-60"
                @click="emit('close')"
              >
                Cancel
              </button>
              <button
                type="submit"
                class="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-brand-400 disabled:opacity-60"
                :disabled="!isValid || submitting"
              >
                {{ submitting ? 'Saving...' : 'Save' }}
              </button>
            </div>
          </div>
        </form>
      </div>
    </template>

    <template v-else>
      <div class="glass-panel w-full max-w-md rounded-md p-6 shadow-xl">
        <h3 class="mb-4 text-lg font-medium text-slate-100">Are you sure?</h3>
        <p class="mb-6 text-sm text-slate-300">
          Do you really want to delete this settlement? This action cannot be undone.
        </p>

        <p
          v-if="errorMessage"
          class="mb-4 rounded-md border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
        >
          {{ errorMessage }}
        </p>

        <div class="flex justify-end gap-3">
          <button
            type="button"
            class="rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-white/20 hover:bg-white/5 disabled:opacity-60"
            :disabled="submitting"
            @click="showDeleteConfirm = false"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-md bg-rose-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-600 disabled:opacity-60"
            :disabled="submitting"
            @click="deleteSettlement"
          >
            {{ submitting ? 'Deleting...' : 'Confirm' }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
