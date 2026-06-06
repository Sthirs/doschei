<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { api } from '@/lib/api';
import type { GroupDetail } from '@/types/group';

const route = useRoute();
const router = useRouter();

const group = ref<GroupDetail | null>(null);
const isLoading = ref(true);
const errorMessage = ref('');

const loadGroup = async () => {
  isLoading.value = true;
  errorMessage.value = '';

  try {
    const { data } = await api.get<{ group: GroupDetail }>(`/groups/${route.params.id}`);
    group.value = data.group;
  } catch {
    errorMessage.value = 'We could not load this group.';
  } finally {
    isLoading.value = false;
  }
};

const goBack = () => {
  router.push({ name: 'groups' });
};

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
        <section class="glass-panel rounded-md px-6 py-5 sm:px-8">
          <h1 class="text-xl font-semibold text-slate-100 sm:text-2xl">{{ group.name }}</h1>
        </section>

        <section class="glass-panel overflow-hidden rounded-md">
          <h2 class="px-6 py-4 text-sm font-medium uppercase tracking-wide text-slate-400 sm:px-8">
            Expenses
          </h2>

          <ul v-if="group.expenses.length > 0" class="divide-y divide-white/10">
            <li v-for="expense in group.expenses" :key="expense.id" class="px-6 py-4 sm:px-8">
              <div class="flex items-center justify-between gap-4">
                <div class="min-w-0 flex-1">
                  <p class="truncate text-base font-medium text-slate-100">{{ expense.description }}</p>
                  <p class="text-sm text-slate-400">Paid by {{ expense.paidByName }}</p>
                </div>
                <span class="shrink-0 text-base font-semibold text-slate-100">
                  &euro;{{ expense.amount.toFixed(2) }}
                </span>
              </div>
            </li>
          </ul>

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
