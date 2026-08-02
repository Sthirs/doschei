<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { VueDatePicker } from '@vuepic/vue-datepicker';

import { api } from '@/lib/api';
import { DEFAULT_CATEGORY_KEY, getCategory } from '@/lib/categories';
import { splitModeFromExistingSplits } from '@/lib/splitMath';
import { currentPageTitle } from '@/router';
import { useAuthStore } from '@/stores/auth';
import CategoryPicker from '@/components/CategoryPicker.vue';
import UserPicker from '@/components/UserPicker.vue';
import SettleUpModal from '@/components/SettleUpModal.vue';

import type { GroupDetail, Expense, ExpenseSplit } from '@/types/group';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const group = ref<GroupDetail | null>(null);
const isLoading = ref(true);
const errorMessage = ref('');


const showAddExpenseModal = ref(false);
const expenseDescription = ref('');
const expenseAmount = ref<number | ''>('');
const expenseDate = ref('');
const expenseCategory = ref(DEFAULT_CATEGORY_KEY);
const expensePaidByUserId = ref('');
const isSubmittingExpense = ref(false);
const expenseErrorMessage = ref('');

// Split state for create modal
const selectedSplitUserIds = ref<string[]>([]);
const splitMode = ref<'EQUAL' | 'PERCENT' | 'FIXED'>('EQUAL');
const percentValues = ref<Record<string, number | ''>>({});
const fixedValues = ref<Record<string, number | ''>>({});

const showExpenseModal = ref(false);
const selectedExpense = ref<Expense | null>(null);
const showDeleteConfirm = ref(false);
const editDescription = ref('');
const editAmount = ref<number | ''>('');
const editDate = ref('');
const editCategory = ref(DEFAULT_CATEGORY_KEY);
const isSubmittingEdit = ref(false);
const isSubmittingDelete = ref(false);
const editErrorMessage = ref('');

// Split state for edit modal
const editSelectedSplitUserIds = ref<string[]>([]);
const editSplitMode = ref<'EQUAL' | 'PERCENT' | 'FIXED'>('EQUAL');
const editPercentValues = ref<Record<string, number | ''>>({});
const editFixedValues = ref<Record<string, number | ''>>({});

// Settle-up state
const showSettleUpModal = ref(false);
const editingSettlement = ref<Expense | null>(null);

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

// Export state
const exportMonth = ref(todayDateValue().slice(0, 7));
const isExporting = ref(false);
const exportErrorMessage = ref('');
const showExportModal = ref(false);

const getExpenseDateValue = (expense: Expense) => {
  return expense.date || expense.createdAt.slice(0, 10);
};

const selectableMembers = computed(() => {
  const members = group.value?.members ?? [];
  return [...members].sort((a, b) => a.displayName.localeCompare(b.displayName));
});

const defaultPaidByUserId = () => {
  const currentUserId = authStore.user?.id;
  if (currentUserId && group.value?.members.some((member) => member.id === currentUserId)) {
    return currentUserId;
  }
  return selectableMembers.value[0]?.id ?? '';
};

// --- Split computed helpers (create modal) ---

const equalSplitPerPerson = computed(() => {
  const amount = Number(expenseAmount.value);
  if (!amount || amount <= 0 || selectedSplitUserIds.value.length === 0) return 0;
  return amount / selectedSplitUserIds.value.length;
});

const percentSum = computed(() => {
  let sum = 0;
  for (const userId of selectedSplitUserIds.value) {
    const val = percentValues.value[userId];
    if (typeof val === 'number') sum += val;
  }
  return sum;
});

const fixedSum = computed(() => {
  let sum = 0;
  for (const userId of selectedSplitUserIds.value) {
    const val = fixedValues.value[userId];
    if (typeof val === 'number') sum += val;
  }
  return sum;
});

