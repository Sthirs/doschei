import { normalizeLocale } from '@/i18n';

// Format a EUR amount (number of euros, e.g. 42.5) as "€42.50".
//
// Locale accepts any BCP-47-ish string and is normalized internally ('en' fallback).
export const formatEur = (eur: number, locale: string = 'en'): string => {
  return new Intl.NumberFormat(normalizeLocale(locale), {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(eur);
};

// Format a EUR amount given in integer cents as whole euros, e.g. "€1,040".
//
// Used for chart value labels, where two decimals of noise would not fit and
// would not be read.
export const formatEurWhole = (cents: number, locale: string = 'en'): string => {
  return new Intl.NumberFormat(normalizeLocale(locale), {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
};

// Format a EUR amount given in integer cents for a chart axis tick, abbreviating
// thousands: "€0", "€400", "€1.2k".
//
// Intl compact notation emits an upper-case unit ("€1.2K"); the unit is
// lower-cased so ticks read as designed. The currency renders as the "€"
// symbol, never the "EUR" code, so no currency letters are at risk here.
export const formatEurAxis = (cents: number, locale: string = 'en'): string => {
  return new Intl.NumberFormat(normalizeLocale(locale), {
    style: 'currency',
    currency: 'EUR',
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
  })
    .format(cents / 100)
    .replace(/[KMBT]/g, (unit) => unit.toLowerCase());
};

// Map netForCurrentUser to balance chip kind
export const balanceChipKind = (netForCurrentUser: number): 'owed' | 'owe' | 'settled' => {
  if (netForCurrentUser > 0) return 'owed';
  if (netForCurrentUser < 0) return 'owe';
  return 'settled';
};

// Map chip kind to Tailwind text color class (using Figma balance tokens)
export const balanceColorClass = (kind: 'owed' | 'owe' | 'settled'): string => {
  // Use the new --color-balance-pos/neg tokens from style.css or fallback to Tailwind built-ins
  const map: Record<string, string> = {
    owed: 'text-[#2ECC71]',
    owe: 'text-[#FFB4AB]',
    settled: 'text-slate-400',
  };
  return map[kind];
};

// Filler words skipped when picking initials ("Weekend in Venice" → "WV").
// Combined English + Italian stopwords so groupInitials behaves correctly for
// both locales without the caller needing to specify.
const GROUP_INITIAL_STOPWORDS = new Set([
  // English
  'a', 'an', 'and', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'the', 'to', 'with',
  // Italian
  'di', 'del', 'della', 'dei', 'degli', 'delle', 'e', 'il', 'lo', 'la', 'gli', 'le',
  'un', 'una', 'uno', 'per', 'con', 'su', 'in', 'al', 'alla', 'ai', 'agli', 'dal', 'dalla',
]);

// Extract up to 2 initials from group name (first letter of first 2 meaningful words)
export const groupInitials = (name: string): string => {
  if (!name || !name.trim()) return '';
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => !GROUP_INITIAL_STOPWORDS.has(w.toLowerCase()));
  return words.slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('');
};
