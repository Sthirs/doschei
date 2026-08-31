import { computed, ref, type ComputedRef, type Ref } from 'vue';

import { normalizeLocale, type Locale } from '@/i18n';
import { useAuthStore } from '@/stores/auth';

/** Caller-supplied strings; this module never imports i18n. */
export type AccountProfileMessages = {
  saveError: () => string;
};

export type UseAccountProfileReturn = {
  name: Ref<string>;
  email: string;
  selectedLanguage: Ref<Locale>;
  userInitial: ComputedRef<string>;
  canSave: ComputedRef<boolean>;
  isSaving: Ref<boolean>;
  errorMessage: Ref<string>;
  save: () => Promise<void>;
};

/**
 * Editable profile state for the account screen: display name and language are
 * staged locally and only sent — together, in one PATCH — when the user saves.
 */
export const useAccountProfile = (
  messages: AccountProfileMessages,
): UseAccountProfileReturn => {
  const authStore = useAuthStore();

  const name = ref(authStore.user?.displayName ?? '');
  const email = authStore.user?.email ?? '';
  const isSaving = ref(false);
  const errorMessage = ref('');

  // The select shows endonyms (English / Italiano) which are intentionally
  // NOT translated — a user must be able to read them before switching.
  // The choice only persists when the user presses Save Changes.
  const selectedLanguage = ref<Locale>(
    normalizeLocale(authStore.user?.language),
  );
  const savedLanguage = computed(() =>
    normalizeLocale(authStore.user?.language),
  );

  const userInitial = computed(
    () => name.value.trim().charAt(0).toUpperCase() || 'U',
  );
  const isNameDirty = computed(
    () =>
      name.value.trim() !== (authStore.user?.displayName ?? '') &&
      name.value.trim().length > 0,
  );
  const isLanguageDirty = computed(
    () => selectedLanguage.value !== savedLanguage.value,
  );
  const isDirty = computed(() => isNameDirty.value || isLanguageDirty.value);
  const canSave = computed(() => isDirty.value && !isSaving.value);

  const save = async (): Promise<void> => {
    if (!canSave.value) return;
    isSaving.value = true;
    errorMessage.value = '';
    const changes: { displayName?: string; language?: Locale } = {};
    if (isNameDirty.value) changes.displayName = name.value.trim();
    if (isLanguageDirty.value) changes.language = selectedLanguage.value;
    try {
      await authStore.updateProfile(changes);
    } catch {
      errorMessage.value = messages.saveError();
    } finally {
      isSaving.value = false;
    }
  };

  return {
    name,
    email,
    selectedLanguage,
    userInitial,
    canSave,
    isSaving,
    errorMessage,
    save,
  };
};
