import { computed, ref, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { CATEGORIES, DEFAULT_CATEGORY_KEY } from '@/lib/categories';
import { suggestCategory } from '@/lib/categorySuggest';
import type { Expense } from '@/types/group';

// Debounce window for description-driven category auto-selection: the user has
// to pause typing for this long before we ask the suggestion engine to pick a
// category. Keep it short enough to feel instant, long enough to coalesce
// multi-keystroke inputs into a single lookup.
const DESCRIPTION_SUGGEST_DEBOUNCE_MS = 300;

export type UseExpenseCategorySuggestReturn = {
  onCategoryPicked: () => void;
  scheduleSuggestion: () => void;
  cancelSuggestion: () => void;
  resetSuggestion: () => void;
};

/**
 * Drives the ADR-0017 client-side category suggestion engine for the expense
 * form: debounces description input, then calls `suggestCategory` and silently
 * writes the result into `category` — but only into the still-default slot,
 * never over a deliberate user choice.
 */
export const useExpenseCategorySuggest = (
  description: Ref<string>,
  category: Ref<string>,
  expenses: () => Expense[],
): UseExpenseCategorySuggestReturn => {
  const { t } = useI18n();

  // Stage-3 label map for the suggestion engine, kept reactive to the active
  // locale so Italian descriptions match Italian category names.
  const categoryLabels = computed<Record<string, string>>(() =>
    Object.fromEntries(
      CATEGORIES.map((c) => [c.key, t(`categories.items.${c.key}`)]),
    ),
  );

  // Flips to true the moment the user manually picks a category from the picker,
  // and resets to false on every (re-)initialisation. Together with the
  // `category.value !== DEFAULT_CATEGORY_KEY` guard inside `applySuggestion`,
  // this is what guarantees the suggestion engine can never overwrite a
  // deliberate user choice, and can only fill in the still-default slot.
  const categoryTouched = ref(false);

  // Pending debounced suggestion lookup. Held in the composable's closure so it
  // survives across renders; cleared on unmount and on every re-initialise to
  // prevent a stale callback from mutating state.
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
      expenses(),
      categoryLabels.value,
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

  const cancelSuggestion = () => {
    if (suggestTimer !== undefined) {
      clearTimeout(suggestTimer);
      suggestTimer = undefined;
    }
  };

  const resetSuggestion = () => {
    categoryTouched.value = false;
    cancelSuggestion();
  };

  return {
    onCategoryPicked,
    scheduleSuggestion,
    cancelSuggestion,
    resetSuggestion,
  };
};
