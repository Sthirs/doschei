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
 * Pipeline (history-first; Stage 3 only ever runs when Stages 1–2 produce no
 * qualifying candidate):
 *   Stage 1 (exact): when the normalised description matches prior entries,
 *     return the dominant category if it owns a strict majority of the exact
 *     matches (`share >= SUGGESTION_MIN_EXACT_SHARE` and `bestCount` strictly
 *     greater than the runner-up).
 *   Stage 2 (fuzzy): tokenise both sides, score each corpus entry with
 *     Jaccard similarity weighted by recall against the query tokens
 *     (`sim * weight`), aggregate per category, and return the highest-scoring
 *     category that clears both `SUGGESTION_MIN_FUZZY_SCORE` and
 *     `SUGGESTION_DOMINANCE_RATIO` over the runner-up.
 *   Stage 3 (taxonomy-name fallback): when Stages 1–2 yield no qualifying
 *     candidate, rank every non-generic category label (`other` and `general`
 *     are excluded as ambiguous across families) by how completely its
 *     tokens appear in the entered description — labels whose every token is
 *     covered are full matches (confidence 1), and partial matches (e.g.
 *     `'gas'` → Gas/Fuel, `'dining'` → Dining Out) are qualified by how
 *     completely the matched label is covered (ratio of covered label
 *     tokens to total label tokens). Ties are broken deterministically by
 *     category key (ASC).
 *
 * Stage 3 is intentionally subordinate to Stages 1–2: any history that
 * surfaces a category key always wins over a name-only match. Settlement
 * entries are excluded from the corpus because they describe money movement
 * between members, not the subject of an expense. Categories not in
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
 * Tokenises a description for fuzzy matching: normalise, split on any run of
 * non-letter/non-number characters (Unicode-aware so accented words like
 * "caffè" stay intact), drop tokens shorter than 2 characters, and dedupe
 * while preserving first-seen order.
 */
export const tokenize = (s: string): string[] => {
  const normalized = normalizeDescription(s);
  const rawTokens = normalized.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2);
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
 * Generic category KEYS intentionally excluded from Stage 3 because they are
 * ambiguous across families — picking them via the name-fallback would be a
 * coin flip. Key-based (not label-based) so the exclusion is locale-proof.
 */
const isGenericKey = (key: string): boolean =>
  key.endsWith('-other') || key === 'general';

/**
 * Stage 3 — taxonomy-name fallback. Scans every category in `CATEGORY_BY_KEY`
 * and ranks non-generic categories by how completely their LOCALIZED label's
 * tokens (from `labels`, keyed by category key) are covered by the query
 * tokens (`qTokens`, already computed for Stage 2). A label qualifies whenever
 * at least one of its tokens appears in the query; full-name matches (every
 * label token covered) naturally outrank partial ones via the coverage ratio,
 * and ties are broken by category key (ASC) so the result is deterministic.
 * Confidence is the share of the label that the query explains — for a full
 * match this is 1, for a partial match it is `covered / labelTokens.length`
 * and therefore ≤ 1. Categories without an entry in `labels` are skipped, so
 * an empty map disables Stage 3 entirely.
 */
const suggestCategoryByName = (
  qTokens: readonly string[],
  labels: Readonly<Record<string, string>>,
): CategorySuggestion | null => {
  if (qTokens.length === 0) return null;

  const qTokenSet = new Set(qTokens);

  type Qualifier = { key: string; coveredTokenCount: number; ratio: number };
  const qualifiers: Qualifier[] = [];
  for (const def of CATEGORY_BY_KEY.values()) {
    if (isGenericKey(def.key)) continue;
    const label = labels[def.key];
    if (!label) continue;
    const labelTokens = tokenize(label);
    if (labelTokens.length === 0) continue;
    let covered = 0;
    for (const t of labelTokens) {
      if (qTokenSet.has(t)) covered++;
    }
    if (covered >= 1) {
      qualifiers.push({
        key: def.key,
        coveredTokenCount: covered,
        ratio: covered / labelTokens.length,
      });
    }
  }

  if (qualifiers.length === 0) return null;

  qualifiers.sort((a, b) => {
    if (b.ratio !== a.ratio) return b.ratio - a.ratio;
    if (b.coveredTokenCount !== a.coveredTokenCount) {
      return b.coveredTokenCount - a.coveredTokenCount;
    }
    if (a.key < b.key) return -1;
    if (a.key > b.key) return 1;
    return 0;
  });

  const winner = qualifiers[0];
  return { key: winner.key, confidence: winner.ratio };
};

/**
 * Suggests the most likely expense category for a description, learning from
 * the user's prior categorised expenses in the group. `labels` maps category
 * key → localized label for the ACTIVE locale (Stage 3 matches against it);
 * an empty map disables the taxonomy-name fallback. Returns `null` when no
 * candidate clears the configured thresholds.
 */
export const suggestCategory = (
  description: string,
  history: ReadonlyArray<CategoryLearningEntry>,
  labels: Readonly<Record<string, string>> = {},
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
  // Compute qTokens once and reuse in Stage 3 — do not early-return before
  // Stage 3 has had a chance to run.
  const qTokens = tokenize(norm);
  const q = new Set(qTokens);

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

  // Only emit a Stage 2 winner when there is at least one scored category
  // AND it clears both thresholds; otherwise fall through to Stage 3.
  if (scores.size > 0) {
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
  }

  // Stage 3: taxonomy-name fallback (history-first priority already enforced
  // by the Stages 1–2 short-circuits above).
  return suggestCategoryByName(qTokens, labels);
};
