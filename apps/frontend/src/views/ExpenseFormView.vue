<script setup lang="ts">
import { provide } from 'vue';
import { useI18n } from 'vue-i18n';

import { useExpenseForm } from '@/composables/useExpenseForm';
import { expenseSplitKey } from '@/composables/useExpenseSplit';
import DateTimePicker from '@/components/DateTimePicker.vue';
import AmountField from '@/components/expense-form/AmountField.vue';
import DeleteConfirmPanel from '@/components/expense-form/DeleteConfirmPanel.vue';
import DescriptionRow from '@/components/expense-form/DescriptionRow.vue';
import FormFooter from '@/components/expense-form/FormFooter.vue';
import PaidBySection from '@/components/expense-form/PaidBySection.vue';
import SplitDetails from '@/components/expense-form/SplitDetails.vue';
import SplitWithSection from '@/components/expense-form/SplitWithSection.vue';

const { t } = useI18n();

const {
  mode,
  group,
  notFound,
  loadError,
  description,
  amount,
  date,
  category,
  paidByUserId,
  errorMessage,
  submitting,
  deleting,
  showDeleteConfirm,
  split,
  isFormValid,
  validationMessage,
  onCategoryPicked,
  scheduleSuggestion,
  goBack,
  submit,
  startDelete,
  cancelDelete,
  confirmDelete,
} = useExpenseForm();

provide(expenseSplitKey, split);
</script>

<template>
  <!-- Topbar: back arrow -->
  <Teleport to="#topbar-leading">
    <button
      type="button"
      class="flex h-9 w-9 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-slate-100"
      :aria-label="t('expenseForm.backToGroup')"
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
    <p class="text-[#C8C4D7] text-center">{{ t('expenseForm.loading') }}</p>
  </main>

  <!-- Group-load failure -->
  <main v-else-if="loadError" class="flex-1 overflow-y-auto px-4 py-6">
    <p
      class="rounded-xl px-4 py-3 text-sm text-rose-200 bg-rose-500/10 border border-rose-500/20"
    >
      {{ t('expenseForm.groupNotFound') }}
    </p>
  </main>

  <!-- Not-found state -->
  <main v-else-if="notFound" class="flex-1 overflow-y-auto px-4 py-6">
    <p
      class="rounded-xl px-4 py-3 text-sm text-rose-200 bg-rose-500/10 border border-rose-500/20"
    >
      {{ t('expenseForm.expenseNotFound') }}
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
            <AmountField v-model="amount" />

            <!-- Description + Category -->
            <DescriptionRow
              v-model:category="category"
              v-model:description="description"
              @category-picked="onCategoryPicked"
              @description-input="scheduleSuggestion"
            />

            <!-- Paid by -->
            <PaidBySection
              v-model:paid-by-user-id="paidByUserId"
              :group="group"
            />

            <!-- Date -->
            <DateTimePicker v-model="date" />

            <!-- Split between -->
            <SplitWithSection :group="group" />

            <!-- Split mode tabs -->
            <SplitDetails
              v-if="split.selectedSplitUserIds.length > 0"
              :group="group"
              :amount="amount"
              :validation-message="validationMessage"
            />

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
          <DeleteConfirmPanel
            :error-message="errorMessage"
            :deleting="deleting"
            @confirm="confirmDelete"
            @cancel="cancelDelete"
          />
        </template>
      </div>
    </div>
    <FormFooter
      v-if="!showDeleteConfirm"
      :submitting="submitting"
      :is-form-valid="isFormValid"
      :mode="mode"
      @delete="startDelete"
    />
  </main>
</template>
