import { describe, expect, it } from 'vitest';

import * as routerModule from '@/router';

describe('@/router exports (ADR-0030)', () => {
  it('no longer exports the one-shot `sharedGroup` hand-off', () => {
    // The expense / settle-up forms read the group data cache instead.
    expect(routerModule).not.toHaveProperty('sharedGroup');
    expect(routerModule).toHaveProperty('currentPageTitle');
  });
});
