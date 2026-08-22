<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  toRef,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { api } from '@/lib/api';
import { currentPageTitle, sharedGroup } from '@/router';
import {
  useExpenseSplit,
  type UseExpenseSplitReturn,
} from '@/composables/useExpenseSplit';
import CategoryPicker from '@/components/CategoryPicker.vue';
import DateTimePicker from '@/components/DateTimePicker.vue';
import { formatEur } from '@/lib/format';
import { DEFAULT_CATEGORY_KEY } from '@/lib/categories';
import { suggestCategory } from '@/lib/categorySuggest';
import type { Expense, GroupDetail } from '@/types/group';

// Render only the first word of a member's display name inside the compact
// member buttons; CSS `truncate` adds "…" if even that is too wide.
const shortName = (displayName: string): string =>
  displayName.trim().split(/\s+/)[0] || displayName;

// Debounce window for description-driven category auto-selection: the user has
// to pause typing for this long before we ask the suggestion engine to pick a
// category. Keep it short enough to feel instant, long enough to coalesce
// multi-keystroke inputs into a single lookup.
const DESCRIPTION_SUGGEST_DEBOUNCE_MS = 300;

const route = useRoute();
const router = useRouter();

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

// --- Group fetch (deep-link fallback) ---
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

// --- Date helpers ---
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

// Flips to true the moment the user manually picks a category from the picker,
// and resets to false on every (re-)initialisation. Together with the
// `category.value !== DEFAULT_CATEGORY_KEY` guard inside `applySuggestion`,
// this is what guarantees the suggestion engine can never overwrite a
// deliberate user choice, and can only fill in the still-default slot.
const categoryTouched = ref(false);

// Pending debounced suggestion lookup. Held at module scope inside the setup
// function so it survives across renders; cleared on unmount and on every
// re-initialise to prevent a stale callback from mutating state.
let suggestTimer: ReturnType<typeof setTimeout> | undefined;

const onCategoryPicked = () => {
  categoryTouched.value = true;
};

const applySuggestion = () => {
  suggestTimer = undefined;
  if (categoryTouched.value) return;
  // Suggestion engine can only fill the default slot. In edit mode a stored
  // non-default category is treated as already selected, so this guard skips
  // any lookup and leaves it alone.
  if (category.value !== DEFAULT_CATEGORY_KEY) return;
  const suggestion = suggestCategory(
    description.value,
    group.value?.expenses ?? [],
  );
  if (!suggestion || suggestion.key === category.value) return;
  // SILENT: no pulse, no animation, no toast — the picker just reflects the
  // new value on its next paint.
  category.value = suggestion.key;
};

const scheduleSuggestion = () => {
  if (suggestTimer !== undefined) clearTimeout(suggestTimer);
  suggestTimer = setTimeout(applySuggestion, DESCRIPTION_SUGGEST_DEBOUNCE_MS);
};

// --- Split composable ---
// The composable must be called once the group is loaded so it sees the real
// `members` and (in edit mode) the existing splits. We store its return in a
// `reactive` proxy and assign the properties after the fetch, so the template
// can use `split.selectedSplitUserIds` etc. with full reactivity.
const membersRef = toRef(() => group.value?.members ?? []);
const split = reactive<UseExpenseSplitReturn>(
  {} as unknown as UseExpenseSplitReturn,
);

// --- Initialization (after data load) ---
const initialise = () => {
  showDeleteConfirm.value = false;
  errorMessage.value = '';
  // Reset the manual-selection flag so a freshly loaded form can still
  // auto-pick the default slot. Any pending suggestion is also dropped — it
  // belongs to the previous form instance and would otherwise fire against
  // freshly-loaded state.
  categoryTouched.value = false;
  if (suggestTimer !== undefined) {
    clearTimeout(suggestTimer);
    suggestTimer = undefined;
  }

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
    useExpenseSplit(membersRef, expense ? expense.splits : undefined),
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
    paidByUserId.value = group.value?.members[0]?.id ?? '';
  }
};

// --- Validation ---
const numericAmount = computed(() => Number(amount.value));

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
    return 'Please provide a valid description and an amount greater than 0.';
  }
  if (typeof amount.value !== 'number' || amount.value <= 0) {
    return 'Please provide a valid description and an amount greater than 0.';
  }
  if (!date.value) {
    return 'Please provide a valid description, date, and an amount greater than 0.';
  }
  if (!paidByUserId.value) {
    return 'Please select who paid the expense.';
  }
  if (split.splitErrorMessage) {
    const splitErr = split.splitErrorMessage(numericAmount.value);
    if (splitErr) return splitErr;
  }
  return '';
});

const pageTitle = computed(() =>
  mode.value === 'edit' ? 'Edit Expense' : 'Add Expense',
);

