import type { MessageSchema } from './en';

/**
 * Italian message catalog.
 *
 * `satisfies MessageSchema` proves the deep key tree is identical to `en`
 * (missing/extra keys are a compile error) while preserving the literal string
 * types so call-sites keep autocomplete.
 *
 * Strings asserted by e2e (Appendix A binding subset) are kept exactly as
 * specified:
 *   - common.signOut       -> "Esci"
 *   - common.saving        -> "Salvataggio…"
 *   - common.language      -> "Lingua"
 *   - account.accountDetails -> "Dettagli account"
 *   - account.fullName       -> "Nome completo"
 *   - account.emailAddress   -> "Indirizzo email"
 *   - account.saveChanges    -> "Salva modifiche"
 *   - account.saveError      -> "Impossibile salvare le modifiche. Riprova."
 *   - groups.balanceOwed   -> "Ti devono {amount}"
 *   - groups.balanceOwe    -> "Devi {amount}"
 *   - groups.balanceSettled -> "Pari"
 *
 * Other keys are best-effort first-pass Italian (Task 4 will audit tone).
 */
export const it = {
  common: {
    save: 'Salva',
    saving: 'Salvataggio…',
    cancel: 'Annulla',
    apply: 'Applica',
    back: 'Indietro',
    signOut: 'Esci',
    language: 'Lingua',
    delete: 'Elimina',
    deleting: 'Eliminazione…',
    settings: 'Impostazioni',
    loading: 'Caricamento…',
    close: 'Chiudi',
    saveChanges: 'Salva modifiche',
    balanceOwed: 'Ti devono {amount}',
    balanceOwe: 'Devi {amount}',
    balanceSettled: 'Pari',
  },

  app: {
    fallbackTitle: 'App',
    openAccountPageAria: 'Apri la pagina account',
  },

  auth: {
    signingIn: 'Accesso in corso…',
    redirectingToLogin: 'Reindirizzamento al login…',
    missingToken: 'Token di autenticazione mancante.',
  },

  login: {
    welcome: 'Bentornato',
    subtitle: 'Gestisci le tue spese condivise',
    email: 'Email',
    password: 'Password',
    showPassword: 'Mostra password',
    hidePassword: 'Nascondi password',
    logIn: 'Accedi',
    loggingIn: 'Accesso in corso...',
    loginFailed: 'Impossibile accedere con queste credenziali.',
    signInUnavailable:
      'Accesso non disponibile — contatta un amministratore.',
  },

  groups: {
    title: 'Do Schèi',
    loading: 'Caricamento dei gruppi...',
    loadFailed: 'Impossibile caricare i gruppi.',
    invitations: 'Inviti',
    invitedBy: 'Invitato da {name}',
    accept: 'Accetta',
    decline: 'Rifiuta',
    acceptError: "Impossibile accettare l'invito. Riprova.",
    declineError: 'Impossibile rifiutare l\'invito. Riprova.',
    noGroups: 'Nessun gruppo.',
    createGroup: '+ Crea gruppo',
    createGroupLabel: 'Nome del gruppo',
    createGroupPlaceholder: 'Nome del gruppo',
    create: 'Crea',
    creating: 'Creazione...',
    enterGroupName: 'Inserisci un nome per il gruppo.',
    createFailed: 'Impossibile creare il gruppo.',
    thumbnailAria: 'Immagine di {name}',
    groupImageAria: 'Immagine di {name}',
  },

  groupDetail: {
    settingsTitleSuffix: 'Impostazioni di {name}',
    loading: 'Caricamento del gruppo...',
    loadFailed: 'Impossibile caricare questo gruppo.',
    backToGroups: 'Torna ai gruppi',
    toggleSettings: 'Apri le impostazioni',
    settings: 'Impostazioni',
    yourBalance: 'Il tuo saldo',
    seeBreakdown: 'Mostra dettaglio',
    hideBreakdown: 'Nascondi dettaglio',
    entryOwesYou: '{name} ti deve',
    entryYouOwe: 'Devi a {name}',
    settleUp: 'Salda',
    settleUpDisabledInviteTitle: 'Invita prima qualcuno in questo gruppo',
    settleUpDisabledRecordTitle: 'Registra un pagamento tra i membri',
    export: 'Esporta',
    addExpense: '+ Aggiungi spesa',
    noExpenses: 'Nessuna spesa',
    expensePaidBy: 'Pagato da {name}',
    settlementPaidPayee: '{payer} ha pagato {payee}',
    expenseYouOwe: 'Devi {amount}',
    expenseYouLent: 'Hai prestato {amount}',
    settlementTitle: 'Saldo',
    exportModalTitle: 'Esporta spese',
    selectPeriod: 'Seleziona il periodo',
    monthLabel: 'Mese',
    yearLabel: 'Anno',
    exportExpenses: 'Esporta spese',
    exporting: 'Esportazione...',
    exportFailed: 'Esportazione non riuscita.',
    exportFailedTryAgain: "Esportazione non riuscita. Riprova.",
  },

  groupSettings: {
    backToGroup: 'Torna al gruppo',
    loading: 'Caricamento delle impostazioni...',
    groupNameLabel: 'NOME DEL GRUPPO',
    addMembersLabel: 'AGGIUNGI MEMBRI',
    emailPlaceholder: "utente{'@'}esempio.com",
    add: 'AGGIUNGI',
    membersLabel: 'MEMBRI ({count})',
    youLabel: 'Tu',
    pendingInvitationsLabel: 'INVITI IN SOSPESO',
    save: 'Salva',
    groupNameEmpty: 'Il nome del gruppo non può essere vuoto.',
    updateNameError: 'Impossibile aggiornare il nome del gruppo.',
    addMemberEmailEmpty: 'Inserisci un indirizzo email.',
    addMemberError: 'Impossibile aggiungere il membro.',
    removeMemberError: 'Impossibile rimuovere {name}.',
    cancelInvitationError: "Impossibile annullare l'invito per {email}.",
    removeMemberAria: 'Rimuovi membro',
    cancelInvitationAria: "Annulla l'invito",
  },

  expenseForm: {
    addTitle: 'Aggiungi spesa',
    editTitle: 'Modifica spesa',
    amountLabel: 'Importo',
    amountPlaceholder: '0,00',
    descriptionPlaceholder: 'Descrizione',
    paidBy: 'Pagato da',
    splitWith: 'Dividi con',
    splitModeEqual: 'Equamente',
    splitModePercent: 'Percentuale',
    splitModeFixed: 'Importo fisso',
    eachPays: 'Ognuno paga {amount}',
    totalPercent: 'Totale: {total}%',
    totalEur: 'Totale: {total}',
    areYouSure: 'Sei sicuro?',
    deleteExpenseWarning:
      'Vuoi davvero eliminare questa spesa? Questa azione non può essere annullata.',
    confirmDelete: 'Conferma eliminazione',
    cancel: 'Annulla',
    saving: 'Salvataggio...',
    save: 'Salva',
    delete: 'Elimina',
    loading: 'Caricamento...',
    groupNotFound: 'Gruppo non trovato.',
    expenseNotFound: 'Spesa non trovata.',
    backToGroup: 'Torna al gruppo',
    validationDescriptionAmount:
      'Inserisci una descrizione valida e un importo maggiore di 0.',
    validationDescriptionDateAmount:
      'Inserisci una descrizione valida, una data e un importo maggiore di 0.',
    validationSelectPayer: "Seleziona chi ha pagato la spesa.",
    validationFixSplit: 'Correggi i valori della divisione.',
    addError: 'Impossibile aggiungere la spesa. Riprova.',
    updateError: 'Impossibile aggiornare la spesa. Riprova.',
    deleteError: 'Impossibile eliminare la spesa. Riprova.',
    splitNoMembersSelected: 'Seleziona almeno una persona con cui dividere.',
    splitPercentagesMustSum:
      'Le percentuali devono sommarsi a 100 (attuale: {current}).',
    splitFixedMustSum:
      'Gli importi fissi devono sommarsi a €{total} (attuale: €{current}).',
  },

  settleUp: {
    addTitle: 'Salda',
    editTitle: 'Modifica pagamento',
    loading: 'Caricamento...',
    groupNotFound: 'Gruppo non trovato.',
    settlementNotFound: 'Pagamento non trovato.',
    backToGroup: 'Torna al gruppo',
    recordPaymentHeading: 'Registra un pagamento',
    amountPlaceholder: '0,00',
    whoPaid: 'Chi ha pagato',
    toWhom: 'A chi',
    balanceImpact:
      'Questo pagamento salderà il tuo saldo di {amount}.',
    payerPayeeDifferent:
      'Il pagatore e il beneficiario devono essere persone diverse.',
    amountGreaterThanZero: 'Inserisci un importo maggiore di 0.',
    saveError: 'Impossibile salvare il pagamento. Riprova.',
    deleteError: 'Impossibile eliminare il pagamento. Riprova.',
    deletePaymentHeading: 'Eliminare il pagamento?',
    deletePaymentWarning: 'Questa azione non può essere annullata.',
    cancel: 'Annulla',
    deleting: 'Eliminazione...',
    delete: 'Elimina',
    saving: 'Salvataggio...',
    recordPaymentButton: '+ Registra pagamento',
    deleteThisPayment: 'Elimina questo pagamento',
  },

  account: {
    title: 'Account',
    accountDetails: 'Dettagli account',
    fullName: 'Nome completo',
    fullNamePlaceholder: 'Nome completo',
    emailAddress: 'Indirizzo email',
    saveChanges: 'Salva modifiche',
    saveError: 'Impossibile salvare le modifiche. Riprova.',
    signOut: 'Esci',
    signOutAria: 'Esci',
    backToGroups: 'Torna ai gruppi',
  },

  categoryPicker: {
    searchPlaceholder: 'Cerca categorie',
    searchAriaLabel: 'Cerca categorie',
    dialogAriaLabel: 'Seleziona categoria',
    selectCategoryHeading: 'Seleziona categoria',
    close: 'Chiudi',
    noMatchingCategory: 'Nessuna categoria corrispondente',
    categoryLabelAria: 'Categoria: {label}',
  },

  dateTimePicker: {
    dateLabel: 'Data',
    selectDateAria: 'Seleziona data',
    selectDateHeading: 'SELEZIONA DATA',
    apply: 'Applica',
    cancel: 'Annulla',
  },

  userPicker: {
    dialogAriaLabel: 'Seleziona chi ha pagato',
    triggerAriaLabel: 'Seleziona chi ha pagato',
    close: 'Chiudi',
    selectPlaceholder: 'Seleziona...',
    selectPayerHeading: 'Seleziona pagatore',
  },
} satisfies MessageSchema;