const isCreateSplitValid = computed(() => {
  if (selectedSplitUserIds.value.length === 0) return false;
  if (splitMode.value === 'PERCENT') {
    return Math.abs(percentSum.value - 100) <= 0.01;
  }
  if (splitMode.value === 'FIXED') {
    const amount = Number(expenseAmount.value);
    if (!amount || amount <= 0) return false;
    return Math.abs(fixedSum.value - amount) <= 0.01;
  }
  // EQUAL mode is always valid if at least one user is selected
  return true;
});

const createSplitErrorMessage = computed(() => {
  if (selectedSplitUserIds.value.length === 0) {
    return 'Select at least one person to split with.';
  }
  if (splitMode.value === 'PERCENT') {
    if (Math.abs(percentSum.value - 100) > 0.01) {
      return `Percentages must sum to 100 (current: ${percentSum.value.toFixed(2)}).`;
    }
  }
  if (splitMode.value === 'FIXED') {
    const amount = Number(expenseAmount.value);
    if (amount && amount > 0 && Math.abs(fixedSum.value - amount) > 0.01) {
      return `Fixed amounts must sum to \u20AC${amount.toFixed(2)} (current: \u20AC${fixedSum.value.toFixed(2)}).`;
    }
  }
  return '';
});

// --- Split computed helpers (edit modal) ---

const editEqualSplitPerPerson = computed(() => {
  const amount = Number(editAmount.value);
  if (!amount || amount <= 0 || editSelectedSplitUserIds.value.length === 0) return 0;
  return amount / editSelectedSplitUserIds.value.length;
});

const editPercentSum = computed(() => {
  let sum = 0;
  for (const userId of editSelectedSplitUserIds.value) {
    const val = editPercentValues.value[userId];
    if (typeof val === 'number') sum += val;
  }
  return sum;
});

const editFixedSum = computed(() => {
  let sum = 0;
  for (const userId of editSelectedSplitUserIds.value) {
    const val = editFixedValues.value[userId];
    if (typeof val === 'number') sum += val;
  }
  return sum;
});

const isEditSplitValid = computed(() => {
  if (editSelectedSplitUserIds.value.length === 0) return false;
  if (editSplitMode.value === 'PERCENT') {
    return Math.abs(editPercentSum.value - 100) <= 0.01;
  }
  if (editSplitMode.value === 'FIXED') {
    const amount = Number(editAmount.value);
    if (!amount || amount <= 0) return false;
    return Math.abs(editFixedSum.value - amount) <= 0.01;
  }
  return true;
});

const editSplitErrorMessage = computed(() => {
  if (editSelectedSplitUserIds.value.length === 0) {
    return 'Select at least one person to split with.';
  }
  if (editSplitMode.value === 'PERCENT') {
    if (Math.abs(editPercentSum.value - 100) > 0.01) {
      return `Percentages must sum to 100 (current: ${editPercentSum.value.toFixed(2)}).`;
    }
  }
  if (editSplitMode.value === 'FIXED') {
    const amount = Number(editAmount.value);
    if (amount && amount > 0 && Math.abs(editFixedSum.value - amount) > 0.01) {
      return `Fixed amounts must sum to \u20AC${amount.toFixed(2)} (current: \u20AC${editFixedSum.value.toFixed(2)}).`;
    }
  }
  return '';
});

// --- Split payload builder ---

const buildSplitPayload = (
  mode: 'EQUAL' | 'PERCENT' | 'FIXED',
  userIds: string[],
  amount: number,
  pValues: Record<string, number | ''>,
  fValues: Record<string, number | ''>,
): ExpenseSplit[] => {
  if (mode === 'EQUAL') {
    return userIds.map((userId) => ({
      userId,
      displayName: selectableMembers.value.find((m) => m.id === userId)?.displayName ?? '',
      shareType: 'EQUAL' as const,
      shareValue: 0,
      computedAmount: 0,
    }));
  }
  if (mode === 'PERCENT') {
    return userIds.map((userId) => ({
      userId,
      displayName: selectableMembers.value.find((m) => m.id === userId)?.displayName ?? '',
      shareType: 'PERCENT' as const,
      shareValue: typeof pValues[userId] === 'number' ? pValues[userId] : 0,
      computedAmount: 0,
    }));
  }
  // FIXED
  return userIds.map((userId) => ({
    userId,
    displayName: selectableMembers.value.find((m) => m.id === userId)?.displayName ?? '',
    shareType: 'FIXED' as const,
    shareValue: typeof fValues[userId] === 'number' ? fValues[userId] : 0,
    computedAmount: typeof fValues[userId] === 'number' ? fValues[userId] : 0,
  }));
};

