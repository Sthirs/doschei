/**
 * English message catalog (skeleton).
 *
 * This file is the type-of-truth for the entire i18n tree: every locale MUST
 * `satisfies MessageSchema` against `typeof en`. Keys are intentionally kept
 * flat at the leaf — nested namespaces exist to mirror the source-of-feature
 * boundary (D5: extract per-area so review diffs stay localised).
 *
 * The full catalog is built out in Task 2 (string extraction). For Task 1 only
 * `common` and `account` namespaces are present so the foundation compiles and
 * `setAppLocale` has values to render.
 */
export const en = {
  common: {
    save: 'Save',
    saving: 'Saving…',
    cancel: 'Cancel',
    apply: 'Apply',
    back: 'Back',
    signOut: 'Sign Out',
    language: 'Language',
  },
  account: {
    accountDetails: 'Account Details',
    fullName: 'Full name',
    emailAddress: 'Email address',
    saveChanges: 'Save Changes',
    saveError: 'Could not save your changes. Please try again.',
  },
} as const;

/**
 * Widens every leaf of `en` to `string` so that `it satisfies MessageSchema`
 * enforces SHAPE (key presence + depth) without demanding literal-equality of
 * the English text. Auto-translation is the whole point of having two locales.
 */
type WidenLeaves<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? readonly WidenLeaves<U>[]
    : T extends object
      ? { readonly [K in keyof T]: WidenLeaves<T[K]> }
      : T;

export type MessageSchema = WidenLeaves<typeof en>;
