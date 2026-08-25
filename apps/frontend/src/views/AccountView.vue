<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

import { normalizeLocale, type Locale } from '@/i18n';
import { currentPageTitle } from '@/router';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const authStore = useAuthStore();
const { t } = useI18n();

const name = ref(authStore.user?.displayName ?? '');
const email = authStore.user?.email ?? '';
const isSaving = ref(false);
const errorMessage = ref('');

// Avatar upload state
const isUploading = ref(false);
const uploadError = ref('');

// The select shows endonyms (English / Italiano) which are intentionally
// NOT translated — a user must be able to read them before switching.
// The choice only persists when the user presses Save Changes.
const selectedLanguage = ref<Locale>(normalizeLocale(authStore.user?.language));
const savedLanguage = computed(() => normalizeLocale(authStore.user?.language));

const userInitial = computed(
  () => name.value.trim().charAt(0).toUpperCase() || 'U',
);
const isNameDirty = computed(
  () =>
    name.value.trim() !== (authStore.user?.displayName ?? '') &&
    name.value.trim().length > 0,
);
const isLanguageDirty = computed(() => selectedLanguage.value !== savedLanguage.value);
const isDirty = computed(() => isNameDirty.value || isLanguageDirty.value);
const canSave = computed(() => isDirty.value && !isSaving.value);

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
  const changes: { displayName?: string; language?: Locale } = {};
  if (isNameDirty.value) changes.displayName = name.value.trim();
  if (isLanguageDirty.value) changes.language = selectedLanguage.value;
  try {
    await authStore.updateProfile(changes);
  } catch {
    errorMessage.value = t('account.saveError');
  } finally {
    isSaving.value = false;
  }
};

const validateImageFile = (file: File): string | null => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const maxSize = 5 * 1024 * 1024; // 5 MB

  if (!allowedTypes.includes(file.type)) {
    return t('account.changePhotoErrorInvalid');
  }
  if (file.size > maxSize) {
    return t('account.changePhotoErrorTooLarge');
  }
  return null;
};

const handleFileChange = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  // Reset error and input value
  uploadError.value = '';
  input.value = '';

  const validationError = validateImageFile(file);
  if (validationError) {
    uploadError.value = validationError;
    return;
  }

  isUploading.value = true;
  try {
    await authStore.uploadImage(file);
  } catch {
    uploadError.value = t('account.changePhotoErrorGeneric');
  } finally {
    isUploading.value = false;
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
      <div class="relative" data-testid="account-avatar-wrapper">
        <div
          data-testid="account-avatar"
          class="h-[112px] w-[112px] rounded-full overflow-hidden border-2 border-[#C6BFFF]/20 bg-[#2A2932] shadow-lg"
        >
          <img
            v-if="authStore.user?.imageUrl"
            :src="authStore.user.imageUrl"
            alt=""
            aria-hidden="true"
            class="h-full w-full object-cover"
          />
          <div
            v-else
            class="flex h-full w-full items-center justify-center text-6xl font-bold text-[#E4E1ED]"
          >
            {{ userInitial }}
          </div>
        </div>

        <!-- Edit badge -->
        <label
          for="avatar-upload"
          data-testid="account-avatar-edit"
          class="absolute bottom-0 right-0 flex h-10 w-10 items-center justify-center rounded-full bg-[#6654E7] text-[#F0EBFF] shadow-lg transition hover:bg-[#5a47d4] cursor-pointer"
          :aria-label="t('account.changePhoto')"
        >
          <img src="/icons/edit.svg" alt="" aria-hidden="true" class="h-5 w-5" />
        </label>

        <!-- Hidden file input -->
        <input
          id="avatar-upload"
          data-testid="account-avatar-input"
          type="file"
          accept="image/*"
          class="absolute inset-0 opacity-0 pointer-events-none"
          aria-hidden="true"
          :disabled="isUploading"
          @change="handleFileChange"
        />
      </div>

      <h2
        data-testid="account-name-heading"
        class="text-center font-bold text-[#E4E1ED] tracking-[-0.025em] sm:text-[48px] sm:leading-[56px] text-3xl"
      >
        {{ name.trim() || '—' }}
      </h2>

      <!-- Upload error -->
      <p v-if="uploadError" data-testid="account-upload-error" class="text-sm text-[#FFB4AB] text-center">
        {{ uploadError }}
      </p>

      <!-- Uploading indicator -->
      <p v-if="isUploading" data-testid="account-uploading" class="text-sm text-[#C6BFFF] text-center">
        {{ t('account.photoUploading') }}
      </p>
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
          <div class="relative">
            <select
              id="account-language"
              v-model="selectedLanguage"
              data-testid="account-language"
              class="w-full appearance-none rounded-md border border-[#474554]/30 bg-[rgba(42,41,50,0.5)] py-3 pl-4 pr-10 text-[#E4E1ED] focus:border-[#6554E7] focus:outline-none"
            >
              <option value="en">English</option>
              <option value="it">Italiano</option>
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
