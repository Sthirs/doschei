/**
 * Unit tests for `notificationMessages.ts` (ADR-0025's server-side
 * localization exception to ADR-0018). Pure functions, no mocks needed.
 */
import { describe, expect, it } from 'vitest';

import { renderNotification } from '../../src/services/push/notificationMessages';

const baseParams = {
  actorName: 'Alice',
  groupName: 'Trip to Rome',
  description: 'Dinner',
  amount: 42.5,
  url: '/groups/g1',
};

describe('renderNotification', () => {
  it('renders English copy for language "en"', () => {
    const { title, body } = renderNotification(
      'expense.created',
      'en',
      baseParams,
    );
    expect(title).toBe('Trip to Rome');
    expect(body).toContain('Alice');
    expect(body).toContain('Dinner');
    expect(body).toMatch(/€|EUR/);
  });

  it('renders Italian copy for language "it"', () => {
    const { body } = renderNotification(
      'expense.created',
      'it',
      baseParams,
    );
    expect(body).toContain('ha aggiunto');
    expect(body).toContain('Dinner');
  });

  it('falls back to English for an unrecognized language', () => {
    const en = renderNotification('expense.updated', 'en', baseParams);
    const unknown = renderNotification('expense.updated', 'fr', baseParams);
    expect(unknown).toEqual(en);
  });

  it('renders every notification kind without throwing', () => {
    const kinds = [
      'expense.created',
      'expense.updated',
      'expense.deleted',
      'settlement.created',
      'settlement.updated',
      'settlement.deleted',
      'invitation.created',
    ] as const;

    for (const kind of kinds) {
      for (const language of ['en', 'it']) {
        const { title, body } = renderNotification(kind, language, baseParams);
        expect(title.length).toBeGreaterThan(0);
        expect(body.length).toBeGreaterThan(0);
      }
    }
  });

  it('omits the amount placeholder gracefully when amount is undefined', () => {
    const { body } = renderNotification('invitation.created', 'en', {
      ...baseParams,
      amount: undefined,
    });
    expect(body).toContain('Alice');
    expect(body).toContain('Trip to Rome');
  });
});
