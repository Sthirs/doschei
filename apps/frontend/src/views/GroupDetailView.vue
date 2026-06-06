<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { VueDatePicker } from '@vuepic/vue-datepicker';

import { api } from '@/lib/api';
import GroupSettingsPanel from '@/components/GroupSettingsPanel.vue';
import type { GroupDetail, Expense } from '@/types/group';

const route = useRoute();
const router = useRouter();

const group = ref<GroupDetail | null>(null);
const isLoading = ref(true);
const errorMessage = ref('');
const showSettings = ref(false);

const showAddExpenseModal = ref(false);
const expenseDescription = ref('');
const expenseAmount = ref<number | ''>('');
const expenseDate = ref('');
const isSubmittingExpense = ref(false);
const expenseErrorMessage = ref('');

const showExpenseModal = ref(false);
const selectedExpense = ref<Expense | null>(null);
const showDeleteConfirm = ref(false);
const editDescription = ref('');
const editAmount = ref<number | ''>('');
const editDate = ref('');
const isSubmittingEdit = ref(false);
const isSubmittingDelete = ref(false);
const editErrorMessage = ref('');

const groupId = computed(() => route.params.id as string);
const datePickerFormats = {
  input: 'yyyy-MM-dd',
};
const datePickerTimeConfig = {
  enableTimePicker: false,
};

const padDatePart = (value: number) => String(value).padStart(2, '0');

const fromDateValue = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const todayDateValue = () => {
  const today = new Date();
  return `${today.getFullYear()}-${padDatePart(today.getMonth() + 1)}-${padDatePart(today.getDate())}`;
};

const getExpenseDateValue = (expense: Expense) => {
  return expense.date || expense.createdAt.slice(0, 10);
};

const loadGroup = async () => {
  isLoading.value = true;
  errorMessage.value = '';

  try {
    const { data } = await api.get<{ group: GroupDetail }>(`/groups/${groupId.value}`);
    group.value = data.group;
  } catch {
    errorMessage.value = 'We could not load this group.';
  } finally {
    isLoading.value = false;
  }
};

const openAddExpenseModal = () => {
  showAddExpenseModal.value = true;
  expenseDescription.value = '';
  expenseAmount.value = '';
  expenseDate.value = todayDateValue();
  expenseErrorMessage.value = '';
};

const closeAddExpenseModal = () => {
  showAddExpenseModal.value = false;
};

const addExpense = async () => {
  if (!expenseDescription.value || !expenseAmount.value || Number(expenseAmount.value) <= 0) {
    expenseErrorMessage.value = 'Please provide a valid description and an amount greater than 0.';
    return;
  }

  isSubmittingExpense.value = true;
  expenseErrorMessage.value = '';

  try {
    await api.post(`/groups/${groupId.value}/expenses`, {
      description: expenseDescription.value,
      amount: Number(expenseAmount.value),
      date: expenseDate.value,
    });
    showAddExpenseModal.value = false;
    await loadGroup();
  } catch {
    expenseErrorMessage.value = 'Could not add the expense. Please try again.';
  } finally {
    isSubmittingExpense.value = false;
  }
};

const openExpenseModal = (expense: Expense) => {
  selectedExpense.value = expense;
  editDescription.value = expense.description;
  editAmount.value = expense.amount;
  editDate.value = getExpenseDateValue(expense);
  showDeleteConfirm.value = false;
  editErrorMessage.value = '';
  showExpenseModal.value = true;
};

const closeExpenseModal = () => {
  showExpenseModal.value = false;
  selectedExpense.value = null;
};

const cancelEditMode = () => {
  closeExpenseModal();
};

const saveEdit = async () => {
  if (!editDescription.value || !editAmount.value || Number(editAmount.value) <= 0 || !editDate.value) {
    editErrorMessage.value = 'Please provide a valid description, date, and an amount greater than 0.';
    return;
  }

  isSubmittingEdit.value = true;
  editErrorMessage.value = '';

  try {
    await api.patch(`/groups/${groupId.value}/expenses/${selectedExpense.value!.id}`, {
      description: editDescription.value,
      amount: Number(editAmount.value),
      date: editDate.value,
    });
    showExpenseModal.value = false;
    await loadGroup();
  } catch {
    editErrorMessage.value = 'Could not update the expense. Please try again.';
  } finally {
    isSubmittingEdit.value = false;
  }
};

const startDelete = () => {
  showDeleteConfirm.value = true;
};

const cancelDelete = () => {
  showDeleteConfirm.value = false;
};

const confirmDelete = async () => {
  isSubmittingDelete.value = true;
  editErrorMessage.value = '';

  try {
    await api.delete(`/groups/${groupId.value}/expenses/${selectedExpense.value!.id}`);
    showExpenseModal.value = false;
    await loadGroup();
  } catch {
    editErrorMessage.value = 'Could not delete the expense. Please try again.';
  } finally {
    isSubmittingDelete.value = false;
  }
};

