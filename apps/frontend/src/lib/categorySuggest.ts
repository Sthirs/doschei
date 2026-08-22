import { CATEGORY_BY_KEY } from '@/lib/categories';

/**
 * Category auto-selection engine for the group history feature.
 *
 * Spec: `docs/specifications.md` § Features — "Category auto-selection learns
 * only from the expense history of the group the expense belongs to, is
 * computed entirely client-side, ignores settle-up entries, applies only while
 * the category is still the default and was not manually chosen in the form,
 * and never overrides a manual selection."
 *
 * Pipeline:
 *   Stage 1 (exact): when the normalised description matches prior entries,
 *     return the dominant category if it owns a strict majority of the exact
 *     matches (`share >= SUGGESTION_MIN_EXACT_SHARE` and `bestCount` strictly
 *     greater than the runner-up).
 *   Stage 2 (fuzzy): tokenise both sides, score each corpus entry with
 *     Jaccard similarity weighted by recall against the query tokens
 *     (`sim * weight`), aggregate per category, and return the highest-scoring
 *     category that clears both `SUGGESTION_MIN_FUZZY_SCORE` and
 *     `SUGGESTION_DOMINANCE_RATIO` over the runner-up.
 *
 * Settlement entries are excluded from the corpus because they describe money
 * movement between members, not the subject of an expense. Categories not in
 * `CATEGORY_BY_KEY` are likewise dropped so stale or hand-typed keys cannot
 * pollute the ranking.
 *
 * The module is pure: no I/O, no timers, deterministic, side-effect free.
 */
export const SUGGESTION_MIN_EXACT_SHARE = 0.6;
export const SUGGESTION_MIN_FUZZY_SCORE = 0.15;
export const SUGGESTION_DOMINANCE_RATIO = 2;

export type CategoryLearningEntry = {
  description: string;
  category: string;
  kind: string;
};

export type CategorySuggestion = {
  key: string;
  confidence: number;
};

/**
 * Normalises a free-text description: trims surrounding whitespace,
 * lower-cases, and collapses every internal whitespace run to a single space.
 */
export const normalizeDescription = (s: string): string =>
  s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Tokenises a description for fuzzy matching: normalise, split on any
 * non-alphanumeric run, drop tokens shorter than 2 characters, and dedupe
 * while preserving first-seen order.
 */
export const tokenize = (s: string): string[] => {
  const normalized = normalizeDescription(s);
  const rawTokens = normalized.split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of rawTokens) {
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
};

const compareEntriesByValueThenKey = (
  a: readonly [string, number],
  b: readonly [string, number],
): number => {
  if (b[1] !== a[1]) return b[1] - a[1];
  if (a[0] < b[0]) return -1;
  if (a[0] > b[0]) return 1;
  return 0;
};

/**
 * Suggests the most likely expense category for a description, learning from
 * the user's prior categorised expenses in the group. Returns `null` when no
 * candidate clears the configured thresholds.
 */
export const suggestCategory = (
  description: string,
  history: ReadonlyArray<CategoryLearningEntry>,
): CategorySuggestion | null => {
  const norm = normalizeDescription(description);
  if (norm === '') return null;

  const corpus = history.filter((entry) => {
    if (entry.kind === 'SETTLEMENT') return false;
    if (!CATEGORY_BY_KEY.has(entry.category)) return false;
    return normalizeDescription(entry.description) !== '';
  });

  // Stage 1: exact description match.
  const exact = corpus.filter(
    (entry) => normalizeDescription(entry.description) === norm,
  );
  if (exact.length > 0) {
    const counts = new Map<string, number>();
    for (const entry of exact) {
      counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
    }
    const ranked = [...counts.entries()].sort(compareEntriesByValueThenKey);
    const bestKey = ranked[0][0];
    const bestCount = ranked[0][1];
    const runnerUpCount = ranked.length > 1 ? ranked[1][1] : 0;
    const share = bestCount / exact.length;
    if (share >= SUGGESTION_MIN_EXACT_SHARE && bestCount > runnerUpCount) {
      return { key: bestKey, confidence: share };
    }
    // Otherwise fall through to the fuzzy stage.
  }

  // Stage 2: fuzzy token-based scoring.
  const q = new Set(tokenize(norm));
  if (q.size === 0) return null;

  const qSize = q.size;
  const scores = new Map<string, number>();
  for (const entry of corpus) {
    const entryTokenSet = new Set(tokenize(entry.description));
    let inter = 0;
    for (const t of q) {
      if (entryTokenSet.has(t)) inter++;
    }
    if (inter === 0) continue;
    const unionSize = qSize + entryTokenSet.size - inter;
    const sim = inter / unionSize;
    const weight = inter / qSize;
    scores.set(entry.category, (scores.get(entry.category) ?? 0) + sim * weight);
  }

  if (scores.size === 0) return null;

  const ranked = [...scores.entries()].sort(compareEntriesByValueThenKey);
  const bestKey = ranked[0][0];
  const bestScore = ranked[0][1];
  const runnerUpScore = ranked.length > 1 ? ranked[1][1] : 0;

  if (
    bestScore >= SUGGESTION_MIN_FUZZY_SCORE &&
    bestScore >= SUGGESTION_DOMINANCE_RATIO * runnerUpScore
  ) {
    const confidence = Math.min(1, bestScore / (bestScore + runnerUpScore));
    return { key: bestKey, confidence };
  }

  return null;
};
