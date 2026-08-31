export const VALID_EXPENSE_CATEGORIES = new Set([
  'games',
  'movies',
  'music',
  'entertainment-other',
  'sports',
  'dining-out',
  'groceries',
  'liquor',
  'food-other',
  'electronics',
  'furniture',
  'household-supplies',
  'maintenance',
  'mortgage',
  'home-other',
  'pets',
  'rent',
  'services',
  'childcare',
  'clothing',
  'education',
  'gifts',
  'insurance',
  'medical-expenses',
  'life-other',
  'taxes',
  'bicycle',
  'bus-train',
  'car',
  'gas-fuel',
  'hotel',
  'transportation-other',
  'parking',
  'plane',
  'taxi',
  'general',
  'cleaning',
  'electricity',
  'heat-gas',
  'utilities-other',
  'trash',
  'tv-phone-internet',
  'water',
]);

export const isValidExpenseDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};