const goBack = () => {
  router.push({ name: 'groups' });
};

const formatDateShort = (dateStr: string) => {
  const date = fromDateValue(dateStr);
  return {
    monthShort: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day: String(date.getDate()).padStart(2, '0'),
  };
};

const groupExpensesByMonth = computed(() => {
  if (!group.value?.expenses) return [];

  // Sort expenses by date descending (newest first)
  const sorted = [...group.value.expenses].sort(
    (a, b) => fromDateValue(getExpenseDateValue(b)).getTime() - fromDateValue(getExpenseDateValue(a)).getTime(),
  );

  // Group by month/year
  const groups: Array<{ monthYear: string; month: string; year: number; expenses: Expense[] }> = [];
  let currentMonth = '';
  let currentYear = 0;

  sorted.forEach((expense) => {
    const date = fromDateValue(getExpenseDateValue(expense));
    const month = date.toLocaleDateString('en-US', { month: 'long' });
    const year = date.getFullYear();
    const monthYear = `${month} ${year}`;

    if (monthYear !== currentMonth || year !== currentYear) {
      currentMonth = monthYear;
      currentYear = year;
      groups.push({
        monthYear,
        month,
        year,
        expenses: [expense],
      });
    } else {
      groups[groups.length - 1].expenses.push(expense);
    }
  });

  return groups;
});

onMounted(loadGroup);
</script>

