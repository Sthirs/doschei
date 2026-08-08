// Format a EUR amount (number of euros, e.g. 42.5) as "€42.50"
export const formatEur = (eur: number): string => {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(eur);
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

// Filler words skipped when picking initials ("Weekend in Venice" → "WV")
const GROUP_INITIAL_STOPWORDS = new Set([
  'a', 'an', 'and', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'the', 'to', 'with',
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

// Get chip label text
export const balanceChipLabel = (netForCurrentUser: number): string => {
  const kind = balanceChipKind(netForCurrentUser);
  if (kind === 'owed') return `You are owed ${formatEur(netForCurrentUser)}`;
  if (kind === 'owe') return `You owe ${formatEur(Math.abs(netForCurrentUser))}`;
  return 'Settled';
};
