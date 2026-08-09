<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import DateTimePicker from './DateTimePicker.vue';

import { api } from '@/lib/api';
import { formatEur } from '@/lib/format';
import { DEFAULT_CATEGORY_KEY, getCategory } from '@/lib/categories';
import CategoryPicker from '@/components/CategoryPicker.vue';
import { useExpenseSplit } from '@/composables/useExpenseSplit';

import type { Expense, GroupMember } from '@/types/group';

const props = defineProps<{
  mode: 'create' | 'edit';
  groupId: string;
  members: GroupMember[];
  expense?: Expense;
}>();

const emit = defineEmits<{
  saved: [];
  close: [];
}>();

const padDatePart = (value: number) => String(value).padStart(2, '0');

const todayDateValue = () => {
  const today = new Date();
  return `${today.getFullYear()}-${padDatePart(today.getMonth() + 1)}-${padDatePart(today.getDate())}`;
};

const getExpenseDateValue = (expense: Expense) => {
  return expense.date || expense.createdAt.slice(0, 10);
};

// --- Form state ---
const description = ref('');
const amount = ref<number | ''>('');
const date = ref('');
const category = ref(DEFAULT_CATEGORY_KEY);
const paidByUserId = ref('');
const errorMessage = ref('');
const submitting = ref(false);
const deleting = ref(false);
const showDeleteConfirm = ref(false);

// --- Split composable ---
const membersRef = toRef(props, 'members');
const initialSplits = props.mode === 'edit' ? props.expense?.splits : undefined;
const {
  selectedSplitUserIds,
  splitMode,
  percentValues,
  fixedValues,
  percentSum,
  fixedSum,
  equalSplitPerPerson,
  isSplitValid,
  splitErrorMessage,
  toggleSplitUser,
  buildSplitPayload,
} = useExpenseSplit(membersRef, initialSplits);

// --- Initialization ---
const initialise = () => {
  showDeleteConfirm.value = false;
  errorMessage.value = '';
  if (props.mode === 'edit' && props.expense) {
    description.value = props.expense.description;
    amount.value = props.expense.amount;
    date.value = getExpenseDateValue(props.expense);
    category.value = props.expense.category || DEFAULT_CATEGORY_KEY;
    paidByUserId.value = props.expense.paidByUserId;
  } else {
    description.value = '';
    amount.value = '';
    date.value = todayDateValue();
    category.value = DEFAULT_CATEGORY_KEY;
    paidByUserId.value = props.members[0]?.id ?? '';
  }
};

initialise();

// --- Validation ---
const numericAmount = computed(() => Number(amount.value));

const isFormValid = computed(() => {
  if (!description.value) return false;
  if (typeof amount.value !== 'number' || amount.value <= 0) return false;
  if (!date.value) return false;
  if (props.mode === 'create' && !paidByUserId.value) return false;
  return isSplitValid(numericAmount.value);
});

const validationMessage = computed(() => {
  if (!description.value) {
    return 'Please provide a valid description and an amount greater than 0.';
  }
  if (typeof amount.value !== 'number' || amount.value <= 0) {
    return 'Please provide a valid description and an amount greater than 0.';
  }
  if (!date.value) {
    return 'Please provide a valid description, date, and an amount greater than 0.';
  }
  if (props.mode === 'create' && !paidByUserId.value) {
    return 'Please select who paid the expense.';
  }
  const splitErr = splitErrorMessage(numericAmount.value);
  if (splitErr) return splitErr;
  return '';
});

const modalTitle = computed(() =>
  props.mode === 'edit' ? 'Edit Expense' : 'Add Expense',
);