// --- Navigation ---
const goBack = () => {
  router.push({
    name: 'group-detail',
    params: { id: groupId.value },
    state: { groupName: group.value?.name },
  });
};

// --- Submit ---
const submit = async () => {
  if (
    !description.value ||
    typeof amount.value !== 'number' ||
    amount.value <= 0
  ) {
    errorMessage.value =
      'Please provide a valid description and an amount greater than 0.';
    return;
  }

  if (!date.value) {
    errorMessage.value =
      'Please provide a valid description, date, and an amount greater than 0.';
    return;
  }

  if (!paidByUserId.value) {
    errorMessage.value = 'Please select who paid the expense.';
    return;
  }

  if (!split.isSplitValid || !split.isSplitValid(numericAmount.value)) {
    errorMessage.value =
      (split.splitErrorMessage &&
        split.splitErrorMessage(numericAmount.value)) ||
      'Please fix the split values.';
    return;
  }

  submitting.value = true;
  errorMessage.value = '';

  try {
    const amt = numericAmount.value;
    const splits = split.buildSplitPayload();
    const payload: Record<string, unknown> = {
      description: description.value,
      amount: amt,
      date: date.value,
      category: category.value,
      paidByUserId: paidByUserId.value,
      splits: splits.map((s) => ({
        userId: s.userId,
        shareType: s.shareType,
        shareValue: s.shareValue,
      })),
    };

    if (mode.value === 'create') {
      await api.post(`/groups/${groupId.value}/expenses`, payload);
    } else {
      await api.patch(
        `/groups/${groupId.value}/expenses/${expenseId.value}`,
        payload,
      );
    }
    goBack();
  } catch {
    errorMessage.value =
      mode.value === 'edit'
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
    await api.delete(`/groups/${groupId.value}/expenses/${expenseId.value}`);
    goBack();
  } catch {
    errorMessage.value = 'Could not delete the expense. Please try again.';
  } finally {
    deleting.value = false;
  }
};