const getInitial = (name: string) => name.charAt(0).toUpperCase();

const toggleSplitUser = (userId: string) => {
  const idx = selectedSplitUserIds.value.indexOf(userId);
  if (idx >= 0) {
    selectedSplitUserIds.value.splice(idx, 1);
  } else {
    selectedSplitUserIds.value.push(userId);
  }
};

const toggleEditSplitUser = (userId: string) => {
  const idx = editSelectedSplitUserIds.value.indexOf(userId);
  if (idx >= 0) {
    editSelectedSplitUserIds.value.splice(idx, 1);
  } else {
    editSelectedSplitUserIds.value.push(userId);
  }
};

const loadGroup = async () => {
  isLoading.value = true;
  errorMessage.value = '';

  try {
    const { data } = await api.get<{ group: GroupDetail }>(`/groups/${groupId.value}`);
    group.value = data.group;
    currentPageTitle.value = data.group.name;
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
  expenseCategory.value = DEFAULT_CATEGORY_KEY;
  expensePaidByUserId.value = defaultPaidByUserId();
  expenseErrorMessage.value = '';
  // Initialize split state: all members selected, EQUAL mode
  selectedSplitUserIds.value = selectableMembers.value.map((m) => m.id);
  splitMode.value = 'EQUAL';
  percentValues.value = {};
  fixedValues.value = {};
};

const closeAddExpenseModal = () => {
  showAddExpenseModal.value = false;
};

const addExpense = async () => {
  if (!expenseDescription.value || !expenseAmount.value || Number(expenseAmount.value) <= 0) {
    expenseErrorMessage.value = 'Please provide a valid description and an amount greater than 0.';
    return;
  }

  if (!expensePaidByUserId.value) {
    expenseErrorMessage.value = 'Please select who paid the expense.';
    return;
  }

  if (!isCreateSplitValid.value) {
    expenseErrorMessage.value = createSplitErrorMessage.value || 'Please fix the split values.';
    return;
  }

  isSubmittingExpense.value = true;
  expenseErrorMessage.value = '';

  try {
    const amount = Number(expenseAmount.value);
    const splits = buildSplitPayload(
      splitMode.value,
      selectedSplitUserIds.value,
      amount,
      percentValues.value,
      fixedValues.value,
    );
    await api.post(`/groups/${groupId.value}/expenses`, {
      description: expenseDescription.value,
      amount,
      date: expenseDate.value,
      category: expenseCategory.value,
      paidByUserId: expensePaidByUserId.value,
      splits: splits.map((s) => ({
        userId: s.userId,
        shareType: s.shareType,
        shareValue: s.shareValue,
      })),
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
  editCategory.value = expense.category || DEFAULT_CATEGORY_KEY;
  showDeleteConfirm.value = false;
  editErrorMessage.value = '';
  showExpenseModal.value = true;

  // Initialize edit split state from existing splits
  const allMemberIds = selectableMembers.value.map((m) => m.id);
  const detected = splitModeFromExistingSplits(expense.splits);

  if (detected.selectedUserIds.length === 0) {
    // No splits or empty: default to all members, EQUAL mode
    editSelectedSplitUserIds.value = allMemberIds;
    editSplitMode.value = 'EQUAL';
    editPercentValues.value = {};
    editFixedValues.value = {};
  } else {
    editSelectedSplitUserIds.value = detected.selectedUserIds;
    editSplitMode.value = detected.mode;
    editPercentValues.value = {};
    editFixedValues.value = {};
    if (detected.mode === 'PERCENT') {
      for (const userId of detected.selectedUserIds) {
        editPercentValues.value[userId] = detected.percentValues[userId] ?? '';
      }
    } else if (detected.mode === 'FIXED') {
      for (const userId of detected.selectedUserIds) {
        editFixedValues.value[userId] = detected.fixedValues[userId] ?? '';
      }
    }
  }
};

const openSettleUpModal = (mode: 'create' | 'edit', settlement?: Expense) => {
  editingSettlement.value = settlement ?? null;
  showSettleUpModal.value = true;
};

const onSettlementSaved = () => {
  showSettleUpModal.value = false;
  editingSettlement.value = null;
  loadGroup();
};

const onSettlementDeleted = () => {
  showSettleUpModal.value = false;
  editingSettlement.value = null;
  loadGroup();
};

const closeSettleUpModal = () => {
  showSettleUpModal.value = false;
  editingSettlement.value = null;
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

  if (!isEditSplitValid.value) {
    editErrorMessage.value = editSplitErrorMessage.value || 'Please fix the split values.';
    return;
  }

  isSubmittingEdit.value = true;
  editErrorMessage.value = '';

  try {
    const amount = Number(editAmount.value);
    const splits = buildSplitPayload(
      editSplitMode.value,
      editSelectedSplitUserIds.value,
      amount,
      editPercentValues.value,
      editFixedValues.value,
    );
    await api.patch(`/groups/${groupId.value}/expenses/${selectedExpense.value!.id}`, {
      description: editDescription.value,
      amount,
      date: editDate.value,
      category: editCategory.value,
      splits: splits.map((s) => ({
        userId: s.userId,
        shareType: s.shareType,
        shareValue: s.shareValue,
      })),
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

const exportCsv = async () => {
  if (!group.value) return;
  isExporting.value = true;
  exportErrorMessage.value = '';
  try {
    const token = localStorage.getItem('doschei.auth.token');
    const url = `/api/groups/${groupId.value}/expenses/export?month=${encodeURIComponent(exportMonth.value)}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      exportErrorMessage.value = data.message ?? 'Export failed.';
      return;
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    const contentDisp = response.headers.get('content-disposition') ?? '';
    const filenameMatch = contentDisp.match(/filename\*?=(?:UTF-8''|")([^"]+)/);
    const filename = filenameMatch ? decodeURIComponent(filenameMatch[1]) : `${group.value.name}-export.csv`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
    showExportModal.value = false;
  } catch {
    exportErrorMessage.value = 'Export failed. Please try again.';
  } finally {
    isExporting.value = false;
  }
};

onMounted(() => {
  if (history.state.groupName) {
    currentPageTitle.value = String(history.state.groupName);
  }
  loadGroup();
});

onBeforeUnmount(() => {
  currentPageTitle.value = null;
});
</script>

<template>
  <!-- Topbar: back arrow -->
  <Teleport to="#topbar-leading">
    <button
      type="button"
      class="flex h-9 w-9 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-slate-100"
      aria-label="Back to groups"
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

  <!-- Topbar: actions -->
  <Teleport to="#topbar-actions">
    <button
      v-if="group"
      type="button"
      class="hidden rounded-md border border-white/10 px-3 py-1.5 text-sm font-medium text-slate-100 transition hover:border-white/20 hover:bg-white/5 sm:inline-flex"
      @click="router.push({ name: 'group-settings', params: { id: groupId }, state: { groupName: group.name } })"
    >
      Settings
    </button>
    <button
      v-if="group"
      type="button"
      class="flex h-9 w-9 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-slate-100 sm:hidden"
      aria-label="Toggle settings"
      @click="router.push({ name: 'group-settings', params: { id: groupId }, state: { groupName: group.name } })"
    >
      <svg viewBox="0 0 20 20" class="h-5 w-5 fill-current">
        <path fill-rule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clip-rule="evenodd" />
      </svg>
    </button>
    <button
      v-if="group"
      type="button"
      class="hidden rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-slate-950 transition hover:bg-brand-400 sm:inline-flex"
      @click="openAddExpenseModal"
    >
      Add Expense
    </button>
    <button
      v-if="group"
      type="button"
      class="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-slate-950 transition hover:bg-brand-400 sm:hidden"
      aria-label="Add expense"
      @click="openAddExpenseModal"
    >
      <svg viewBox="0 0 20 20" class="h-5 w-5 fill-current">
        <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
      </svg>
    </button>
  </Teleport>

  <main class="px-4 py-6 text-slate-50 sm:px-6 lg:px-8">
    <div class="mx-auto flex max-w-5xl flex-col gap-4">
      <section v-if="isLoading" class="glass-panel rounded-md px-6 py-5 text-slate-300 sm:px-8">
        Loading group...
      </section>

      <template v-else-if="group">

        <!-- Balance summary card -->
        <section v-if="group.balance" class="glass-panel rounded-md px-6 py-4 sm:px-8">
          <h2 class="text-sm font-medium uppercase tracking-wide text-slate-400">
            Balance
          </h2>
          <div class="mt-3">
            <p
              v-if="group.balance.netForCurrentUser > 0"
              class="text-base font-semibold text-emerald-300"
            >
              You are owed &euro;{{ Math.abs(group.balance.netForCurrentUser).toFixed(2) }} overall
            </p>
            <p
              v-else-if="group.balance.netForCurrentUser < 0"
              class="text-base font-semibold text-rose-300"
            >
              You owe &euro;{{ Math.abs(group.balance.netForCurrentUser).toFixed(2) }} overall
            </p>
            <p v-else class="text-base font-semibold text-slate-300">
              You are all settled up.
            </p>
          </div>
          <details v-if="group.balance.perUser.length > 0" class="mt-3">
            <summary class="cursor-pointer text-sm text-slate-400 transition hover:text-slate-200">
              See breakdown
            </summary>
            <ul class="mt-2 flex flex-col gap-1.5">
              <li
                v-for="entry in group.balance.perUser"
                :key="entry.userId"
                class="text-sm"
              >
                <span
                  v-if="entry.netForCurrentUser > 0"
                  class="text-emerald-300"
                >
                  {{ entry.displayName }} owes you &euro;{{ Math.abs(entry.netForCurrentUser).toFixed(2) }}
                </span>
                <span
                  v-else
                  class="text-rose-300"
                >
                  You owe {{ entry.displayName }} &euro;{{ Math.abs(entry.netForCurrentUser).toFixed(2) }}
                </span>
              </li>
            </ul>
          </details>
        </section>

        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-md bg-indigo-600/20 px-3 py-1.5 text-xs font-medium text-indigo-300 transition hover:bg-indigo-600/30 disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="group.members.length < 2"
            :title="group.members.length < 2 ? 'Invite someone to this group first' : 'Record a payment between members'"
            @click="openSettleUpModal('create')"
          >
            Settle up
          </button>
          <button
            type="button"
            class="rounded-md bg-indigo-600/20 px-3 py-1.5 text-xs font-medium text-indigo-300 transition hover:bg-indigo-600/30 disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!group"
            @click="showExportModal = true"
          >
            Export
          </button>
        </div>

        <div v-if="showExportModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm" @click.self="showExportModal = false">
          <div class="glass-panel w-full max-w-md rounded-md p-6 shadow-xl" role="dialog" aria-modal="true" aria-label="Export CSV">
            <h3 class="mb-4 text-lg font-medium text-slate-100">Export CSV</h3>
            <div class="flex flex-col gap-4">
              <label class="flex flex-col gap-1.5">
                <span class="text-sm text-slate-300">Month</span>
                <VueDatePicker
                  v-model="exportMonth"
                  month-picker
                  auto-apply
                  model-type="yyyy-MM"
                  :formats="{ input: 'yyyy-MM' }"
                  dark
                  :clearable="false"
                />
              </label>
              <p v-if="exportErrorMessage" class="rounded-md border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{{ exportErrorMessage }}</p>
              <div class="flex justify-end gap-2">
                <button type="button" class="rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5" @click="showExportModal = false">Cancel</button>
                <button type="button" class="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-40" :disabled="isExporting" @click="exportCsv">
                  {{ isExporting ? 'Exporting…' : 'Export' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="showAddExpenseModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
          <div class="glass-panel w-full max-w-md rounded-md p-6 shadow-xl">
            <h3 class="mb-4 text-lg font-medium text-slate-100">Add New Expense</h3>
            <form class="flex flex-col gap-4" @submit.prevent="addExpense">
              <div class="flex flex-col gap-1.5">
                <span class="text-sm text-slate-300">Description</span>
                <div class="flex items-center gap-2">
                  <CategoryPicker v-model="expenseCategory" />
                  <input
                    v-model="expenseDescription"
                    type="text"
                    placeholder="E.g., Dinner, Taxi..."
                    class="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-brand-500/40 focus:bg-white/10"
                  />
                </div>
              </div>

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
                <span class="text-sm text-slate-300">Paid by</span>
                <UserPicker
                  v-model="expensePaidByUserId"
                  :members="selectableMembers"
                />
              </label>

              <!-- Split between -->
              <div class="flex flex-col gap-3">
                <span class="text-sm text-slate-300">Split between</span>
                <div class="flex flex-col gap-1.5">
                  <label
                    v-for="member in selectableMembers"
                    :key="member.id"
                    class="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 transition hover:bg-white/5"
                  >
                    <input
                      type="checkbox"
                      :checked="selectedSplitUserIds.includes(member.id)"
                      class="h-4 w-4 rounded border-white/20 bg-white/5 text-brand-500 focus:ring-brand-500/40"
                      @change="toggleSplitUser(member.id)"
                    />
                    <span
                      class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-xs font-semibold text-brand-500"
                    >
                      {{ getInitial(member.displayName) }}
                    </span>
                    <span class="text-sm text-slate-200">{{ member.displayName }}</span>
                  </label>
                </div>

                <!-- Split mode selector -->
                <div class="flex rounded-md border border-white/10 bg-white/5 p-0.5">
                  <button
                    type="button"
                    :class="[
                      'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition',
                      splitMode === 'EQUAL' ? 'bg-brand-500 text-slate-950' : 'text-slate-300 hover:text-slate-100',
                    ]"
                    @click="splitMode = 'EQUAL'"
                  >
                    Equal
                  </button>
                  <button
                    type="button"
                    :class="[
                      'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition',
                      splitMode === 'PERCENT' ? 'bg-brand-500 text-slate-950' : 'text-slate-300 hover:text-slate-100',
                    ]"
                    @click="splitMode = 'PERCENT'"
                  >
                    Percentage
                  </button>
                  <button
                    type="button"
                    :class="[
                      'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition',
                      splitMode === 'FIXED' ? 'bg-brand-500 text-slate-950' : 'text-slate-300 hover:text-slate-100',
                    ]"
                    @click="splitMode = 'FIXED'"
                  >
                    Fixed amount
                  </button>
                </div>

                <!-- Equal mode hint -->
                <p v-if="splitMode === 'EQUAL' && selectedSplitUserIds.length > 0 && expenseAmount && Number(expenseAmount) > 0" class="text-xs text-slate-400">
                  Each person pays &euro;{{ equalSplitPerPerson.toFixed(2) }}
                </p>

                <!-- Percentage mode inputs -->
                <div v-if="splitMode === 'PERCENT'" class="flex flex-col gap-1.5">
                  <div
                    v-for="userId in selectedSplitUserIds"
                    :key="userId"
                    class="flex items-center gap-2"
                  >
                    <span class="min-w-0 flex-1 truncate text-sm text-slate-200">
                      {{ selectableMembers.find((m) => m.id === userId)?.displayName }}
                    </span>
                    <input
                      v-model.number="percentValues[userId]"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      placeholder="0"
                      class="w-24 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-brand-500/40 focus:bg-white/10"
                    />
                    <span class="text-xs text-slate-400">%</span>
                  </div>
                </div>

                <!-- Fixed amount mode inputs -->
                <div v-if="splitMode === 'FIXED'" class="flex flex-col gap-1.5">
                  <div
                    v-for="userId in selectedSplitUserIds"
                    :key="userId"
                    class="flex items-center gap-2"
                  >
                    <span class="min-w-0 flex-1 truncate text-sm text-slate-200">
                      {{ selectableMembers.find((m) => m.id === userId)?.displayName }}
                    </span>
                    <input
                      v-model.number="fixedValues[userId]"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      class="w-24 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-brand-500/40 focus:bg-white/10"
                    />
                    <span class="text-xs text-slate-400">&euro;</span>
                  </div>
                </div>

                <!-- Split validation error -->
                <p
                  v-if="createSplitErrorMessage"
                  class="text-xs text-rose-300"
                >
                  {{ createSplitErrorMessage }}
                </p>
              </div>

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
                  :disabled="isSubmittingExpense || !isCreateSplitValid"
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
                <div class="flex flex-col gap-1.5">
                  <span class="text-sm text-slate-300">Description</span>
                  <div class="flex items-center gap-2">
                    <CategoryPicker v-model="editCategory" />
                    <input
                      v-model="editDescription"
                      type="text"
                      class="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-brand-500/40 focus:bg-white/10"
                    />
                  </div>
                </div>

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
                  />
                </label>

                <!-- Edit split between -->
                <div class="flex flex-col gap-3">
                  <span class="text-sm text-slate-300">Split between</span>
                  <div class="flex flex-col gap-1.5">
                    <label
                      v-for="member in selectableMembers"
                      :key="member.id"
                      class="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 transition hover:bg-white/5"
                    >
                      <input
                        type="checkbox"
                        :checked="editSelectedSplitUserIds.includes(member.id)"
                        class="h-4 w-4 rounded border-white/20 bg-white/5 text-brand-500 focus:ring-brand-500/40"
                        @change="toggleEditSplitUser(member.id)"
                      />
                      <span
                        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-xs font-semibold text-brand-500"
                      >
                        {{ getInitial(member.displayName) }}
                      </span>
                      <span class="text-sm text-slate-200">{{ member.displayName }}</span>
                    </label>
                  </div>

                  <!-- Edit split mode selector -->
                  <div class="flex rounded-md border border-white/10 bg-white/5 p-0.5">
                    <button
                      type="button"
                      :class="[
                        'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition',
                        editSplitMode === 'EQUAL' ? 'bg-brand-500 text-slate-950' : 'text-slate-300 hover:text-slate-100',
                      ]"
                      @click="editSplitMode = 'EQUAL'"
                    >
                      Equal
                    </button>
                    <button
                      type="button"
                      :class="[
                        'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition',
                        editSplitMode === 'PERCENT' ? 'bg-brand-500 text-slate-950' : 'text-slate-300 hover:text-slate-100',
                      ]"
                      @click="editSplitMode = 'PERCENT'"
                    >
                      Percentage
                    </button>
                    <button
                      type="button"
                      :class="[
                        'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition',
                        editSplitMode === 'FIXED' ? 'bg-brand-500 text-slate-950' : 'text-slate-300 hover:text-slate-100',
                      ]"
                      @click="editSplitMode = 'FIXED'"
                    >
                      Fixed amount
                    </button>
                  </div>

                  <!-- Edit Equal mode hint -->
                  <p v-if="editSplitMode === 'EQUAL' && editSelectedSplitUserIds.length > 0 && editAmount && Number(editAmount) > 0" class="text-xs text-slate-400">
                    Each person pays &euro;{{ editEqualSplitPerPerson.toFixed(2) }}
                  </p>

                  <!-- Edit Percentage mode inputs -->
                  <div v-if="editSplitMode === 'PERCENT'" class="flex flex-col gap-1.5">
                    <div
                      v-for="userId in editSelectedSplitUserIds"
                      :key="userId"
                      class="flex items-center gap-2"
                    >
                      <span class="min-w-0 flex-1 truncate text-sm text-slate-200">
                        {{ selectableMembers.find((m) => m.id === userId)?.displayName }}
                      </span>
                      <input
                        v-model.number="editPercentValues[userId]"
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        placeholder="0"
                        class="w-24 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-brand-500/40 focus:bg-white/10"
                      />
                      <span class="text-xs text-slate-400">%</span>
                    </div>
                  </div>

                  <!-- Edit Fixed amount mode inputs -->
                  <div v-if="editSplitMode === 'FIXED'" class="flex flex-col gap-1.5">
                    <div
                      v-for="userId in editSelectedSplitUserIds"
                      :key="userId"
                      class="flex items-center gap-2"
                    >
                      <span class="min-w-0 flex-1 truncate text-sm text-slate-200">
                        {{ selectableMembers.find((m) => m.id === userId)?.displayName }}
                      </span>
                      <input
                        v-model.number="editFixedValues[userId]"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        class="w-24 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-brand-500/40 focus:bg-white/10"
                      />
                      <span class="text-xs text-slate-400">&euro;</span>
                    </div>
                  </div>

                  <!-- Edit split validation error -->
                  <p
                    v-if="editSplitErrorMessage"
                    class="text-xs text-rose-300"
                  >
                    {{ editSplitErrorMessage }}
                  </p>
                </div>

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
                    :disabled="isSubmittingEdit || !isEditSplitValid"
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

        <!-- Settle-up modal -->
        <SettleUpModal
          v-if="showSettleUpModal && group.balance"
          :mode="editingSettlement ? 'edit' : 'create'"
          :group-id="groupId"
          :members="selectableMembers"
          :balance="group.balance"
          :current-user-id="authStore.user?.id ?? ''"
          :settlement="editingSettlement ?? undefined"
          @saved="onSettlementSaved"
          @deleted="onSettlementDeleted"
          @close="closeSettleUpModal"
        />

        <section class="glass-panel overflow-hidden rounded-md">
          <h2 class="px-6 py-4 text-sm font-medium uppercase tracking-wide text-slate-400 sm:px-8">
            Expenses
          </h2>

          <template v-if="group.expenses.length > 0">
            <template v-for="monthGroup in groupExpensesByMonth" :key="monthGroup.monthYear">
              <!-- Month header -->
              <div class="border-t border-white/10 px-6 py-3 sm:px-8">
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
                  @click="expense.kind === 'SETTLEMENT' ? openSettleUpModal('edit', expense) : openExpenseModal(expense)"
                >
                  <div class="flex items-center justify-between gap-3 sm:gap-4">
                    <!-- Date on the left -->
                    <div class="flex w-10 shrink-0 flex-col items-center justify-center gap-0.5 text-center">
                      <span class="text-[10px] font-semibold uppercase text-slate-400 sm:text-xs">
                        {{ formatDateShort(getExpenseDateValue(expense)).monthShort }}
                      </span>
                      <span class="text-base font-semibold text-slate-400 sm:text-lg">
                        {{ formatDateShort(getExpenseDateValue(expense)).day }}
                      </span>
                    </div>

                    <!-- Category icon -->
                    <div
                      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-base"
                      :title="expense.kind === 'SETTLEMENT' ? 'Settlement' : getCategory(expense.category).label"
                    >
                      <span v-if="expense.kind === 'SETTLEMENT'" aria-hidden="true">🤝</span>
                      <span v-else aria-hidden="true">{{ getCategory(expense.category).icon }}</span>
                    </div>

                    <!-- Description and who paid in the middle -->
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-medium text-slate-100 sm:text-base">{{ expense.description }}</p>
                      <p v-if="expense.kind === 'SETTLEMENT'" class="text-xs text-slate-400 sm:text-sm">
                        {{ expense.paidByName }} paid {{ expense.settledWithName }}
                      </p>
                      <p v-else class="text-xs text-slate-400 sm:text-sm">Paid by {{ expense.paidByName }}</p>
                    </div>

                    <!-- Amount on the right -->
                    <span class="shrink-0 text-sm font-semibold text-slate-100 sm:text-base">
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
