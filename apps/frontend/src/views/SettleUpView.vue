<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { api } from '@/lib/api';
import { computeSettleUpDefaults, settlementAmountFor } from '@/lib/settleUp';
import { currentPageTitle, sharedGroup } from '@/router';
import { formatEur } from '@/lib/format';
import UserPicker from '@/components/UserPicker.vue';
import DateTimePicker from '@/components/DateTimePicker.vue';
import type { GroupDetail } from '@/types/group';

const route = useRoute();
const router = useRouter();

const mode = computed<'create' | 'edit'>(() =>
  route.name === 'settleup-edit' ? 'edit' : 'create',
);
const groupId = computed(() => route.params.id as string);
const sid = computed(() => (route.params as Record<string, string>).sid);

const group = ref<GroupDetail | null>(null);
const notFound = ref(false);

const payerId = ref('');
const payeeId = ref('');
const amount = ref<number | ''>('');
const date = ref('');
const errorMessage = ref('');
const submitting = ref(false);
const amountTouched = ref(false);
const showDeleteConfirm = ref(false);

const todayDateValue = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

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

onMounted(() => {
  // Title set synchronously so the topbar shows the right label even before
  // the group state is applied.
  currentPageTitle.value = mode.value === 'edit' ? 'Edit Payment' : 'Settle Up';

  const passedGroup = sharedGroup.value;
  sharedGroup.value = null;
  if (passedGroup?.id === groupId.value) {
    group.value = passedGroup;
    initialise();
  } else {
    router.replace({ name: 'group-detail', params: { id: groupId.value } });
  }
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
    return 'The payer and the payee must be different people.';
  }
  if (typeof amount.value !== 'number' || amount.value <= 0) {
    return 'Please enter an amount greater than 0.';
  }
  return '';
});

const goBack = () => {
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
    router.push({
      name: 'group-detail',
      params: { id: groupId.value },
      state: { groupName: group.value?.name },
    });
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
    await api.delete(`/groups/${groupId.value}/settlements/${sid.value}`);
    router.push({
      name: 'group-detail',
      params: { id: groupId.value },
      state: { groupName: group.value?.name },
    });
  } catch {
    errorMessage.value = 'Could not delete the settlement. Please try again.';
  } finally {
    submitting.value = false;
  }
};
</script>

