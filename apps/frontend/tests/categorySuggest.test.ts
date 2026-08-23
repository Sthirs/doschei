import { describe, it, expect } from 'vitest';

import {
  suggestCategory,
  normalizeDescription,
  tokenize,
  SUGGESTION_MIN_EXACT_SHARE,
  SUGGESTION_MIN_FUZZY_SCORE,
  SUGGESTION_DOMINANCE_RATIO,
  type CategoryLearningEntry,
} from '@/lib/categorySuggest';
import { en } from '@/i18n/en';
import { it as itMessages } from '@/i18n/it';

const toLabelMap = (catalog: { categories: { items: Record<string, string> } }) =>
  catalog.categories.items;
const EN_LABELS = toLabelMap(en);
const IT_LABELS = toLabelMap(itMessages);

const entry = (
  description: string,
  category: string,
  kind: CategoryLearningEntry['kind'] = 'EXPENSE',
): CategoryLearningEntry => ({ description, category, kind });

describe('categorySuggest constants', () => {
  it('exposes the documented thresholds verbatim', () => {
    expect(SUGGESTION_MIN_EXACT_SHARE).toBe(0.6);
    expect(SUGGESTION_MIN_FUZZY_SCORE).toBe(0.15);
    expect(SUGGESTION_DOMINANCE_RATIO).toBe(2);
  });
});

describe('normalizeDescription', () => {
  it('trims, lowercases, and collapses whitespace', () => {
    expect(normalizeDescription('  VENICE   Train tickets ')).toBe(
      'venice train tickets',
    );
    expect(normalizeDescription('a\tb\n\nc   d')).toBe('a b c d');
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeDescription('   ')).toBe('');
    expect(normalizeDescription('\t \n')).toBe('');
  });
});

describe('tokenize', () => {
  it('splits on non-alphanumeric runs and keeps tokens >= 2 chars', () => {
    expect(tokenize('Venice train tickets')).toEqual([
      'venice',
      'train',
      'tickets',
    ]);
  });

  it('drops single-character tokens', () => {
    expect(tokenize('a bus b ride')).toEqual(['bus', 'ride']);
  });

  it('preserves first-seen order when deduplicating', () => {
    expect(tokenize('taxi taxi ride ride')).toEqual(['taxi', 'ride']);
  });

  it('keeps accented letters inside tokens (Unicode-aware splitting)', () => {
    expect(tokenize('Caffè al bar')).toEqual(['caffè', 'al', 'bar']);
    expect(tokenize('Elettricità e acqua')).toEqual([
      'elettricità',
      'acqua',
    ]);
  });
});

