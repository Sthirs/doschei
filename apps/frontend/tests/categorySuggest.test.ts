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
    ]);
    expect(result).toEqual({ key: 'bus-train', confidence: 0.5 });
  });

  it('(f) drops corpus entries whose category is not a known key (Stage 3 still matches on taxonomy name)', () => {
    const result = suggestCategory('Venice train tickets', [
      entry('Venice train tickets', 'nonexistent-key'),
    ]);
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
    const result = suggestCategory('Groceries', []);
    expect(result).toEqual({ key: 'groceries', confidence: 1 });
  });

  it('(k) Stage 3a: exact name match survives case folding and whitespace collapse', () => {
    const result = suggestCategory('  DINING   OUT ', []);
    expect(result).toEqual({ key: 'dining-out', confidence: 1 });
  });

  it('(l) Stage 3: partial name match yields full confidence when the entire label is covered', () => {
    const result = suggestCategory('groceries for the weekend', []);
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
    const result = suggestCategory('groceries', []);
    expect(result).toEqual({ key: 'groceries', confidence: 1 });
  });

  it('(n) Stage 3: composite category label whose every token is covered yields confidence 1', () => {
    const result = suggestCategory('new tv phone internet deal', []);
    expect(result).not.toBeNull();
    expect(result?.key).toBe('tv-phone-internet');
    expect(result?.confidence).toBe(1);
  });

  it('(o) Stage 3: generic labels (`other`, `general`) are excluded from the fallback', () => {
    expect(suggestCategory('other things', [])).toBeNull();
    expect(suggestCategory('general store', [])).toBeNull();
  });

  it('(p) Stage 3: tied full-label coverage is broken deterministically by category key (ASC)', () => {
    const result = suggestCategory('rent a car', []);
    expect(result).not.toBeNull();
    expect(result?.key).toBe('car');
    expect(result?.confidence).toBe(1);
  });

  it('(q) Stage 3: partial single-word match ties resolve to the alphabetically-first key', () => {
    const result = suggestCategory('gas', []);
    expect(result).toEqual({ key: 'gas-fuel', confidence: 0.5 });
  });

  it('(r) Stage 3: partial label match resolves the other side of the same composite key', () => {
    const result = suggestCategory('fuel surcharge', []);
    expect(result).toEqual({ key: 'gas-fuel', confidence: 0.5 });
  });

  it('(s) Stage 3: partial multi-word label match yields proportional label coverage', () => {
    const result = suggestCategory('dining', []);
    expect(result).toEqual({ key: 'dining-out', confidence: 0.5 });
  });

  it('(u) Stage 3: sub-threshold history does not block a solid name match', () => {
    const result = suggestCategory('gas bill', [
      entry('gas for heating', 'heat-gas'),
    ]);
    expect(result).toEqual({ key: 'gas-fuel', confidence: 0.5 });
  });
});