<template>
  <!-- Topbar: back arrow -->
  <Teleport to="#topbar-leading">
    <button
      type="button"
      class="flex h-9 w-9 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-slate-100"
      aria-label="Back to group"
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

  <!-- Loading state -->
  <main
    v-if="!group && !notFound"
    class="flex-1 overflow-y-auto px-4 py-6 text-[#E5E0ED]"
  >
    <div class="mx-auto w-full max-w-md">Loading...</div>
  </main>

  <!-- Not-found state -->
  <main
    v-else-if="notFound"
    class="flex-1 overflow-y-auto px-4 py-6 text-[#E5E0ED]"
  >
    <div class="mx-auto w-full max-w-md">
      <p
        class="rounded-xl px-4 py-3 text-sm text-rose-200 bg-rose-500/10 border border-rose-500/20"
      >
        Settlement not found.
      </p>
    </div>
  </main>

  <!-- Form -->
  <main v-else-if="group" class="flex flex-col flex-1 overflow-hidden">
    <div class="flex-1 overflow-y-auto px-4 py-6">
      <div class="mx-auto w-full max-w-md flex flex-col gap-4">
        <!-- Record-a-Payment banner (create mode only) -->
        <div
          v-if="mode === 'create'"
          class="bg-[#1E1E26] border border-[rgba(255,255,255,0.1)] rounded-xl p-6 flex flex-col items-center gap-4 mb-2 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]"
        >
          <div
            class="h-16 w-16 rounded-full bg-[#2A2932] border border-white/[0.05] flex items-center justify-center"
          >
            <svg
              width="33"
              height="31"
              viewBox="0 0 33 31"
              fill="none"
              class="h-8 w-8 fill-[#C6BFFF]"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M0 30.75L7.5 9.75L21 23.25L0 30.75ZM18.825 16.575L17.25 15L25.65 6.6C26.45 5.8 27.4125 5.4 28.5375 5.4C29.6625 5.4 30.625 5.8 31.425 6.6L32.325 7.5L30.75 9.075L29.85 8.175C29.5 7.825 29.0625 7.65 28.5375 7.65C28.0125 7.65 27.575 7.825 27.225 8.175L18.825 16.575ZM12.825 10.575L11.25 9L12.15 8.1C12.5 7.75 12.675 7.325 12.675 6.825C12.675 6.325 12.5 5.9 12.15 5.55L11.175 4.575L12.75 3L13.725 3.975C14.525 4.775 14.925 5.725 14.925 6.825C14.925 7.925 14.525 8.875 13.725 9.675L12.825 10.575ZM15.825 13.575L14.25 12L19.65 6.6C20 6.25 20.175 5.8125 20.175 5.2875C20.175 4.7625 20 4.325 19.65 3.975L17.25 1.575L18.825 0L21.225 2.4C22.025 3.2 22.425 4.1625 22.425 5.2875C22.425 6.4125 22.025 7.375 21.225 8.175L15.825 13.575ZM21.825 19.575L20.25 18L22.65 15.6C23.45 14.8 24.4125 14.4 25.5375 14.4C26.6625 14.4 27.625 14.8 28.425 15.6L30.825 18L29.25 19.575L26.85 17.175C26.5 16.825 26.0625 16.65 25.5375 16.65C25.0125 16.65 24.575 16.825 24.225 17.175L21.825 19.575Z"
              />
            </svg>
          </div>
          <h2 class="text-2xl font-bold leading-8 text-[#E5E0ED]">
            Record a Payment
          </h2>
        </div>

        <form
          id="settleup-form"
          class="flex flex-col gap-4"
          @submit.prevent="submit"
        >
          <!-- Amount card (Figma-aligned, floating €) -->
          <div
            class="relative bg-[#1E1E26] border border-[rgba(198,191,255,0.5)] rounded-lg p-6 shadow-[0_0_15px_rgba(75,221,183,0.1)]"
          >
            <input
              v-model.number="amount"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              class="w-full bg-transparent text-center text-3xl font-bold text-[#E5E0ED] outline-none placeholder-[#C8C4D7] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              @input="amountTouched = true"
            />
            <span
              class="absolute right-6 top-1/2 -translate-y-1/2 text-3xl text-[#E5E0ED] font-semibold select-none"
              >&euro;</span
            >
          </div>

          <!-- Who paid / To whom -->
          <div class="flex gap-3">
            <label class="flex-1 flex flex-col gap-1.5">
              <span
                class="font-display text-[10px] font-medium uppercase tracking-[0.05em] text-[#C8C4D7]"
                >Who paid</span
              >
              <UserPicker v-model="payerId" :members="group.members" />
            </label>
            <label class="flex-1 flex flex-col gap-1.5">
              <span
                class="font-display text-[10px] font-medium uppercase tracking-[0.05em] text-[#C8C4D7]"
                >To whom</span
              >
              <UserPicker v-model="payeeId" :members="group.members" />
            </label>
          </div>

          <!-- Date -->
          <DateTimePicker v-model="date" />

          <!-- Balance impact caption -->
          <p class="text-sm text-center text-[#C8C4D7]">
            This payment will settle your balance of
            {{ formatEur(Math.abs(group.balance.netForCurrentUser)) }}.
          </p>

          <!-- Validation / error messages -->
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
        </form>

        <!-- Delete-confirm panel -->
        <div
          v-if="showDeleteConfirm"
          class="rounded-2xl bg-[#1E1E26] border border-white/[0.08] p-6"
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
      </div>
    </div>
    <div class="relative shrink-0 px-4" v-if="!showDeleteConfirm">
      <div
        class="absolute inset-x-0 bottom-full h-4 bg-gradient-to-t from-[#13121B] pointer-events-none"
      ></div>
      <div class="mx-auto w-full max-w-md flex flex-col gap-2 pb-4">
        <button
          type="submit"
          form="settleup-form"
          class="w-full rounded-xl bg-[#6554E7] py-4 text-base font-semibold text-[#F0EBFF] transition hover:bg-[#5a44cf] disabled:cursor-not-allowed disabled:bg-[#474554]"
          :disabled="!isValid || submitting"
        >
          <span v-if="submitting">Saving...</span>
          <span v-else>+ Record Payment</span>
        </button>

        <button
          v-if="mode === 'edit'"
          type="button"
          class="w-full py-2 text-center text-sm font-medium text-[#FFB4AB] transition hover:text-[#ff8a80]"
          @click="showDeleteConfirm = true"
        >
          Delete this payment
        </button>
      </div>
    </div>
  </main>
</template>