describe('suggestCategory', () => {
  it('(a) returns null for an empty or whitespace-only description', () => {
    expect(suggestCategory('', [entry('Anything', 'bus-train')])).toBeNull();
    expect(suggestCategory('   ', [entry('Anything', 'bus-train')])).toBeNull();
  });

  it('(b) exact match returns the category with confidence 1', () => {
    const result = suggestCategory('Venice train tickets', [
      entry('Venice train tickets', 'bus-train'),
    ]);
    expect(result).toEqual({ key: 'bus-train', confidence: 1 });
  });

  it('(c) exact match after whitespace normalisation and case folding', () => {
    const result = suggestCategory('  VENICE   Train tickets ', [
      entry('Venice train tickets', 'bus-train'),
    ]);
    expect(result).toEqual({ key: 'bus-train', confidence: 1 });
  });

  it('(d) returns null when the exact match is a 50/50 category tie', () => {
    const result = suggestCategory('lunch', [
      entry('Lunch', 'dining-out'),
      entry('Lunch', 'food-other'),
    ]);
    expect(result).toBeNull();
  });

  it('(e) ignores settlement entries from the corpus (Stage 3 still matches on taxonomy name)', () => {
    const result = suggestCategory('Venice train tickets', [
      entry('Venice train tickets', 'bus-train', 'SETTLEMENT'),
    ], EN_LABELS);
    expect(result).toEqual({ key: 'bus-train', confidence: 0.5 });
  });

  it('(f) drops corpus entries whose category is not a known key (Stage 3 still matches on taxonomy name)', () => {
    const result = suggestCategory('Venice train tickets', [
      entry('Venice train tickets', 'nonexistent-key'),
    ], EN_LABELS);
    expect(result).toEqual({ key: 'bus-train', confidence: 0.5 });
  });

  it('(g) fuzzy match picks the dominant category with high confidence', () => {
    const result = suggestCategory('Venice taxi to airport', [
      entry('Palermo airport taxi', 'taxi'),
      entry('Venice train tickets', 'bus-train'),
    ]);
    expect(result).not.toBeNull();
    expect(result?.key).toBe('taxi');
    expect(result?.confidence).toBeGreaterThan(0.8);
    expect(result?.confidence).toBeLessThanOrEqual(1);
  });

  it('(h) perfect token overlap against a single corpus entry yields confidence 1', () => {
    const result = suggestCategory('gondola ride tour', [
      entry('Venice gondola ride', 'general'),
    ]);
    expect(result).toEqual({ key: 'general', confidence: 1 });
  });

  it('(i) returns null when the query has no token overlap with any entry', () => {
    const result = suggestCategory('zz fun', [
      entry('funny times', 'general'),
    ]);
    expect(result).toBeNull();
  });

  it('(j) Stage 3a: exact category name with empty history returns the matching category', () => {
    const result = suggestCategory('Groceries', [], EN_LABELS);
    expect(result).toEqual({ key: 'groceries', confidence: 1 });
  });

  it('(k) Stage 3a: exact name match survives case folding and whitespace collapse', () => {
    const result = suggestCategory('  DINING   OUT ', [], EN_LABELS);
    expect(result).toEqual({ key: 'dining-out', confidence: 1 });
  });

  it('(l) Stage 3: partial name match yields full confidence when the entire label is covered', () => {
    const result = suggestCategory('groceries for the weekend', [], EN_LABELS);
    expect(result).not.toBeNull();
    expect(result?.key).toBe('groceries');
    expect(result?.confidence).toBe(1);
  });

  it('(m) PRIORITY: a Stage 2 history match always beats a Stage 3 name match', () => {
    const result = suggestCategory('groceries', [
      entry('Groceries at the bar', 'dining-out'),
    ]);
    expect(result).not.toBeNull();
    expect(result?.key).toBe('dining-out');
  });

  it('(m-sharp) the same query with EMPTY history falls through to Stage 3, proving the fallback exists', () => {
    const result = suggestCategory('groceries', [], EN_LABELS);
    expect(result).toEqual({ key: 'groceries', confidence: 1 });
  });

  it('(n) Stage 3: composite category label whose every token is covered yields confidence 1', () => {
    const result = suggestCategory('new tv phone internet deal', [], EN_LABELS);
    expect(result).not.toBeNull();
    expect(result?.key).toBe('tv-phone-internet');
    expect(result?.confidence).toBe(1);
  });

  it('(o) Stage 3: generic labels (`other`, `general`) are excluded from the fallback', () => {
    expect(suggestCategory('other things', [], EN_LABELS)).toBeNull();
    expect(suggestCategory('general store', [], EN_LABELS)).toBeNull();
  });

  it('(p) Stage 3: tied full-label coverage is broken deterministically by category key (ASC)', () => {
    const result = suggestCategory('rent a car', [], EN_LABELS);
    expect(result).not.toBeNull();
    expect(result?.key).toBe('car');
    expect(result?.confidence).toBe(1);
  });

  it('(q) Stage 3: partial single-word match ties resolve to the alphabetically-first key', () => {
    const result = suggestCategory('gas', [], EN_LABELS);
    expect(result).toEqual({ key: 'gas-fuel', confidence: 0.5 });
  });

  it('(r) Stage 3: partial label match resolves the other side of the same composite key', () => {
    const result = suggestCategory('fuel surcharge', [], EN_LABELS);
    expect(result).toEqual({ key: 'gas-fuel', confidence: 0.5 });
  });

  it('(s) Stage 3: partial multi-word label match yields proportional label coverage', () => {
    const result = suggestCategory('dining', [], EN_LABELS);
    expect(result).toEqual({ key: 'dining-out', confidence: 0.5 });
  });

  it('(u) Stage 3: sub-threshold history does not block a solid name match', () => {
    const result = suggestCategory('gas bill', [
      entry('gas for heating', 'heat-gas'),
    ], EN_LABELS);
    expect(result).toEqual({ key: 'gas-fuel', confidence: 0.5 });
  });

  describe('Italian locale (Stage 3 taxonomy-name fallback)', () => {
    it('full-label match: "Spesa carburante" resolves to gas-fuel (conf 1)', () => {
      // NB: "...auto" would tie with car ("Auto") at ratio 1 and the
      // ADR-0017 key-ASC tiebreak awards 'car' — so this probe avoids it.
      const result = suggestCategory('Spesa carburante', [], IT_LABELS);
      expect(result).toEqual({ key: 'gas-fuel', confidence: 1 });
    });

    it('tie on full-label coverage resolves by key ASC: "Spesa carburante auto" → car', () => {
      const result = suggestCategory('Spesa carburante auto', [], IT_LABELS);
      expect(result).toEqual({ key: 'car', confidence: 1 });
    });

    it('partial match wins when uncontested: "Spesa al supermercato" resolves to groceries', () => {
      const result = suggestCategory('Spesa al supermercato', [], IT_LABELS);
      expect(result).toEqual({ key: 'groceries', confidence: 0.5 });
    });

    it('composite partial match: "Biglietto treno per Roma" resolves to bus-train (conf 0.5)', () => {
      const result = suggestCategory('Biglietto treno per Roma', [], IT_LABELS);
      expect(result).toEqual({ key: 'bus-train', confidence: 0.5 });
    });

    it('exact Italian label with empty history returns the matching category', () => {
      const result = suggestCategory('Affitto mensile', [], IT_LABELS);
      expect(result).toEqual({ key: 'rent', confidence: 1 });
    });

    it('generic Italian labels (Altro / Generale) are excluded by KEY regardless of locale', () => {
      expect(suggestCategory('altro', [], IT_LABELS)).toBeNull();
      expect(suggestCategory('generale', [], IT_LABELS)).toBeNull();
    });

    it('history still beats taxonomy: an exact Italian description match wins over name matching', () => {
      const result = suggestCategory('Spesa carburante auto', [
        entry('Spesa carburante auto', 'transportation-other'),
      ]);
      expect(result).toEqual({ key: 'transportation-other', confidence: 1 });
    });

    it('language-exclusive descriptions do not cross-match', () => {
      // NB: 'gas' is deliberately avoided — it exists in both locales
      // (Gas/Fuel and Riscaldamento/Gas).
      expect(suggestCategory('train tickets receipt', [], IT_LABELS)).toBeNull();
      expect(suggestCategory('Spesa carburante auto', [], EN_LABELS)).toBeNull();
    });
  });
});