<template>
  <main class="px-4 py-6 text-slate-50 sm:px-6 lg:px-8">
    <div class="mx-auto flex max-w-5xl flex-col gap-4">
      <button
        type="button"
        class="flex w-fit items-center gap-1 text-sm text-slate-300 transition hover:text-slate-100"
        @click="goBack"
      >
        <svg viewBox="0 0 20 20" class="h-4 w-4 fill-current">
          <path
            fill-rule="evenodd"
            d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
            clip-rule="evenodd"
          />
        </svg>
        Back to groups
      </button>

      <section v-if="isLoading" class="glass-panel rounded-md px-6 py-5 text-slate-300 sm:px-8">
        Loading group...
      </section>

      <template v-else-if="group">
        <section class="glass-panel flex items-center justify-between rounded-md px-6 py-5 sm:px-8">
          <h1 class="text-xl font-semibold text-slate-100 sm:text-2xl">{{ group.name }}</h1>
          <div class="flex gap-2">
            <button
              type="button"
              class="rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-white/20 hover:bg-white/5"
              @click="showSettings = !showSettings"
            >
              {{ showSettings ? 'Hide Settings' : 'Settings' }}
            </button>
            <button
              type="button"
              class="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-brand-400"
              @click="openAddExpenseModal"
            >
              Add Expense
            </button>
          </div>
        </section>

        <GroupSettingsPanel v-if="showSettings" :group="group" @updated="loadGroup" />

        <div v-if="showAddExpenseModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
          <div class="glass-panel w-full max-w-md rounded-md p-6 shadow-xl">
            <h3 class="mb-4 text-lg font-medium text-slate-100">Add New Expense</h3>
            <form class="flex flex-col gap-4" @submit.prevent="addExpense">
              <label class="flex flex-col gap-1.5">
                <span class="text-sm text-slate-300">Description</span>
                <input
                  v-model="expenseDescription"
                  type="text"
                  placeholder="E.g., Dinner, Taxi..."
                  class="w-full rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-brand-500/40 focus:bg-white/10"
                />
              </label>

              <label class="flex flex-col gap-1.5">
                <span class="text-sm text-slate-300">Amount</span>
                <input
                  v-model="expenseAmount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  class="w-full rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-brand-500/40 focus:bg-white/10"
                />
              </label>

              <label class="flex flex-col gap-1.5">
                <span class="text-sm text-slate-300">Date</span>
                <VueDatePicker
                  v-model="expenseDate"
                  auto-apply
                  model-type="yyyy-MM-dd"
                  :formats="datePickerFormats"
                  :time-config="datePickerTimeConfig"
                  dark
                  :clearable="false"
                  input-class-name="expense-date-input"
                />
              </label>

              <p
                v-if="expenseErrorMessage"
                class="rounded-md border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
              >
                {{ expenseErrorMessage }}
              </p>

              <div class="mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  class="rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-white/20 hover:bg-white/5 disabled:opacity-60"
                  :disabled="isSubmittingExpense"
                  @click="closeAddExpenseModal"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  class="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-brand-400 disabled:opacity-60"
                  :disabled="isSubmittingExpense"
                >
                  {{ isSubmittingExpense ? 'Saving...' : 'Save' }}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div v-if="showExpenseModal && selectedExpense" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
          <div class="glass-panel w-full max-w-md rounded-md p-6 shadow-xl">
            <div v-if="!showDeleteConfirm">
              <div class="mb-4 flex items-center justify-between">
                <h3 class="text-lg font-medium text-slate-100">Expense Details</h3>
                <button type="button" class="text-slate-400 hover:text-slate-200" @click="closeExpenseModal">
                  <svg viewBox="0 0 20 20" class="h-5 w-5 fill-current">
                    <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                  </svg>
                </button>
              </div>

              <form class="flex flex-col gap-4" @submit.prevent="saveEdit">
                <label class="flex flex-col gap-1.5">
                  <span class="text-sm text-slate-300">Description</span>
                  <input
                    v-model="editDescription"
                    type="text"
                    class="w-full rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-brand-500/40 focus:bg-white/10"
                  />
                </label>

                <label class="flex flex-col gap-1.5">
                  <span class="text-sm text-slate-300">Amount</span>
                  <input
                    v-model="editAmount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    class="w-full rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-brand-500/40 focus:bg-white/10"
                  />
                </label>

                <label class="flex flex-col gap-1.5">
                  <span class="text-sm text-slate-300">Date</span>
                <VueDatePicker
                  v-model="editDate"
                  auto-apply
                  model-type="yyyy-MM-dd"
                  :formats="datePickerFormats"
                  :time-config="datePickerTimeConfig"
                  dark
                  :clearable="false"
                  input-class-name="expense-date-input"
                />
                </label>

                <p v-if="editErrorMessage" class="rounded-md border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {{ editErrorMessage }}
                </p>

                <div class="mt-2 flex justify-end gap-3">
                  <button
                    type="button"
                    class="rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-white/20 hover:bg-white/5 disabled:opacity-60"
                    :disabled="isSubmittingEdit"
                    @click="cancelEditMode"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    class="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-brand-400 disabled:opacity-60"
                    :disabled="isSubmittingEdit"
                  >
                    {{ isSubmittingEdit ? 'Saving...' : 'Save' }}
                  </button>
                  <button
                    type="button"
                    class="rounded-md border border-rose-500/50 text-rose-400 px-4 py-2 text-sm font-medium transition hover:bg-rose-500/10"
                    @click="startDelete"
                  >
                    Delete
                  </button>
                </div>
              </form>
            </div>

            <div v-else>
              <h3 class="mb-4 text-lg font-medium text-slate-100">Are you sure?</h3>
              <p class="mb-6 text-sm text-slate-300">
                Do you really want to delete this expense? This action cannot be undone.
              </p>

              <p v-if="editErrorMessage" class="mb-4 rounded-md border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {{ editErrorMessage }}
              </p>

              <div class="flex justify-end gap-3">
                <button
                  type="button"
                  class="rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-white/20 hover:bg-white/5 disabled:opacity-60"
                  :disabled="isSubmittingDelete"
                  @click="cancelDelete"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class="rounded-md bg-rose-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-600 disabled:opacity-60"
                  :disabled="isSubmittingDelete"
                  @click="confirmDelete"
                >
                  {{ isSubmittingDelete ? 'Deleting...' : 'Confirm' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <section class="glass-panel overflow-hidden rounded-md">
          <h2 class="px-6 py-4 text-sm font-medium uppercase tracking-wide text-slate-400 sm:px-8">
            Expenses
          </h2>

          <template v-if="group.expenses.length > 0">
            <template v-for="monthGroup in groupExpensesByMonth" :key="monthGroup.monthYear">
              <!-- Month header -->
              <div class="border-t border-white/10  px-6 py-3 sm:px-8">
                <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {{ monthGroup.monthYear }}
                </p>
              </div>

              <!-- Expenses for this month -->
              <ul class="divide-y divide-white/10">
                <li
                  v-for="expense in monthGroup.expenses"
                  :key="expense.id"
                  class="cursor-pointer px-6 py-4 transition hover:bg-white/5 sm:px-8"
                  @click="openExpenseModal(expense)"
                >
                  <div class="flex items-center justify-between gap-4">
                    <!-- Date on the left -->
                    <div class="flex flex-col items-center justify-center gap-1 text-center">
                      <span class="text-xs font-semibold uppercase text-slate-400">
                        {{ formatDateShort(getExpenseDateValue(expense)).monthShort }}
                      </span>
                      <span class="text-lg font-semibold uppercase text-slate-400">
                        {{ formatDateShort(getExpenseDateValue(expense)).day }}
                      </span>
                    </div>

                    <!-- Description and who paid in the middle -->
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-base font-medium text-slate-100">{{ expense.description }}</p>
                      <p class="text-sm text-slate-400">Paid by {{ expense.paidByName }}</p>
                    </div>

                    <!-- Amount on the right -->
                    <span class="shrink-0 text-base font-semibold text-slate-100">
                      &euro;{{ expense.amount.toFixed(2) }}
                    </span>
                  </div>
                </li>
              </ul>
            </template>
          </template>

          <div v-else class="px-6 py-5 text-slate-300 sm:px-8">No expenses yet.</div>
        </section>
      </template>

      <p
        v-if="errorMessage"
        class="rounded-md border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
      >
        {{ errorMessage }}
      </p>
    </div>
  </main>
</template>
