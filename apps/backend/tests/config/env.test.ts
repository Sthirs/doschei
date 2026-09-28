/**
 * Unit tests for the VAPID_AUTO_GENERATE fallback in `config/env.ts`. It
 * exists so Minikube/CI never need a committed VAPID keypair (see
 * `helm/doschei/templates/backend-secret.yaml` and ADR-0025) — each test
 * resets modules and re-imports `env` after stubbing `process.env` so the
 * module-level parsing in `env.ts` runs fresh.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('VAPID_AUTO_GENERATE', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('mints a well-formed keypair and enables push when no real keypair is configured', async () => {
    vi.stubEnv('VAPID_AUTO_GENERATE', 'true');
    vi.stubEnv('VAPID_PUBLIC_KEY', '');
    vi.stubEnv('VAPID_PRIVATE_KEY', '');

    const { env } = await import('../../src/config/env');

    expect(env.pushEnabled).toBe(true);
    expect(env.VAPID_PUBLIC_KEY).toBeTruthy();
    expect(env.VAPID_PRIVATE_KEY).toBeTruthy();
  });

  it('leaves push disabled when unset, same as today', async () => {
    vi.stubEnv('VAPID_AUTO_GENERATE', '');
    vi.stubEnv('VAPID_PUBLIC_KEY', '');
    vi.stubEnv('VAPID_PRIVATE_KEY', '');

    const { env } = await import('../../src/config/env');

    expect(env.pushEnabled).toBe(false);
    expect(env.VAPID_PUBLIC_KEY).toBeUndefined();
    expect(env.VAPID_PRIVATE_KEY).toBeUndefined();
  });

  it('never overrides an explicitly configured keypair', async () => {
    vi.stubEnv('VAPID_AUTO_GENERATE', 'true');
    vi.stubEnv('VAPID_PUBLIC_KEY', 'configured-public-key');
    vi.stubEnv('VAPID_PRIVATE_KEY', 'configured-private-key');

    const { env } = await import('../../src/config/env');

    expect(env.pushEnabled).toBe(true);
    expect(env.VAPID_PUBLIC_KEY).toBe('configured-public-key');
    expect(env.VAPID_PRIVATE_KEY).toBe('configured-private-key');
  });
});

describe('NODE_ENV', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ADR-0029: an unset NODE_ENV must get the secure (production) behaviour;
  // every development entry point sets `development` explicitly.
  it('defaults to production when unset', async () => {
    vi.stubEnv('NODE_ENV', undefined);

    const { env } = await import('../../src/config/env');

    expect(env.NODE_ENV).toBe('production');
  });

  it('keeps an explicit development value', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const { env } = await import('../../src/config/env');

    expect(env.NODE_ENV).toBe('development');
  });
});
