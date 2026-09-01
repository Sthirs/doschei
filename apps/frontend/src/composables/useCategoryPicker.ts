import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  type ComputedRef,
  type Ref,
} from 'vue';

import { CATEGORIES_GROUPED, type CategoryFamily } from '@/lib/categories';

/**
 * Label resolvers supplied by the caller — the composable filters on the
 * user-visible labels, so it needs them, but it never imports i18n itself.
 */
export type CategoryPickerLabels = {
  family: (family: CategoryFamily) => string;
  item: (key: string) => string;
};

export type UseCategoryPickerReturn = {
  isOpen: Ref<boolean>;
  triggerRef: Ref<HTMLButtonElement | null>;
  panelRef: Ref<HTMLDivElement | null>;
  desktopSearchInputRef: Ref<HTMLInputElement | null>;
  mobileSearchInputRef: Ref<HTMLInputElement | null>;
  searchQuery: Ref<string>;
  filteredGroups: ComputedRef<typeof CATEGORIES_GROUPED>;
  open: () => void;
  close: () => void;
  select: (key: string) => void;
  onKeydown: (event: KeyboardEvent) => void;
  onBackdropClick: (event: MouseEvent) => void;
};

/**
 * Panel behaviour for the category picker: open/close plumbing, the search
 * filter, and the keyboard/outside-click dismissal shared by the desktop
 * popover and the mobile sheet. `onSelect` is the component's
 * `update:modelValue` emit — the v-model contract stays in the component.
 */
export const useCategoryPicker = (
  labels: CategoryPickerLabels,
  onSelect: (key: string) => void,
): UseCategoryPickerReturn => {
  const isOpen = ref(false);
  const triggerRef = ref<HTMLButtonElement | null>(null);
  const panelRef = ref<HTMLDivElement | null>(null);
  const desktopSearchInputRef = ref<HTMLInputElement | null>(null);
  const mobileSearchInputRef = ref<HTMLInputElement | null>(null);
  const searchQuery = ref('');

  const filteredGroups = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    if (!q) return CATEGORIES_GROUPED;
    return CATEGORIES_GROUPED.map((group) => {
      const famLabel = labels.family(group.family).toLowerCase();
      const familyMatches = famLabel.includes(q);
      const entries = familyMatches
        ? [...group.entries]
        : group.entries.filter((e) =>
            labels.item(e.key).toLowerCase().includes(q),
          );
      return { ...group, entries };
    }).filter((group) => group.entries.length > 0);
  });

  const open = (): void => {
    searchQuery.value = '';
    isOpen.value = true;
    nextTick(() => {
      desktopSearchInputRef.value?.focus();
      mobileSearchInputRef.value?.focus();
    });
  };

  const close = (): void => {
    isOpen.value = false;
    triggerRef.value?.focus();
  };

  const select = (key: string): void => {
    onSelect(key);
    close();
  };

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (searchQuery.value) {
        searchQuery.value = '';
        return;
      }
      close();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const q = searchQuery.value.trim();
      if (!q) return;
      const firstGroup = filteredGroups.value[0];
      if (firstGroup && firstGroup.entries.length > 0) {
        select(firstGroup.entries[0].key);
      }
    }
  };

  const onBackdropClick = (event: MouseEvent): void => {
    if (event.target === event.currentTarget) {
      close();
    }
  };

  const onDocumentClick = (event: MouseEvent): void => {
    if (
      isOpen.value &&
      triggerRef.value &&
      panelRef.value &&
      !triggerRef.value.contains(event.target as Node) &&
      !panelRef.value.contains(event.target as Node)
    ) {
      close();
    }
  };

  onMounted(() => {
    document.addEventListener('click', onDocumentClick, true);
  });

  onBeforeUnmount(() => {
    document.removeEventListener('click', onDocumentClick, true);
  });

  return {
    isOpen,
    triggerRef,
    panelRef,
    desktopSearchInputRef,
    mobileSearchInputRef,
    searchQuery,
    filteredGroups,
    open,
    close,
    select,
    onKeydown,
    onBackdropClick,
  };
};
