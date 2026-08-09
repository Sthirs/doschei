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
  color: string;
  iconPath: string;
};

export const CATEGORY_FAMILY_COLORS: Record<CategoryFamily, string> = {
  entertainment: '#a78bfa',
  'food-and-drink': '#fb923c',
  home: '#34d399',
  life: '#fb7185',
  transportation: '#38bdf8',
  uncategorized: '#a3a3a3',
  utilities: '#facc15',
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
  { key: 'games', label: 'Games', icon: '🎮', family: 'entertainment', color: '#a78bfa', iconPath: '/icons/expenses/entertainment/games.svg' },
  { key: 'movies', label: 'Movies', icon: '🎬', family: 'entertainment', color: '#a78bfa', iconPath: '/icons/expenses/entertainment/movies.svg' },
  { key: 'music', label: 'Music', icon: '🎵', family: 'entertainment', color: '#a78bfa', iconPath: '/icons/expenses/entertainment/music.svg' },
  { key: 'entertainment-other', label: 'Other', icon: '✨', family: 'entertainment', color: '#a78bfa', iconPath: '/icons/expenses/entertainment/other-entertainment.svg' },
  { key: 'sports', label: 'Sports', icon: '⚽', family: 'entertainment', color: '#a78bfa', iconPath: '/icons/expenses/entertainment/sports.svg' },

  // Food and Drink
  { key: 'dining-out', label: 'Dining Out', icon: '🍽️', family: 'food-and-drink', color: '#fb923c', iconPath: '/icons/expenses/food-and-drink/dining-out.svg' },
  { key: 'groceries', label: 'Groceries', icon: '🛒', family: 'food-and-drink', color: '#fb923c', iconPath: '/icons/expenses/food-and-drink/grocieries.svg' },
  { key: 'liquor', label: 'Liquor', icon: '🍷', family: 'food-and-drink', color: '#fb923c', iconPath: '/icons/expenses/food-and-drink/liquor.svg' },
  { key: 'food-other', label: 'Other', icon: '✨', family: 'food-and-drink', color: '#fb923c', iconPath: '/icons/expenses/food-and-drink/other-food-and-drink.svg' },

  // Home
  { key: 'electronics', label: 'Electronics', icon: '💡', family: 'home', color: '#34d399', iconPath: '/icons/expenses/home/electronics.svg' },
  { key: 'furniture', label: 'Furniture', icon: '🛋️', family: 'home', color: '#34d399', iconPath: '/icons/expenses/home/forniture.svg' },
  { key: 'household-supplies', label: 'Household Supplies', icon: '🧴', family: 'home', color: '#34d399', iconPath: '/icons/expenses/home/household-supplies.svg' },
  { key: 'maintenance', label: 'Maintenance', icon: '🔧', family: 'home', color: '#34d399', iconPath: '/icons/expenses/home/maintenance.svg' },
  { key: 'mortgage', label: 'Mortgage', icon: '🏦', family: 'home', color: '#34d399', iconPath: '/icons/expenses/home/mortgage.svg' },
  { key: 'home-other', label: 'Other', icon: '✨', family: 'home', color: '#34d399', iconPath: '/icons/expenses/home/other-home.svg' },
  { key: 'pets', label: 'Pets', icon: '🐾', family: 'home', color: '#34d399', iconPath: '/icons/expenses/home/pets.svg' },
  { key: 'rent', label: 'Rent', icon: '🏠', family: 'home', color: '#34d399', iconPath: '/icons/expenses/home/rent.svg' },
  { key: 'services', label: 'Services', icon: '🛠️', family: 'home', color: '#34d399', iconPath: '/icons/expenses/home/services.svg' },

  // Life
  { key: 'childcare', label: 'Childcare', icon: '🍼', family: 'life', color: '#fb7185', iconPath: '/icons/expenses/life/childcare.svg' },
  { key: 'clothing', label: 'Clothing', icon: '👕', family: 'life', color: '#fb7185', iconPath: '/icons/expenses/life/clothing.svg' },
  { key: 'education', label: 'Education', icon: '🎓', family: 'life', color: '#fb7185', iconPath: '/icons/expenses/life/education.svg' },
  { key: 'gifts', label: 'Gifts', icon: '🎁', family: 'life', color: '#fb7185', iconPath: '/icons/expenses/life/gifts.svg' },
  { key: 'insurance', label: 'Insurance', icon: '🛡️', family: 'life', color: '#fb7185', iconPath: '/icons/expenses/life/insurance.svg' },
  { key: 'medical-expenses', label: 'Medical Expenses', icon: '⚕️', family: 'life', color: '#fb7185', iconPath: '/icons/expenses/life/medical-expenses.svg' },
  { key: 'life-other', label: 'Other', icon: '✨', family: 'life', color: '#fb7185', iconPath: '/icons/expenses/life/other-life.svg' },
  { key: 'taxes', label: 'Taxes', icon: '🧾', family: 'life', color: '#fb7185', iconPath: '/icons/expenses/life/taxes.svg' },

  // Transportation
  { key: 'bicycle', label: 'Bicycle', icon: '🚲', family: 'transportation', color: '#38bdf8', iconPath: '/icons/expenses/transportation/bicycle.svg' },
  { key: 'bus-train', label: 'Bus/Train', icon: '🚆', family: 'transportation', color: '#38bdf8', iconPath: '/icons/expenses/transportation/bus-train.svg' },
  { key: 'car', label: 'Car', icon: '🚗', family: 'transportation', color: '#38bdf8', iconPath: '/icons/expenses/transportation/car.svg' },
  { key: 'gas-fuel', label: 'Gas/Fuel', icon: '⛽', family: 'transportation', color: '#38bdf8', iconPath: '/icons/expenses/transportation/gas-fuel.svg' },
  { key: 'hotel', label: 'Hotel', icon: '🏨', family: 'transportation', color: '#38bdf8', iconPath: '/icons/expenses/transportation/hotel.svg' },
  { key: 'transportation-other', label: 'Other', icon: '✨', family: 'transportation', color: '#38bdf8', iconPath: '/icons/expenses/transportation/other-transportation.svg' },
  { key: 'parking', label: 'Parking', icon: '🅿️', family: 'transportation', color: '#38bdf8', iconPath: '/icons/expenses/transportation/parking.svg' },
  { key: 'plane', label: 'Plane', icon: '✈️', family: 'transportation', color: '#38bdf8', iconPath: '/icons/expenses/transportation/plane.svg' },
  { key: 'taxi', label: 'Taxi', icon: '🚕', family: 'transportation', color: '#38bdf8', iconPath: '/icons/expenses/transportation/taxi.svg' },

  // Uncategorized
  { key: 'general', label: 'General', icon: '🧩', family: 'uncategorized', color: '#a3a3a3', iconPath: '/icons/expenses/uncategorized/general.svg' },

  // Utilities
  { key: 'cleaning', label: 'Cleaning', icon: '🧹', family: 'utilities', color: '#facc15', iconPath: '/icons/expenses/utilities/cleaning.svg' },
  { key: 'electricity', label: 'Electricity', icon: '⚡', family: 'utilities', color: '#facc15', iconPath: '/icons/expenses/utilities/electricity.svg' },
  { key: 'heat-gas', label: 'Heat/Gas', icon: '🔥', family: 'utilities', color: '#facc15', iconPath: '/icons/expenses/utilities/heat-gas.svg' },
  { key: 'utilities-other', label: 'Other', icon: '✨', family: 'utilities', color: '#facc15', iconPath: '/icons/expenses/utilities/other-utilities.svg' },
  { key: 'trash', label: 'Trash', icon: '🗑️', family: 'utilities', color: '#facc15', iconPath: '/icons/expenses/utilities/trash.svg' },
  { key: 'tv-phone-internet', label: 'TV/Phone/Internet', icon: '📺', family: 'utilities', color: '#facc15', iconPath: '/icons/expenses/utilities/tv-phone-internet.svg' },
  { key: 'water', label: 'Water', icon: '💧', family: 'utilities', color: '#facc15', iconPath: '/icons/expenses/utilities/water.svg' },
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
