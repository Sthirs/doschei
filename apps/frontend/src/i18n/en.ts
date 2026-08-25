/**
 * English message catalog.
 *
 * Source of truth for the entire i18n tree: every other locale MUST
 * `satisfies MessageSchema` against `typeof en`. Keys are kept flat at the
 * leaf and namespaced by feature area so review diffs stay localised.
 *
 * String extraction is the work of Task 2 (D5): every user-visible string
 * from the frontend .vue components, format.ts, and the `useExpenseSplit`
 * composable is listed here. Category item/family labels live under
 * `categories.*` but are populated in Task 3.
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
    delete: 'Delete',
    deleting: 'Deleting…',
    settings: 'Settings',
    loading: 'Loading…',
    close: 'Close',
    saveChanges: 'Save Changes',
    // Shared by GroupsView rows and GroupDetailView header; {amount} is pre-formatted via formatEur().
    balanceOwed: 'You are owed {amount}',
    balanceOwe: 'You owe {amount}',
    balanceSettled: 'Settled',
  },

  app: {
    // Fallback title used by AppTopbar when no route meta or page title is set.
    fallbackTitle: 'App',
    // aria-label for the avatar button in the topbar that opens the account page.
    openAccountPageAria: 'Open account page',
  },

  auth: {
    // OAuth callback screen.
    signingIn: 'Signing you in…',
    redirectingToLogin: 'Redirecting to login…',
    missingToken: 'Missing authentication token.',
  },

  login: {
    welcome: 'Bentornato',
    subtitle: 'Manage your shared expenses',
    email: 'Email',
    password: 'Password',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    logIn: 'Log In',
    loggingIn: 'Logging in...',
    loginFailed: 'We could not log you in with those credentials.',
    signInUnavailable: 'Sign-in is not available — contact an administrator.',
  },

  groups: {
    // Topbar title for the Groups list screen.
    title: 'Do Schèi',
    loading: 'Loading your groups...',
    loadFailed: 'We could not load your groups.',
    invitations: 'Invitations',
    // Invitation card meta line, e.g. "Invited by Bob".
    invitedBy: 'Invited by {name}',
    accept: 'Accept',
    decline: 'Decline',
    acceptError: 'Could not accept the invitation. Please try again.',
    declineError: 'Could not decline the invitation. Please try again.',
    noGroups: 'No groups yet.',
    createGroup: '+ Create group',
    createGroupLabel: 'Group name',
    createGroupPlaceholder: 'Group name',
    create: 'Create',
    creating: 'Creating...',
    enterGroupName: 'Enter a group name.',
    createFailed: 'We could not create your group.',
    // aria-labels (chrome): rendered when no group image is set, the prefix
    // wraps the dynamic group name. Keeping the prefix as a key makes the
    // group name still flow in via {name}.
    thumbnailAria: '{name} thumbnail',
    groupImageAria: '{name} image',
  },

  groupDetail: {
    // Page title — composed with the group name, e.g. "Venice Trip Settings".
    settingsTitleSuffix: '{name} Settings',
    loading: 'Loading group...',
    loadFailed: 'We could not load this group.',
    backToGroups: 'Back to groups',
    toggleSettings: 'Toggle settings',
    settings: 'Settings',
    yourBalance: 'Your Balance',
    seeBreakdown: 'See breakdown',
    hideBreakdown: 'Hide breakdown',
    // Per-user breakdown list. {name} is the other member.
    entryOwesYou: '{name} owes you',
    entryYouOwe: 'You owe {name}',
    settleUp: 'Settle Up',
    settleUpDisabledInviteTitle: 'Invite someone to this group first',
    settleUpDisabledRecordTitle: 'Record a payment between members',
    export: 'Export',
    addExpense: '+ Add expense',
    noExpenses: 'No expenses yet',
    // Expense list rows.
    expensePaidBy: 'Paid by {name}',
    settlementPaidPayee: '{payer} paid {payee}',
    expenseYouOwe: 'You owe {amount}',
    expenseYouLent: 'You lent {amount}',
    settlementTitle: 'Settlement',
    // Export modal.
    exportModalTitle: 'Export expenses',
    selectPeriod: 'Select Period',
    monthLabel: 'Month',
    yearLabel: 'Year',
    exportExpenses: 'Export Expenses',
    exporting: 'Exporting...',
    exportFailed: 'Export failed.',
    exportFailedTryAgain: 'Export failed. Please try again.',
  },

  groupSettings: {
    backToGroup: 'Back to group',
    loading: 'Loading settings...',
    groupNameLabel: 'GROUP NAME',
    addMembersLabel: 'ADD MEMBERS',
    emailPlaceholder: "user{'@'}example.com",
    add: 'ADD',
    membersLabel: 'MEMBERS ({count})',
    youLabel: 'You',
    pendingInvitationsLabel: 'PENDING INVITATIONS',
    save: 'Save',
    groupNameEmpty: 'Group name cannot be empty.',
    updateNameError: 'Could not update the group name.',
    addMemberEmailEmpty: 'Please enter an email address.',
    addMemberError: 'Could not add member.',
    removeMemberError: 'Could not remove {name}.',
    cancelInvitationError: 'Could not cancel invitation for {email}.',
    removeMemberAria: 'Remove member',
    cancelInvitationAria: 'Cancel invitation',
    changeImage: 'Change image',
    changeImageErrorInvalid: 'Please select a valid image file (JPEG, PNG, or WebP).',
    changeImageErrorTooLarge: 'Image must be 5 MB or smaller.',
    changeImageErrorGeneric: 'Could not upload the image. Please try again.',
    imageUploading: 'Uploading image…',
  },

  expenseForm: {
    // Topbar title for Add / Edit expense forms.
    addTitle: 'Add Expense',
    editTitle: 'Edit Expense',
    amountLabel: 'Amount',
    amountPlaceholder: '0.00',
    descriptionPlaceholder: 'Description',
    paidBy: 'Paid by',
    splitWith: 'Split with',
    splitModeEqual: 'Equally',
    splitModePercent: 'Percentage',
    splitModeFixed: 'Fixed',
    eachPays: 'Each pays {amount}',
    totalPercent: 'Total: {total}%',
    totalEur: 'Total: {total}',
    areYouSure: 'Are you sure?',
    deleteExpenseWarning: 'Do you really want to delete this expense? This action cannot be undone.',
    confirmDelete: 'Confirm Delete',
    cancel: 'Cancel',
    saving: 'Saving...',
    save: 'Save',
    delete: 'Delete',
    loading: 'Loading...',
    groupNotFound: 'Group not found.',
    expenseNotFound: 'Expense not found.',
    backToGroup: 'Back to group',
    // Validation messages.
    validationDescriptionAmount: 'Please provide a valid description and an amount greater than 0.',
    validationDescriptionDateAmount: 'Please provide a valid description, date, and an amount greater than 0.',
    validationSelectPayer: 'Please select who paid the expense.',
    validationFixSplit: 'Please fix the split values.',
    // Submit / delete errors.
    addError: 'Could not add the expense. Please try again.',
    updateError: 'Could not update the expense. Please try again.',
    deleteError: 'Could not delete the expense. Please try again.',
    // Split composable error messages (formerly in useExpenseSplit.ts).
    splitNoMembersSelected: 'Select at least one person to split with.',
    splitPercentagesMustSum: 'Percentages must sum to 100 (current: {current}).',
    splitFixedMustSum: 'Fixed amounts must sum to €{total} (current: €{current}).',
  },

  settleUp: {
    // Topbar title for Record-a-Payment / Edit-payment forms.
    addTitle: 'Settle Up',
    editTitle: 'Edit Payment',
    loading: 'Loading...',
    groupNotFound: 'Group not found.',
    settlementNotFound: 'Settlement not found.',
    backToGroup: 'Back to group',
    recordPaymentHeading: 'Record a Payment',
    amountPlaceholder: '0.00',
    whoPaid: 'Who paid',
    toWhom: 'To whom',
    // Sentence composed with the absolute balance amount.
    balanceImpact: 'This payment will settle your balance of {amount}.',
    payerPayeeDifferent: 'The payer and the payee must be different people.',
    amountGreaterThanZero: 'Please enter an amount greater than 0.',
    saveError: 'Could not save the settlement. Please try again.',
    deleteError: 'Could not delete the settlement. Please try again.',
    deletePaymentHeading: 'Delete payment?',
    deletePaymentWarning: 'This action cannot be undone.',
    cancel: 'Cancel',
    deleting: 'Deleting...',
    delete: 'Delete',
    saving: 'Saving...',
    recordPaymentButton: '+ Record Payment',
    deleteThisPayment: 'Delete this payment',
  },

  account: {
    title: 'Account',
    accountDetails: 'Account Details',
    fullName: 'Full name',
    fullNamePlaceholder: 'Full name',
    emailAddress: 'Email address',
    saveChanges: 'Save Changes',
    saveError: 'Could not save your changes. Please try again.',
    signOut: 'Sign Out',
    signOutAria: 'Sign out',
    backToGroups: 'Back to groups',
    changePhoto: 'Change photo',
    changePhotoErrorInvalid: 'Please select a valid image file (JPEG, PNG, or WebP).',
    changePhotoErrorTooLarge: 'Image must be 5 MB or smaller.',
    changePhotoErrorGeneric: 'Could not upload the photo. Please try again.',
    photoUploading: 'Uploading photo…',
  },

  categoryPicker: {
    // Chrome strings only. Category family / item labels live under
    // `categories.*` and are populated by Task 3.
    searchPlaceholder: 'Search categories',
    searchAriaLabel: 'Search categories',
    dialogAriaLabel: 'Select category',
    selectCategoryHeading: 'Select Category',
    close: 'Close',
    noMatchingCategory: 'No matching category',
    // Wraps the category name in an aria-label / title for the trigger button.
    categoryLabelAria: 'Category: {label}',
  },

  dateTimePicker: {
    dateLabel: 'Date',
    selectDateAria: 'Select date',
    selectDateHeading: 'SELECT DATE',
    apply: 'Apply',
    cancel: 'Cancel',
  },

  userPicker: {
    dialogAriaLabel: 'Select who paid',
    triggerAriaLabel: 'Select who paid',
    close: 'Close',
    selectPlaceholder: 'Select...',
    selectPayerHeading: 'Select payer',
  },

  categories: {
    families: {
      entertainment: 'Entertainment',
      'food-and-drink': 'Food & Drink',
      home: 'Home',
      life: 'Life',
      transportation: 'Transportation',
      uncategorized: 'Uncategorized',
      utilities: 'Utilities',
    },
    items: {
      games: 'Games',
      movies: 'Movies',
      music: 'Music',
      'entertainment-other': 'Other',
      sports: 'Sports',
      'dining-out': 'Dining Out',
      groceries: 'Groceries',
      liquor: 'Liquor',
      'food-other': 'Other',
      electronics: 'Electronics',
      furniture: 'Furniture',
      'household-supplies': 'Household Supplies',
      maintenance: 'Maintenance',
      mortgage: 'Mortgage',
      'home-other': 'Other',
      pets: 'Pets',
      rent: 'Rent',
      services: 'Services',
      childcare: 'Childcare',
      clothing: 'Clothing',
      education: 'Education',
      gifts: 'Gifts',
      insurance: 'Insurance',
      'medical-expenses': 'Medical Expenses',
      'life-other': 'Other',
      taxes: 'Taxes',
      bicycle: 'Bicycle',
      'bus-train': 'Bus/Train',
      car: 'Car',
      'gas-fuel': 'Gas/Fuel',
      hotel: 'Hotel',
      'transportation-other': 'Other',
      parking: 'Parking',
      plane: 'Plane',
      taxi: 'Taxi',
      general: 'General',
      cleaning: 'Cleaning',
      electricity: 'Electricity',
      'heat-gas': 'Heat/Gas',
      'utilities-other': 'Other',
      trash: 'Trash',
      'tv-phone-internet': 'TV/Phone/Internet',
      water: 'Water',
    },
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
      : never;

export type MessageSchema = WidenLeaves<typeof en>;
