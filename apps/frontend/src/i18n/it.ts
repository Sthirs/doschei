import type { MessageSchema } from './en';

/**
 * Italian message catalog (skeleton, Task 1).
 *
 * `satisfies MessageSchema` (a) proves the deep key tree is identical to `en`
 * so missing/extra keys are a compile error, and (b) preserves the literal
 * string types so call-sites keep autocomplete. The full catalog is filled in
 * by Task 4 from Appendix A of `.omo/plans/i18n-en-it.md`.
 *
 * Strings asserted by e2e (Appendix A binding subset):
 *  - common.signOut  -> "Esci"
 *  - account.accountDetails -> "Dettagli account"
 *  - account.fullName       -> "Nome completo"
 *  - account.emailAddress   -> "Indirizzo email"
 *  - account.saveChanges    -> "Salva modifiche"
 *  - account.saveError      -> "Impossibile salvare le modifiche. Riprova."
 *  - common.saving          -> "Salvataggio…"
 *  - common.language        -> "Lingua"
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
  },
  account: {
    accountDetails: 'Dettagli account',
    fullName: 'Nome completo',
    emailAddress: 'Indirizzo email',
    saveChanges: 'Salva modifiche',
    saveError:
      'Impossibile salvare le modifiche. Riprova.',
  },
} satisfies MessageSchema;
