<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

import { normalizeLocale, setAppLocale, type Locale } from '@/i18n';
import { currentPageTitle } from '@/router';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const authStore = useAuthStore();
const { t } = useI18n();

const name = ref(authStore.user?.displayName ?? '');
const email = authStore.user?.email ?? '';
const isSaving = ref(false);
const isSavingLanguage = ref(false);
const errorMessage = ref('');

// The select shows endonyms (English / Italiano) which are intentionally
// NOT translated — a user must be able to read them before switching.
const selectedLanguage = ref<Locale>(normalizeLocale(authStore.user?.language));

const onLanguageChange = async () => {
  const next = selectedLanguage.value;
  const previous = normalizeLocale(authStore.user?.language);
  if (next === previous) return;
  errorMessage.value = '';
  setAppLocale(next);
  isSavingLanguage.value = true;
  try {
    await authStore.updateLanguage(next);
  } catch {
    setAppLocale(previous);
    selectedLanguage.value = previous;
    errorMessage.value = t('account.saveError');
  } finally {
    isSavingLanguage.value = false;
  }
};

const userInitial = computed(
  () => name.value.trim().charAt(0).toUpperCase() || 'U',
);
const isDirty = computed(
  () =>
    name.value.trim() !== (authStore.user?.displayName ?? '') &&
    name.value.trim().length > 0,
);
const canSave = computed(
  () => isDirty.value && !isSaving.value && name.value.trim().length <= 100,
);

const goBack = () => {
  router.push('/groups');
};

const logout = async () => {
  authStore.logout();
  await router.push('/login');
};

const save = async () => {
  if (!canSave.value) return;
  isSaving.value = true;
  errorMessage.value = '';
  try {
    await authStore.updateProfileName(name.value.trim());
  } catch {
    errorMessage.value = t('account.saveError');
  } finally {
    isSaving.value = false;
  }
};

onMounted(() => {
  currentPageTitle.value = t('account.title');
});

onBeforeUnmount(() => {
  currentPageTitle.value = null;
});
</script>

<template>
  <main
    class="flex flex-1 min-h-0 flex-col sm:gap-8 gap-4 overflow-y-auto bg-[#13121B] px-5 pt-8 pb-8 mx-auto w-full max-w-5xl"
  >
    <!-- Topbar: back arrow -->
    <Teleport to="#topbar-leading">
      <button
        type="button"
        class="flex h-9 w-9 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-slate-100"
        :aria-label="t('account.backToGroups')"
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

    <!-- Profile header -->
    <div class="flex flex-col items-center gap-4">
      <div
        data-testid="account-avatar"
        class="flex sm:h-32 sm:w-32 h-28 w-28 items-center justify-center rounded-full border-2 border-[#C6BFFF]/20 bg-[#2A2932] sm:text-5xl text-4xl font-bold text-[#E4E1ED] shadow-lg"
      >
        {{ userInitial }}
      </div>

      <h2
        data-testid="account-name-heading"
        class="text-center font-bold text-[#E4E1ED] tracking-[-0.025em] sm:text-[48px] sm:leading-[56px] text-3xl"
      >
        {{ name.trim() || '—' }}
      </h2>
    </div>

    <!-- Account Details -->
    <section data-testid="account-details" class="flex flex-col">
      <p
        class="mb-6 text-xs font-medium uppercase tracking-[0.05em] text-[#C6BFFF]"
      >
        {{ t('account.accountDetails') }}
      </p>

      <div class="flex flex-col gap-5">
        <div class="flex flex-col">
          <label
            for="account-name"
            class="mb-2 block text-xs uppercase tracking-[0.05em] text-[#C8C4D7]"
            >{{ t('account.fullName') }}</label
          >
          <input
            id="account-name"
            v-model="name"
            type="text"
            maxlength="100"
            :placeholder="t('account.fullNamePlaceholder')"
            class="w-full rounded-md border border-[#474554]/30 bg-[rgba(42,41,50,0.5)] px-4 py-3 text-[#E4E1ED] placeholder:text-[#C8C4D7]/50 focus:border-[#6554E7] focus:outline-none"
          />
        </div>

        <div class="flex flex-col">
          <label
            for="account-email"
            class="mb-2 block text-xs uppercase tracking-[0.05em] text-[#C8C4D7]"
            >{{ t('account.emailAddress') }}</label
          >
          <input
            id="account-email"
            :value="email"
            disabled
            class="w-full cursor-not-allowed rounded-md border border-[#474554]/30 bg-[rgba(42,41,50,0.5)] px-4 py-3 text-[#E4E1ED] opacity-60"
          />
        </div>

        <div class="flex flex-col">
          <label
            for="account-language"
            class="mb-2 block text-xs uppercase tracking-[0.05em] text-[#C8C4D7]"
            >{{ t('common.language') }}</label
          >
          <select
            id="account-language"
            v-model="selectedLanguage"
            data-testid="account-language"
            :disabled="isSavingLanguage"
            class="w-full rounded-md border border-[#474554]/30 bg-[rgba(42,41,50,0.5)] px-4 py-3 text-[#E4E1ED] focus:border-[#6554E7] focus:outline-none"
            @change="onLanguageChange"
          >
            <option value="en">English</option>
            <option value="it">Italiano</option>
          </select>
        </div>
      </div>

      <p
        v-if="errorMessage"
        data-testid="account-error"
        class="mt-4 text-sm text-[#FFB4AB]"
      >
        {{ errorMessage }}
      </p>

      <button
        type="button"
        data-testid="account-save"
        :disabled="!canSave"
        class="mt-6 w-full rounded-lg bg-[#6654E7] px-4 py-3 font-medium text-[#F0EBFF] shadow-inner transition enabled:hover:bg-[#5a47d4] disabled:cursor-not-allowed disabled:opacity-50"
        @click="save"
      >
        {{ isSaving ? t('common.saving') : t('account.saveChanges') }}
      </button>
    </section>

    <!-- Sign Out -->
    <button
      type="button"
      :aria-label="t('account.signOutAria')"
      class="mx-auto sm:mt-8 mt-4 flex items-center gap-2 rounded-full border border-transparent px-8 py-4 font-medium text-[rgba(255,180,171,0.8)] transition hover:bg-[#FFB4AB]/10"
      @click="logout"
    >
      <svg
        viewBox="0 0 24 24"
        class="h-5 w-5"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      {{ t('account.signOut') }}
    </button>
  </main>
</template>
