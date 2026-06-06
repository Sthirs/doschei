export type CategoryFamily =
  | 'entertainment'
  | 'food-and-drink'
  | 'home'
  | 'life'
  | 'transportation'
  | 'uncategorized'
  | 'utilities';

export type CategoryDefinition = {
  key: string;
  label: string;
  icon: string;
  family: CategoryFamily;
};

export const CATEGORY_FAMILY_LABELS: Record<CategoryFamily, string> = {
  entertainment: 'Entertainment',
  'food-and-drink': 'Food & Drink',
  home: 'Home',
  life: 'Life',
  transportation: 'Transportation',
  uncategorized: 'Uncategorized',
  utilities: 'Utilities',
};

export const CATEGORIES: readonly CategoryDefinition[] = [
  // Entertainment
  { key: 'games', label: 'Games', icon: '🎮', family: 'entertainment' },
  { key: 'movies', label: 'Movies', icon: '🎬', family: 'entertainment' },
  { key: 'music', label: 'Music', icon: '🎵', family: 'entertainment' },
  { key: 'entertainment-other', label: 'Other', icon: '✨', family: 'entertainment' },
  { key: 'sports', label: 'Sports', icon: '⚽', family: 'entertainment' },

  // Food and Drink
  { key: 'dining-out', label: 'Dining Out', icon: '🍽️', family: 'food-and-drink' },
  { key: 'groceries', label: 'Groceries', icon: '🛒', family: 'food-and-drink' },
  { key: 'liquor', label: 'Liquor', icon: '🍷', family: 'food-and-drink' },
  { key: 'food-other', label: 'Other', icon: '✨', family: 'food-and-drink' },

  // Home
  { key: 'electronics', label: 'Electronics', icon: '💡', family: 'home' },
  { key: 'furniture', label: 'Furniture', icon: '🛋️', family: 'home' },
  { key: 'household-supplies', label: 'Household Supplies', icon: '🧴', family: 'home' },
  { key: 'maintenance', label: 'Maintenance', icon: '🔧', family: 'home' },
  { key: 'mortgage', label: 'Mortgage', icon: '🏦', family: 'home' },
  { key: 'home-other', label: 'Other', icon: '✨', family: 'home' },
  { key: 'pets', label: 'Pets', icon: '🐾', family: 'home' },
  { key: 'rent', label: 'Rent', icon: '🏠', family: 'home' },
  { key: 'services', label: 'Services', icon: '🛠️', family: 'home' },

  // Life
  { key: 'childcare', label: 'Childcare', icon: '🍼', family: 'life' },
  { key: 'clothing', label: 'Clothing', icon: '👕', family: 'life' },
  { key: 'education', label: 'Education', icon: '🎓', family: 'life' },
  { key: 'gifts', label: 'Gifts', icon: '🎁', family: 'life' },
  { key: 'insurance', label: 'Insurance', icon: '🛡️', family: 'life' },
  { key: 'medical-expenses', label: 'Medical Expenses', icon: '⚕️', family: 'life' },
  { key: 'life-other', label: 'Other', icon: '✨', family: 'life' },
  { key: 'taxes', label: 'Taxes', icon: '🧾', family: 'life' },

  // Transportation
  { key: 'bicycle', label: 'Bicycle', icon: '🚲', family: 'transportation' },
  { key: 'bus-train', label: 'Bus/Train', icon: '🚆', family: 'transportation' },
  { key: 'car', label: 'Car', icon: '🚗', family: 'transportation' },
  { key: 'gas-fuel', label: 'Gas/Fuel', icon: '⛽', family: 'transportation' },
  { key: 'hotel', label: 'Hotel', icon: '🏨', family: 'transportation' },
  { key: 'transportation-other', label: 'Other', icon: '✨', family: 'transportation' },
  { key: 'parking', label: 'Parking', icon: '🅿️', family: 'transportation' },
  { key: 'plane', label: 'Plane', icon: '✈️', family: 'transportation' },
  { key: 'taxi', label: 'Taxi', icon: '🚕', family: 'transportation' },

  // Uncategorized
  { key: 'general', label: 'General', icon: '🧩', family: 'uncategorized' },

  // Utilities
  { key: 'cleaning', label: 'Cleaning', icon: '🧹', family: 'utilities' },
  { key: 'electricity', label: 'Electricity', icon: '⚡', family: 'utilities' },
  { key: 'heat-gas', label: 'Heat/Gas', icon: '🔥', family: 'utilities' },
  { key: 'utilities-other', label: 'Other', icon: '✨', family: 'utilities' },
  { key: 'trash', label: 'Trash', icon: '🗑️', family: 'utilities' },
  { key: 'tv-phone-internet', label: 'TV/Phone/Internet', icon: '📺', family: 'utilities' },
  { key: 'water', label: 'Water', icon: '💧', family: 'utilities' },
];

export const DEFAULT_CATEGORY_KEY = 'general';

export const CATEGORY_BY_KEY: Map<string, CategoryDefinition> = new Map(
  CATEGORIES.map((c) => [c.key, c]),
);

const FAMILY_ORDER: CategoryFamily[] = [
  'entertainment',
  'food-and-drink',
  'home',
  'life',
  'transportation',
  'uncategorized',
  'utilities',
];

export const CATEGORIES_GROUPED: Array<{
  family: CategoryFamily;
  label: string;
  entries: readonly CategoryDefinition[];
}> = FAMILY_ORDER.map((family) => ({
  family,
  label: CATEGORY_FAMILY_LABELS[family],
  entries: CATEGORIES.filter((c) => c.family === family),
}));

export const getCategory = (key: string | undefined | null): CategoryDefinition =>
  (key ? CATEGORY_BY_KEY.get(key) : undefined) ?? CATEGORY_BY_KEY.get(DEFAULT_CATEGORY_KEY)!;
