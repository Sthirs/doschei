export type NotificationKind =
  | 'expense.created'
  | 'expense.updated'
  | 'expense.deleted'
  | 'settlement.created'
  | 'settlement.updated'
  | 'settlement.deleted'
  | 'invitation.created';

export type NotificationParams = {
  actorName: string;
  groupName: string;
  description?: string;
  amount?: number;
  url: string;
};

type Catalog = Record<
  NotificationKind,
  {
    title: (params: NotificationParams) => string;
    body: (params: NotificationParams, formattedAmount: string) => string;
  }
>;

/**
 * Notification copy, keyed by event kind then rendered per recipient
 * language (ADR-0025 — server-side localization, a scoped exception to
 * ADR-0018's frontend-only i18n, because the recipient's device is not
 * connected when this text is composed). English is the fallback for any
 * language not in this catalog.
 */
const CATALOG: Record<'en' | 'it', Catalog> = {
  en: {
    'expense.created': {
      title: (p) => p.groupName,
      body: (p, amount) => `${p.actorName} added "${p.description}" (${amount})`,
    },
    'expense.updated': {
      title: (p) => p.groupName,
      body: (p, amount) => `${p.actorName} edited "${p.description}" (${amount})`,
    },
    'expense.deleted': {
      title: (p) => p.groupName,
      body: (p, amount) => `${p.actorName} deleted "${p.description}" (${amount})`,
    },
    'settlement.created': {
      title: (p) => p.groupName,
      body: (p, amount) => `${p.actorName} recorded a settlement of ${amount}`,
    },
    'settlement.updated': {
      title: (p) => p.groupName,
      body: (p, amount) => `${p.actorName} edited a settlement (${amount})`,
    },
    'settlement.deleted': {
      title: (p) => p.groupName,
      body: (p, amount) => `${p.actorName} deleted a settlement (${amount})`,
    },
    'invitation.created': {
      title: () => 'Group invitation',
      body: (p) => `${p.actorName} invited you to join "${p.groupName}"`,
    },
  },
  it: {
    'expense.created': {
      title: (p) => p.groupName,
      body: (p, amount) => `${p.actorName} ha aggiunto "${p.description}" (${amount})`,
    },
    'expense.updated': {
      title: (p) => p.groupName,
      body: (p, amount) => `${p.actorName} ha modificato "${p.description}" (${amount})`,
    },
    'expense.deleted': {
      title: (p) => p.groupName,
      body: (p, amount) => `${p.actorName} ha eliminato "${p.description}" (${amount})`,
    },
    'settlement.created': {
      title: (p) => p.groupName,
      body: (p, amount) => `${p.actorName} ha registrato un saldo di ${amount}`,
    },
    'settlement.updated': {
      title: (p) => p.groupName,
      body: (p, amount) => `${p.actorName} ha modificato un saldo (${amount})`,
    },
    'settlement.deleted': {
      title: (p) => p.groupName,
      body: (p, amount) => `${p.actorName} ha eliminato un saldo (${amount})`,
    },
    'invitation.created': {
      title: () => 'Invito a un gruppo',
      body: (p) => `${p.actorName} ti ha invitato a unirti a "${p.groupName}"`,
    },
  },
};

const formatAmount = (amount: number | undefined, locale: 'en' | 'it'): string => {
  if (amount === undefined) return '';
  return new Intl.NumberFormat(locale === 'it' ? 'it-IT' : 'en-US', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
};

export const renderNotification = (
  kind: NotificationKind,
  language: string,
  params: NotificationParams,
): { title: string; body: string } => {
  const locale = language === 'it' ? 'it' : 'en';
  const entry = CATALOG[locale][kind];
  const formattedAmount = formatAmount(params.amount, locale);
  return {
    title: entry.title(params),
    body: entry.body(params, formattedAmount),
  };
};