// --- Lifecycle ---
onMounted(async () => {
  // Set the topbar title synchronously so AppTopbar renders the right label on
  // first paint.
  currentPageTitle.value = pageTitle.value;

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
  if (suggestTimer !== undefined) {
    clearTimeout(suggestTimer);
    suggestTimer = undefined;
  }
});
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
    v-if="!group && !notFound && !loadError"
    class="flex-1 overflow-y-auto px-4 py-6"
  >
    <p class="text-[#C8C4D7] text-center">Loading...</p>
  </main>

  <!-- Group-load failure -->
  <main v-else-if="loadError" class="flex-1 overflow-y-auto px-4 py-6">
    <p
      class="rounded-xl px-4 py-3 text-sm text-rose-200 bg-rose-500/10 border border-rose-500/20"
    >
      Group not found.
    </p>
  </main>

  <!-- Not-found state -->
  <main v-else-if="notFound" class="flex-1 overflow-y-auto px-4 py-6">
    <p
      class="rounded-xl px-4 py-3 text-sm text-rose-200 bg-rose-500/10 border border-rose-500/20"
    >
      Expense not found.
    </p>
  </main>

  <!-- Form -->
  <main
    v-else-if="group"
    class="mx-auto w-full max-w-5xl flex flex-col flex-1 overflow-hidden"
  >
    <div class="flex-1 overflow-y-auto px-4 py-6">
      <div class="flex flex-col gap-4">
        <template v-if="!showDeleteConfirm">
          <form
            id="expense-form"
            class="flex flex-col gap-4"
            @submit.prevent="submit"
          >
            <!-- Amount (Figma-aligned) -->
            <div class="flex flex-col gap-2">
              <label
                for="expense-amount"
                class="font-display text-[10px] font-medium uppercase tracking-[0.05em] text-[#C8C4D7]"
                >Amount</label
              >
              <div class="relative">
                <input
                  id="expense-amount"
                  v-model="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  autofocus
                  class="w-full rounded-lg bg-[#201F27] border border-[rgba(71,69,84,0.3)] py-3 pl-4 pr-12 text-base text-left text-[#E5E0ED] outline-none placeholder-[#C8C4D7] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span
                  class="absolute right-4 top-1/2 -translate-y-1/2 text-xl text-[#E5E0ED] font-semibold select-none"
                  >&euro;</span
                >
              </div>
            </div>

            <!-- Description + Category -->
            <div class="flex gap-2">
              <CategoryPicker
                v-model="category"
                @update:model-value="onCategoryPicked"
              />
              <input
                v-model="description"
                type="text"
                placeholder="Description"
                class="flex-1 rounded-xl px-4 py-3 text-sm outline-none"
                style="
                  background: #201f27;
                  border: 1px solid rgba(71, 69, 84, 0.3);
                  color: #e5e0ed;
                "
                @input="scheduleSuggestion"
              />
            </div>

            <!-- Paid by -->
            <div class="flex flex-col gap-2">
              <span
                class="font-display text-[10px] font-medium uppercase tracking-[0.05em]"
                style="color: #c8c4d7"
                >Paid by</span
              >
              <div class="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap">
                <button
                  v-for="member in group.members"
                  :key="member.id"
                  type="button"
                  class="flex min-w-0 flex-col items-center gap-2 rounded-xl px-2 py-2 transition sm:w-20 sm:shrink-0"
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
                    style="color: #c6bfff"
                    >{{ member.displayName.charAt(0).toUpperCase() }}</span
                  >
                  <span class="max-w-full truncate text-xs" style="color: #e5e0ed">{{
                    shortName(member.displayName)
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
                style="color: #c8c4d7"
                >Split with</span
              >
              <div class="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap">
                <button
                  v-for="member in group.members"
                  :key="member.id"
                  type="button"
                  class="flex min-w-0 flex-col items-center gap-2 rounded-xl px-2 py-2 transition sm:w-20 sm:shrink-0"
                  :class="
                    split.selectedSplitUserIds.includes(member.id)
                      ? 'bg-[#6554E7]/20 ring-1 ring-[#6554E7]'
                      : 'hover:bg-[#2A2932]'
                  "
                  :style="
                    !split.selectedSplitUserIds.includes(member.id)
                      ? 'background: #201F27'
                      : ''
                  "
                  @click="split.toggleSplitUser(member.id)"
                >
                  <span
                    class="flex h-6 w-6 items-center justify-center rounded-full bg-[#6554E7]/30 text-[10px] font-semibold"
                    style="color: #c6bfff"
                    >{{ member.displayName.charAt(0).toUpperCase() }}</span
                  >
                  <span class="max-w-full truncate text-xs" style="color: #e5e0ed">{{
                    shortName(member.displayName)
                  }}</span>
                </button>
              </div>
            </div>

            <!-- Split mode tabs -->
            <div
              v-if="split.selectedSplitUserIds.length > 0"
              class="flex flex-col gap-3"
            >
              <div
                class="flex rounded-xl p-1"
                style="
                  background: #201f27;
                  border: 1px solid rgba(255, 255, 255, 0.08);
                "
              >
                <button
                  type="button"
                  class="flex-1 rounded-lg py-2 text-xs font-medium transition"
                  :class="
                    split.splitMode === 'EQUAL'
                      ? 'bg-[#35343D] text-white'
                      : 'hover:text-[#E5E0ED]'
                  "
                  :style="split.splitMode !== 'EQUAL' ? 'color: #C8C4D7' : ''"
                  @click="split.splitMode = 'EQUAL'"
                >
                  Equally
                </button>
                <button
                  type="button"
                  class="flex-1 rounded-lg py-2 text-xs font-medium transition"
                  :class="
                    split.splitMode === 'PERCENT'
                      ? 'bg-[#35343D] text-white'
                      : 'hover:text-[#E5E0ED]'
                  "
                  :style="split.splitMode !== 'PERCENT' ? 'color: #C8C4D7' : ''"
                  @click="split.splitMode = 'PERCENT'"
                >
                  Percentage
                </button>
                <button
                  type="button"
                  class="flex-1 rounded-lg py-2 text-xs font-medium transition"
                  :class="
                    split.splitMode === 'FIXED'
                      ? 'bg-[#35343D] text-white'
                      : 'hover:text-[#E5E0ED]'
                  "
                  :style="split.splitMode !== 'FIXED' ? 'color: #C8C4D7' : ''"
                  @click="split.splitMode = 'FIXED'"
                >
                  Fixed
                </button>
              </div>

              <!-- Equal hint -->
              <p
                v-if="
                  split.splitMode === 'EQUAL' && amount && Number(amount) > 0
                "
                class="text-sm text-right"
                style="color: #c8c4d7"
              >
                Each pays
                {{ formatEur(split.equalSplitPerPerson(Number(amount))) }}
              </p>

              <!-- Percentage rows -->
              <div
                v-if="split.splitMode === 'PERCENT'"
                class="flex flex-col gap-2"
              >
                <div
                  v-for="userId in split.selectedSplitUserIds"
                  :key="userId"
                  class="flex items-center gap-2"
                >
                  <span
                    class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#6554E7]/30 text-[10px] font-semibold"
                    style="color: #c6bfff"
                    >{{
                      group.members
                        .find((m) => m.id === userId)
                        ?.displayName.charAt(0)
                        .toUpperCase()
                    }}</span
                  >
                  <span
                    class="flex-1 truncate text-sm"
                    style="color: #e5e0ed"
                    >{{
                      group.members.find((m) => m.id === userId)?.displayName
                    }}</span
                  >
                  <input
                    v-model.number="split.percentValues[userId]"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    placeholder="0"
                    class="w-20 rounded-lg px-3 py-2 text-sm text-right outline-none"
                    style="
                      background: #201f27;
                      border: 1px solid rgba(71, 69, 84, 0.3);
                      color: #e5e0ed;
                    "
                  />
                  <span class="w-4 text-sm" style="color: #c8c4d7">%</span>
                </div>
                <p class="text-sm text-right" style="color: #c8c4d7">
                  Total: {{ Number(split.percentSum).toFixed(1) }}%
                </p>
              </div>

              <!-- Fixed rows -->
              <div
                v-if="split.splitMode === 'FIXED'"
                class="flex flex-col gap-2"
              >
                <div
                  v-for="userId in split.selectedSplitUserIds"
                  :key="userId"
                  class="flex items-center gap-2"
                >
                  <span
                    class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#6554E7]/30 text-[10px] font-semibold"
                    style="color: #c6bfff"
                    >{{
                      group.members
                        .find((m) => m.id === userId)
                        ?.displayName.charAt(0)
                        .toUpperCase()
                    }}</span
                  >
                  <span
                    class="flex-1 truncate text-sm"
                    style="color: #e5e0ed"
                    >{{
                      group.members.find((m) => m.id === userId)?.displayName
                    }}</span
                  >
                  <input
                    v-model.number="split.fixedValues[userId]"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    class="w-24 rounded-lg px-3 py-2 text-sm text-right outline-none"
                    style="
                      background: #201f27;
                      border: 1px solid rgba(71, 69, 84, 0.3);
                      color: #e5e0ed;
                    "
                  />
                  <span class="w-4 text-sm" style="color: #c8c4d7">&euro;</span>
                </div>
                <p class="text-sm text-right" style="color: #c8c4d7">
                  Total: {{ formatEur(Number(split.fixedSum)) }}
                </p>
              </div>

              <p
                v-if="validationMessage"
                class="text-sm"
                style="color: #ffb4ab"
              >
                {{ validationMessage }}
              </p>
            </div>

            <!-- Error -->
            <p
              v-if="errorMessage"
              class="rounded-xl px-4 py-3 text-sm"
              style="
                color: #ffb4ab;
                background: rgba(255, 180, 171, 0.1);
                border: 1px solid rgba(255, 180, 171, 0.2);
              "
            >
              {{ errorMessage }}
            </p>
          </form>
        </template>

        <template v-else>
          <div
            class="rounded-2xl border border-white/[0.08] p-6"
            style="background: #1e1e26"
          >
            <h3
              class="text-center text-xl font-semibold mb-4"
              style="color: #e5e0ed"
            >
              Are you sure?
            </h3>
            <p class="mb-6 text-sm text-center" style="color: #c8c4d7">
              Do you really want to delete this expense? This action cannot be
              undone.
            </p>

            <p
              v-if="errorMessage"
              class="mb-4 rounded-xl px-4 py-3 text-sm"
              style="
                color: #ffb4ab;
                background: rgba(255, 180, 171, 0.1);
                border: 1px solid rgba(255, 180, 171, 0.2);
              "
            >
              {{ errorMessage }}
            </p>

            <div class="flex flex-col gap-3">
              <button
                type="button"
                class="w-full rounded-xl py-4 text-base font-semibold transition hover:bg-[#e0392f] disabled:opacity-60"
                style="background: #ff5252; color: #fff"
                :disabled="deleting"
                @click="confirmDelete"
              >
                {{ deleting ? 'Deleting...' : 'Confirm Delete' }}
              </button>
              <button
                type="button"
                class="w-full py-2 text-center text-sm transition hover:text-[#E5E0ED]"
                style="color: #c8c4d7"
                :disabled="deleting"
                @click="cancelDelete"
              >
                Cancel
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>
    <div class="relative shrink-0 px-4" v-if="!showDeleteConfirm">
      <div
        class="absolute inset-x-0 bottom-full h-4 bg-gradient-to-t from-[#13121B] pointer-events-none"
      ></div>
      <div class="flex flex-col gap-2 pb-4">
        <button
          type="submit"
          form="expense-form"
          class="w-full rounded-xl py-4 text-base font-semibold transition hover:bg-[#5a44cf] disabled:cursor-not-allowed disabled:bg-[#474554]"
          style="background: #6554e7; color: #f0ebff"
          :disabled="submitting || !isFormValid"
        >
          {{ submitting ? 'Saving...' : 'Save' }}
        </button>

        <button
          v-if="mode === 'edit'"
          type="button"
          class="w-full py-2 text-center text-sm font-medium transition hover:bg-[#2A2932]"
          style="
            color: #ffb4ab;
            border: 1px solid rgba(255, 180, 171, 0.3);
            border-radius: 0.75rem;
          "
          @click="startDelete"
        >
          Delete
        </button>
      </div>
    </div>
  </main>
</template>