// --- Submit ---
const submit = async () => {
  if (!description.value || typeof amount.value !== 'number' || amount.value <= 0) {
    errorMessage.value =
      'Please provide a valid description and an amount greater than 0.';
    return;
  }

  if (!date.value) {
    errorMessage.value =
      'Please provide a valid description, date, and an amount greater than 0.';
    return;
  }

  if (props.mode === 'create' && !paidByUserId.value) {
    errorMessage.value = 'Please select who paid the expense.';
    return;
  }

  if (!isSplitValid(numericAmount.value)) {
    errorMessage.value =
      splitErrorMessage(numericAmount.value) || 'Please fix the split values.';
    return;
  }

  submitting.value = true;
  errorMessage.value = '';

  try {
    const amt = numericAmount.value;
    const splits = buildSplitPayload();
    const payload: Record<string, unknown> = {
      description: description.value,
      amount: amt,
      date: date.value,
      category: category.value,
      splits: splits.map((s) => ({
        userId: s.userId,
        shareType: s.shareType,
        shareValue: s.shareValue,
      })),
    };

    if (props.mode === 'create') {
      payload.paidByUserId = paidByUserId.value;
      await api.post(`/groups/${props.groupId}/expenses`, payload);
    } else {
      await api.patch(
        `/groups/${props.groupId}/expenses/${props.expense!.id}`,
        payload,
      );
    }
    emit('saved');
  } catch {
    errorMessage.value =
      props.mode === 'edit'
        ? 'Could not update the expense. Please try again.'
        : 'Could not add the expense. Please try again.';
  } finally {
    submitting.value = false;
  }
};

// --- Delete (edit mode only) ---
const startDelete = () => {
  showDeleteConfirm.value = true;
};

const cancelDelete = () => {
  showDeleteConfirm.value = false;
};

const confirmDelete = async () => {
  deleting.value = true;
  errorMessage.value = '';

  try {
    await api.delete(
      `/groups/${props.groupId}/expenses/${props.expense!.id}`,
    );
    emit('saved');
  } catch {
    errorMessage.value = 'Could not delete the expense. Please try again.';
  } finally {
    deleting.value = false;
  }
};

