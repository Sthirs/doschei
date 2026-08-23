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
  icon: string;
  family: CategoryFamily;
  color: string;
  iconPath: string;
};

export const CATEGORY_FAMILY_COLORS: Record<CategoryFamily, string> = {
  entertainment: '#a78bfa',
  'food-and-drink': '#34d399',
  home: '#fb923c',
  life: '#38bdf8',
  transportation: '#fb7185',
  uncategorized: '#a3a3a3',
  utilities: '#facc15',
};

export const CATEGORIES: readonly CategoryDefinition[] = [
  // Entertainment
  { key: 'games', icon: '🎮', family: 'entertainment', color: '#a78bfa', iconPath: '/icons/expenses/entertainment/games.svg' },
  { key: 'movies', icon: '🎬', family: 'entertainment', color: '#a78bfa', iconPath: '/icons/expenses/entertainment/movies.svg' },
  { key: 'music', icon: '🎵', family: 'entertainment', color: '#a78bfa', iconPath: '/icons/expenses/entertainment/music.svg' },
  { key: 'entertainment-other', icon: '✨', family: 'entertainment', color: '#a78bfa', iconPath: '/icons/expenses/entertainment/other-entertainment.svg' },
  { key: 'sports', icon: '⚽', family: 'entertainment', color: '#a78bfa', iconPath: '/icons/expenses/entertainment/sports.svg' },

  // Food and Drink
  { key: 'dining-out', icon: '🍽️', family: 'food-and-drink', color: '#34d399', iconPath: '/icons/expenses/food-and-drink/dining-out.svg' },
  { key: 'groceries', icon: '🛒', family: 'food-and-drink', color: '#34d399', iconPath: '/icons/expenses/food-and-drink/grocieries.svg' },
  { key: 'liquor', icon: '🍷', family: 'food-and-drink', color: '#34d399', iconPath: '/icons/expenses/food-and-drink/liquor.svg' },
  { key: 'food-other', icon: '✨', family: 'food-and-drink', color: '#34d399', iconPath: '/icons/expenses/food-and-drink/other-food-and-drink.svg' },

  // Home
  { key: 'electronics', icon: '💡', family: 'home', color: '#fb923c', iconPath: '/icons/expenses/home/electronics.svg' },
  { key: 'furniture', icon: '🛋️', family: 'home', color: '#fb923c', iconPath: '/icons/expenses/home/forniture.svg' },
  { key: 'household-supplies', icon: '🧴', family: 'home', color: '#fb923c', iconPath: '/icons/expenses/home/household-supplies.svg' },
  { key: 'maintenance', icon: '🔧', family: 'home', color: '#fb923c', iconPath: '/icons/expenses/home/maintenance.svg' },
  { key: 'mortgage', icon: '🏦', family: 'home', color: '#fb923c', iconPath: '/icons/expenses/home/mortgage.svg' },
  { key: 'home-other', icon: '✨', family: 'home', color: '#fb923c', iconPath: '/icons/expenses/home/other-home.svg' },
  { key: 'pets', icon: '🐾', family: 'home', color: '#fb923c', iconPath: '/icons/expenses/home/pets.svg' },
  { key: 'rent', icon: '🏠', family: 'home', color: '#fb923c', iconPath: '/icons/expenses/home/rent.svg' },
  { key: 'services', icon: '🛠️', family: 'home', color: '#fb923c', iconPath: '/icons/expenses/home/services.svg' },

  // Life
  { key: 'childcare', icon: '🍼', family: 'life', color: '#38bdf8', iconPath: '/icons/expenses/life/childcare.svg' },
  { key: 'clothing', icon: '👕', family: 'life', color: '#38bdf8', iconPath: '/icons/expenses/life/clothing.svg' },
  { key: 'education', icon: '🎓', family: 'life', color: '#38bdf8', iconPath: '/icons/expenses/life/education.svg' },
  { key: 'gifts', icon: '🎁', family: 'life', color: '#38bdf8', iconPath: '/icons/expenses/life/gifts.svg' },
  { key: 'insurance', icon: '🛡️', family: 'life', color: '#38bdf8', iconPath: '/icons/expenses/life/insurance.svg' },
  { key: 'medical-expenses', icon: '⚕️', family: 'life', color: '#38bdf8', iconPath: '/icons/expenses/life/medical-expenses.svg' },
  { key: 'life-other', icon: '✨', family: 'life', color: '#38bdf8', iconPath: '/icons/expenses/life/other-life.svg' },
  { key: 'taxes', icon: '🧾', family: 'life', color: '#38bdf8', iconPath: '/icons/expenses/life/taxes.svg' },

  // Transportation
  { key: 'bicycle', icon: '🚲', family: 'transportation', color: '#fb7185', iconPath: '/icons/expenses/transportation/bicycle.svg' },
  { key: 'bus-train', icon: '🚆', family: 'transportation', color: '#fb7185', iconPath: '/icons/expenses/transportation/bus-train.svg' },
  { key: 'car', icon: '🚗', family: 'transportation', color: '#fb7185', iconPath: '/icons/expenses/transportation/car.svg' },
  { key: 'gas-fuel', icon: '⛽', family: 'transportation', color: '#fb7185', iconPath: '/icons/expenses/transportation/gas-fuel.svg' },
  { key: 'hotel', icon: '🏨', family: 'transportation', color: '#fb7185', iconPath: '/icons/expenses/transportation/hotel.svg' },
  { key: 'transportation-other', icon: '✨', family: 'transportation', color: '#fb7185', iconPath: '/icons/expenses/transportation/other-transportation.svg' },
  { key: 'parking', icon: '🅿️', family: 'transportation', color: '#fb7185', iconPath: '/icons/expenses/transportation/parking.svg' },
  { key: 'plane', icon: '✈️', family: 'transportation', color: '#fb7185', iconPath: '/icons/expenses/transportation/plane.svg' },
  { key: 'taxi', icon: '🚕', family: 'transportation', color: '#fb7185', iconPath: '/icons/expenses/transportation/taxi.svg' },

  // Uncategorized
  { key: 'general', icon: '🧩', family: 'uncategorized', color: '#a3a3a3', iconPath: '/icons/expenses/uncategorized/general.svg' },

  // Utilities
  { key: 'cleaning', icon: '🧹', family: 'utilities', color: '#facc15', iconPath: '/icons/expenses/utilities/cleaning.svg' },
  { key: 'electricity', icon: '⚡', family: 'utilities', color: '#facc15', iconPath: '/icons/expenses/utilities/electricity.svg' },
  { key: 'heat-gas', icon: '🔥', family: 'utilities', color: '#facc15', iconPath: '/icons/expenses/utilities/heat-gas.svg' },
  { key: 'utilities-other', icon: '✨', family: 'utilities', color: '#facc15', iconPath: '/icons/expenses/utilities/other-utilities.svg' },
  { key: 'trash', icon: '🗑️', family: 'utilities', color: '#facc15', iconPath: '/icons/expenses/utilities/trash.svg' },
  { key: 'tv-phone-internet', icon: '📺', family: 'utilities', color: '#facc15', iconPath: '/icons/expenses/utilities/tv-phone-internet.svg' },
  { key: 'water', icon: '💧', family: 'utilities', color: '#facc15', iconPath: '/icons/expenses/utilities/water.svg' },
];

export const DEFAULT_CATEGORY_KEY = 'general';

export const CATEGORY_BY_KEY: Map<string, CategoryDefinition> = new Map(
  CATEGORIES.map((c) => [c.key, c]),
);

const FAMILY_ORDER: CategoryFamily[] = [
  'food-and-drink',
  'transportation',
  'home',
  'life',
  'utilities',
  'entertainment',
  'uncategorized',
];

export const CATEGORIES_GROUPED: Array<{
  family: CategoryFamily;
  entries: readonly CategoryDefinition[];
}> = FAMILY_ORDER.map((family) => ({
  family,
  entries: CATEGORIES.filter((c) => c.family === family),
}));

export const getCategory = (key: string | undefined | null): CategoryDefinition =>
  (key ? CATEGORY_BY_KEY.get(key) : undefined) ?? CATEGORY_BY_KEY.get(DEFAULT_CATEGORY_KEY)!;
