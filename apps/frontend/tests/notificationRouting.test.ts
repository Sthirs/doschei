import { describe, expect, it } from 'vitest';
import { groupIdFromPushUrl, resolveNotificationClick } from '@/lib/notificationRouting';

describe('resolveNotificationClick', () => {
  it('focuses an already-open client whose pathname matches the target URL', () => {
    const client = { url: 'https://doschei.example/groups/abc' };
    const result = resolveNotificationClick([{ url: 'https://doschei.example/groups' }, client], '/groups/abc');

    expect(result).toEqual({ type: 'focus', client });
  });

  it('opens a new window when no open client matches the target URL', () => {
    const result = resolveNotificationClick(
      [{ url: 'https://doschei.example/groups' }],
      '/groups/abc',
    );

    expect(result).toEqual({ type: 'open', url: '/groups/abc' });
  });

  it('opens a new window when there are no open clients at all', () => {
    const result = resolveNotificationClick([], '/groups/abc');

    expect(result).toEqual({ type: 'open', url: '/groups/abc' });
  });

  it('ignores a client whose URL cannot be parsed instead of throwing', () => {
    const client = { url: 'https://doschei.example/groups/abc' };
    const result = resolveNotificationClick([{ url: 'not-a-url' }, client], '/groups/abc');

    expect(result).toEqual({ type: 'focus', client });
  });

  it('matches on pathname only, ignoring query string and origin', () => {
    const client = { url: 'https://other-origin.example/groups/abc?ref=push' };
    const result = resolveNotificationClick([client], '/groups/abc');

    expect(result).toEqual({ type: 'focus', client });
  });
});

describe('groupIdFromPushUrl (ADR-0030)', () => {
  it.each([
    ['/groups/abc', 'abc'],
    ['/groups/abc/', 'abc'],
    ['/groups/abc?x=1', 'abc'],
    ['/groups/abc#frag', 'abc'],
    ['https://doschei.example/groups/abc', 'abc'],
    ['/groups/abc/expenses/new', 'abc'],
    ['/groups/a%20b', 'a b'],
  ])('%s → %s', (url, expected) => {
    expect(groupIdFromPushUrl(url)).toBe(expected);
  });

  it.each([['/'], ['/groups'], ['/groups/'], ['/account'], [''], ['/groupsabc'], [undefined], [null], [42]])(
    '%s → null',
    (url) => {
      expect(groupIdFromPushUrl(url)).toBeNull();
    },
  );
});
