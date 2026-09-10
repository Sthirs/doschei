<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import axios from 'axios';

import { api } from '@/lib/api';

const props = defineProps<{ groupId: string; groupName: string }>();
const emit = defineEmits<{ close: [] }>();

const { t, locale } = useI18n();

const now = new Date();
const exportMonthValue = ref(now.getMonth() + 1);
const exportYearValue = ref(now.getFullYear());
const exportMonth = computed(
  () =>
    `${exportYearValue.value}-${String(exportMonthValue.value).padStart(2, '0')}`,
);
const isExporting = ref(false);
const exportErrorMessage = ref('');

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);
// `toLocaleDateString` is called with the active locale so Italian users see
// Italian month names ("gennaio", "febbraio", …).
const monthName = (m: number) =>
  new Date(2000, m - 1, 1).toLocaleDateString(locale.value, { month: 'long' });

/**
 * Pull `{ message }` out of an error response. `responseType: 'blob'` applies to
 * error responses as well, so the JSON body arrives as a Blob.
 */
const readErrorMessage = async (data: unknown): Promise<string | null> => {
  try {
    const text = data instanceof Blob ? await data.text() : String(data ?? '');
    const parsed: unknown = JSON.parse(text);
    const message = (parsed as { message?: unknown }).message;
    return typeof message === 'string' ? message : null;
  } catch {
    return null;
  }
};

const exportCsv = async () => {
  isExporting.value = true;
  exportErrorMessage.value = '';
  try {
    // Goes through the shared `api` instance rather than a bare fetch, so it
    // inherits the ADR-0023 renew-and-retry interceptor. With a one-hour access
    // token, a hand-rolled fetch reading localStorage directly would simply fail
    // for anyone who opens this sheet an hour into a session.
    const response = await api.get<Blob>(
      `/groups/${props.groupId}/expenses/export`,
      { params: { month: exportMonth.value }, responseType: 'blob' },
    );
    const objectUrl = URL.createObjectURL(response.data);
    const a = document.createElement('a');
    a.href = objectUrl;
    // axios lowercases response header keys.
    const contentDisp = String(response.headers['content-disposition'] ?? '');
    const filenameMatch = contentDisp.match(/filename\*?=(?:UTF-8''|")([^"]+)/);
    const filename = filenameMatch
      ? decodeURIComponent(filenameMatch[1])
      : `${props.groupName}-export.csv`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
    emit('close');
  } catch (err: unknown) {
    // With responseType 'blob' an error body arrives as a Blob too, so the
    // server's message has to be read back out of it.
    if (axios.isAxiosError(err) && err.response) {
      exportErrorMessage.value =
        (await readErrorMessage(err.response.data)) ??
        t('groupDetail.exportFailed');
      return;
    }
    exportErrorMessage.value = t('groupDetail.exportFailedTryAgain');
  } finally {
    isExporting.value = false;
  }
};
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-md rounded-t-2xl border border-[rgba(71,69,84,0.3)] bg-[#201F27] p-6 shadow-xl sm:rounded-2xl"
      role="dialog"
      aria-modal="true"
      :aria-label="t('groupDetail.exportModalTitle')"
    >
      <div
        class="-mx-6 flex items-start justify-between border-b border-white/[0.06] px-6 pb-4"
      >
        <p
          class="font-display text-xs font-medium uppercase tracking-[0.05em] text-[#C8C4D7]"
        >
          {{ t('groupDetail.selectPeriod') }}
        </p>
        <button
          type="button"
          class="text-[#C8C4D7] transition hover:text-[#E5E0ED]"
          :aria-label="t('common.close')"
          @click="emit('close')"
        >
          <svg
            viewBox="0 0 24 24"
            class="h-5 w-5 fill-none stroke-current"
            stroke-width="2"
          >
            <path d="M6 6l12 12M6 18L18 6" stroke-linecap="round" />
          </svg>
        </button>
      </div>
      <p class="mt-3 text-center text-lg font-semibold text-[#E5E0ED]">
        {{ monthName(exportMonthValue) }} {{ exportYearValue }}
      </p>
      <div class="mt-4 flex gap-3">
        <label class="flex-1 flex flex-col gap-1.5">
          <span
            class="font-display text-[10px] font-medium uppercase tracking-[0.05em] text-[#C8C4D7]"
            >{{ t('groupDetail.monthLabel') }}</span
          >
          <div class="relative">
            <select
              v-model.number="exportMonthValue"
              class="w-full appearance-none rounded-xl border border-white/[0.05] bg-[#2A2932] py-3 pl-4 pr-10 text-sm text-[#E5E0ED] outline-none transition focus:border-brand-500/40"
            >
              <option v-for="m in MONTH_OPTIONS" :key="m" :value="m">
                {{ monthName(m) }}
              </option>
            </select>
            <svg
              viewBox="0 0 20 20"
              class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 fill-current text-[#C8C4D7]"
              aria-hidden="true"
            >
              <path
                fill-rule="evenodd"
                d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                clip-rule="evenodd"
              />
            </svg>
          </div>
        </label>
        <label class="flex-1 flex flex-col gap-1.5">
          <span
            class="font-display text-[10px] font-medium uppercase tracking-[0.05em] text-[#C8C4D7]"
            >{{ t('groupDetail.yearLabel') }}</span
          >
          <div class="relative">
            <select
              v-model.number="exportYearValue"
              class="w-full appearance-none rounded-xl border border-white/[0.05] bg-[#2A2932] py-3 pl-4 pr-10 text-sm text-[#E5E0ED] outline-none transition focus:border-brand-500/40"
            >
              <option v-for="y in YEAR_OPTIONS" :key="y" :value="y">
                {{ y }}
              </option>
            </select>
            <svg
              viewBox="0 0 20 20"
              class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 fill-current text-[#C8C4D7]"
              aria-hidden="true"
            >
              <path
                fill-rule="evenodd"
                d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                clip-rule="evenodd"
              />
            </svg>
          </div>
        </label>
      </div>
      <p
        v-if="exportErrorMessage"
        class="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
      >
        {{ exportErrorMessage }}
      </p>
      <button
        type="button"
        class="mt-4 w-full rounded-xl bg-[#6554E7] py-3 text-base font-normal text-[#F0EBFF] transition hover:bg-[#5a44cf] disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="isExporting"
        @click="exportCsv"
      >
        <span v-if="isExporting" class="flex items-center justify-center gap-2">
          <svg class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          {{ t('groupDetail.exporting') }}
        </span>
        <span v-else>{{ t('groupDetail.exportExpenses') }}</span>
      </button>
      <button
        type="button"
        class="mt-2 w-full py-2 text-center text-sm text-[#C8C4D7] transition hover:text-[#E5E0ED]"
        @click="emit('close')"
      >
        {{ t('common.cancel') }}
      </button>
    </div>
  </div>
</template>