// getCategory is imported to mirror the original GroupDetailView dependency
// surface; the modal itself relies on CategoryPicker for category display.
void getCategory;
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
    @click.self="emit('close')"
  >
    <template v-if="!showDeleteConfirm">
      <div
        class="w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-white/[0.08] p-6 max-h-[90vh] overflow-y-auto"
        style="background: #1E1E26"
      >
        <h3 class="text-center text-xl font-semibold mb-6" style="color: #E5E0ED">
          {{ modalTitle }}
        </h3>

        <form class="flex flex-col gap-4" @submit.prevent="submit">
          <!-- Amount -->
          <div
            class="rounded-xl py-6 text-center"
            style="background: #201F27; border: 1px solid rgba(71,69,84,0.3)"
          >
            <label class="flex flex-col items-center gap-1">
              <span
                class="font-display text-[10px] font-medium uppercase tracking-[0.05em]"
                style="color: #C8C4D7"
                >Amount</span
              >
              <div class="flex items-center justify-center gap-1">
                <span class="text-2xl font-semibold" style="color: #C8C4D7"
                  >&euro;</span
                >
                <input
                  v-model="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  class="w-32 bg-transparent text-center text-2xl font-semibold outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  style="color: #E5E0ED"
                />
              </div>
            </label>
          </div>

          <!-- Description + Category -->
          <div class="flex gap-2">
            <CategoryPicker v-model="category" />
            <input
              v-model="description"
              type="text"
              placeholder="Description"
              class="flex-1 rounded-xl px-4 py-3 text-sm outline-none"
              style="background: #201F27; border: 1px solid rgba(71,69,84,0.3); color: #E5E0ED"
            />
          </div>

          <!-- Paid by (create mode only) -->
          <div v-if="mode === 'create'" class="flex flex-col gap-2">
            <span
              class="font-display text-[10px] font-medium uppercase tracking-[0.05em]"
              style="color: #C8C4D7"
              >Paid by</span
            >
            <div class="flex flex-wrap gap-2">
              <button
                v-for="member in members"
                :key="member.id"
                type="button"
                class="flex flex-col items-center gap-2 rounded-xl px-3 py-2 transition"
                :class="
                  paidByUserId === member.id
                    ? 'bg-[#6554E7]/20 ring-1 ring-[#6554E7]'
                    : 'hover:bg-[#2A2932]'
                "
                :style="
                  paidByUserId !== member.id ? 'background: #201F27' : ''
                "
                @click="paidByUserId = member.id"
              >
                <span
                  class="flex h-6 w-6 items-center justify-center rounded-full bg-[#6554E7]/30 text-[10px] font-semibold"
                  style="color: #C6BFFF"
                  >{{ member.displayName.charAt(0).toUpperCase() }}</span
                >
                <span class="text-xs" style="color: #E5E0ED">{{
                  member.displayName
                }}</span>
              </button>
            </div>
          </div>

          <!-- Date -->
          <DateTimePicker v-model="date" />

          <!-- Split between -->
          <div class="flex flex-col gap-2">
            <span
              class="font-display text-[10px] font-medium uppercase tracking-[0.05em]"
              style="color: #C8C4D7"
              >Split with</span
            >
            <div class="flex flex-wrap gap-2">
              <button
                v-for="member in members"
                :key="member.id"
                type="button"
                class="flex flex-col items-center gap-2 rounded-xl px-3 py-2 transition"
                :class="
                  selectedSplitUserIds.includes(member.id)
                    ? 'bg-[#6554E7]/20 ring-1 ring-[#6554E7]'
                    : 'hover:bg-[#2A2932]'
                "
                :style="
                  !selectedSplitUserIds.includes(member.id)
                    ? 'background: #201F27'
                    : ''
                "
                @click="toggleSplitUser(member.id)"
              >
                <span
                  class="flex h-6 w-6 items-center justify-center rounded-full bg-[#6554E7]/30 text-[10px] font-semibold"
                  style="color: #C6BFFF"
                  >{{ member.displayName.charAt(0).toUpperCase() }}</span
                >
                <span class="text-xs" style="color: #E5E0ED">{{
                  member.displayName
                }}</span>
              </button>
            </div>
          </div>

          <!-- Split mode tabs -->
          <div v-if="selectedSplitUserIds.length > 0" class="flex flex-col gap-3">
            <div
              class="flex rounded-xl p-1"
              style="background: #201F27; border: 1px solid rgba(255,255,255,0.08)"
            >
              <button
                type="button"
                class="flex-1 rounded-lg py-2 text-xs font-medium transition"
                :class="
                  splitMode === 'EQUAL'
                    ? 'bg-[#35343D] text-white'
                    : 'hover:text-[#E5E0ED]'
                "
                :style="splitMode !== 'EQUAL' ? 'color: #C8C4D7' : ''"
                @click="splitMode = 'EQUAL'"
              >
                Equally
              </button>
              <button
                type="button"
                class="flex-1 rounded-lg py-2 text-xs font-medium transition"
                :class="
                  splitMode === 'PERCENT'
                    ? 'bg-[#35343D] text-white'
                    : 'hover:text-[#E5E0ED]'
                "
                :style="splitMode !== 'PERCENT' ? 'color: #C8C4D7' : ''"
                @click="splitMode = 'PERCENT'"
              >
                Percentage
              </button>
              <button
                type="button"
                class="flex-1 rounded-lg py-2 text-xs font-medium transition"
                :class="
                  splitMode === 'FIXED'
                    ? 'bg-[#35343D] text-white'
                    : 'hover:text-[#E5E0ED]'
                "
                :style="splitMode !== 'FIXED' ? 'color: #C8C4D7' : ''"
                @click="splitMode = 'FIXED'"
              >
                Fixed
              </button>
            </div>

            <!-- Equal hint -->
            <p
              v-if="
                splitMode === 'EQUAL' &&
                amount &&
                Number(amount) > 0
              "
              class="text-sm text-right"
              style="color: #C8C4D7"
            >
              Each pays {{ formatEur(equalSplitPerPerson(Number(amount))) }}
            </p>

            <!-- Percentage rows -->
            <div v-if="splitMode === 'PERCENT'" class="flex flex-col gap-2">
              <div
                v-for="userId in selectedSplitUserIds"
                :key="userId"
                class="flex items-center gap-2"
              >
                <span
                  class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#6554E7]/30 text-[10px] font-semibold"
                  style="color: #C6BFFF"
                  >{{
                    members.find((m) => m.id === userId)?.displayName
                      .charAt(0)
                      .toUpperCase()
                  }}</span
                >
                <span class="flex-1 truncate text-sm" style="color: #E5E0ED"
                  >{{ members.find((m) => m.id === userId)?.displayName }}</span
                >
                <input
                  v-model.number="percentValues[userId]"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  placeholder="0"
                  class="w-20 rounded-lg px-3 py-2 text-sm text-right outline-none"
                  style="background: #201F27; border: 1px solid rgba(71,69,84,0.3); color: #E5E0ED"
                />
                <span class="w-4 text-sm" style="color: #C8C4D7">%</span>
              </div>
              <p class="text-sm text-right" style="color: #C8C4D7">
                Total: {{ Number(percentSum).toFixed(1) }}%
              </p>
            </div>

            <!-- Fixed rows -->
            <div v-if="splitMode === 'FIXED'" class="flex flex-col gap-2">
              <div
                v-for="userId in selectedSplitUserIds"
                :key="userId"
                class="flex items-center gap-2"
              >
                <span
                  class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#6554E7]/30 text-[10px] font-semibold"
                  style="color: #C6BFFF"
                  >{{
                    members.find((m) => m.id === userId)?.displayName
                      .charAt(0)
                      .toUpperCase()
                  }}</span
                >
                <span class="flex-1 truncate text-sm" style="color: #E5E0ED"
                  >{{ members.find((m) => m.id === userId)?.displayName }}</span
                >
                <input
                  v-model.number="fixedValues[userId]"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  class="w-24 rounded-lg px-3 py-2 text-sm text-right outline-none"
                  style="background: #201F27; border: 1px solid rgba(71,69,84,0.3); color: #E5E0ED"
                />
                <span class="w-4 text-sm" style="color: #C8C4D7">&euro;</span>
              </div>
              <p class="text-sm text-right" style="color: #C8C4D7">
                Total: {{ formatEur(Number(fixedSum)) }}
              </p>
            </div>

            <p
              v-if="validationMessage"
              class="text-sm"
              style="color: #FFB4AB"
            >
              {{ validationMessage }}
            </p>
          </div>

          <!-- Error -->
          <p
            v-if="errorMessage"
            class="rounded-xl px-4 py-3 text-sm"
            style="color: #FFB4AB; background: rgba(255,180,171,0.1); border: 1px solid rgba(255,180,171,0.2)"
          >
            {{ errorMessage }}
          </p>

          <!-- Save -->
          <button
            type="submit"
            class="w-full rounded-xl py-4 text-base font-semibold transition hover:bg-[#5a44cf] disabled:cursor-not-allowed disabled:opacity-60"
            style="background: #6554E7; color: #F0EBFF;"
            :disabled="submitting || !isFormValid"
          >
            {{ submitting ? 'Saving...' : 'Save' }}
          </button>

          <!-- Delete (edit mode only) -->
          <button
            v-if="mode === 'edit'"
            type="button"
            class="w-full py-2 text-center text-sm font-medium transition hover:bg-[#2A2932]"
            style="color: #FFB4AB; border: 1px solid rgba(255,180,171,0.3); border-radius: 0.75rem"
            @click="startDelete"
          >
            Delete
          </button>

          <button
            type="button"
            class="w-full py-2 text-center text-sm transition hover:text-[#E5E0ED]"
            style="color: #C8C4D7"
            @click="emit('close')"
          >
            Cancel
          </button>
        </form>
      </div>
    </template>

    <template v-else>
      <div
        class="w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-white/[0.08] p-6 max-h-[90vh] overflow-y-auto"
        style="background: #1E1E26"
      >
        <h3 class="text-center text-xl font-semibold mb-4" style="color: #E5E0ED">
          Are you sure?
        </h3>
        <p class="mb-6 text-sm text-center" style="color: #C8C4D7">
          Do you really want to delete this expense? This action cannot be
          undone.
        </p>

        <p
          v-if="errorMessage"
          class="mb-4 rounded-xl px-4 py-3 text-sm"
          style="color: #FFB4AB; background: rgba(255,180,171,0.1); border: 1px solid rgba(255,180,171,0.2)"
        >
          {{ errorMessage }}
        </p>

        <div class="flex flex-col gap-3">
          <button
            type="button"
            class="w-full rounded-xl py-4 text-base font-semibold transition hover:bg-[#e0392f] disabled:opacity-60"
            style="background: #FF5252; color: #fff"
            :disabled="deleting"
            @click="confirmDelete"
          >
            {{ deleting ? 'Deleting...' : 'Confirm Delete' }}
          </button>
          <button
            type="button"
            class="w-full py-2 text-center text-sm transition hover:text-[#E5E0ED]"
            style="color: #C8C4D7"
            :disabled="deleting"
            @click="cancelDelete"
          >
            Cancel
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
