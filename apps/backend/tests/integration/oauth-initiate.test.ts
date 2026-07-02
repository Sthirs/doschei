import { baseUrl, ensureBackendAvailable } from './helpers/api';

// Env guard: skip when OAuth is not configured (CI on forks etc.). The
// backend reads a single OAUTH_CONFIG JSON env var (parsed by Zod into
// an object with { clientId, clientSecret, issuerUrl, enabled, ... }).
const oauthConfigRaw = process.env.OAUTH_CONFIG;
let hasOAuthConfig = false;
let issuerOrigin = '';
if (oauthConfigRaw) {
  try {
    const parsed = JSON.parse(oauthConfigRaw) as {
      enabled?: boolean;
      issuerUrl?: string;
      buttonText?: string;
      autoLaunch?: boolean;
    };
    hasOAuthConfig =
      parsed.enabled === true &&
      Boolean(process.env.OAUTH_STATE_SECRET) &&
      typeof parsed.issuerUrl === 'string';
    if (hasOAuthConfig && parsed.issuerUrl) {
      issuerOrigin = new URL(parsed.issuerUrl).origin;
    }
  } catch {
    hasOAuthConfig = false;
  }
}

(hasOAuthConfig ? describe : describe.skip)('GET /api/auth/oauth', () => {
  beforeAll(async () => {
    await ensureBackendAvailable();
  });

  it('returns a 302 redirect to the configured issuer with correct OAuth params', async () => {
    const res = await fetch(`${baseUrl}/api/auth/oauth`, { redirect: 'manual' });

    expect(res.status).toBe(302);

    const location = res.headers.get('location')!;
    expect(location).toBeTruthy();

    // The authorization endpoint is discovered from the configured
    // issuer via OIDC discovery. We assert the Location starts with the
    // issuer's origin (the path varies by provider — Google uses
    // `/o/oauth2/v2/auth`, Dex uses `/auth`, etc.).
    expect(location.startsWith(issuerOrigin)).toBe(true);

    const searchParams = new URL(location).searchParams;
    expect(searchParams.get('client_id')).toBeTruthy();
    expect(searchParams.get('redirect_uri')).toBeTruthy();
    expect(searchParams.get('code_challenge')).toBeTruthy();
    expect(searchParams.get('code_challenge_method')).toBe('S256');
    expect(searchParams.get('state')).toBeTruthy();
    expect(searchParams.get('scope')).toBeTruthy();
    expect(searchParams.get('response_type')).toBe('code');

    // Assert the state cookie is set
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('doschei.oauth.state=');
    expect(setCookie).toContain('HttpOnly');
  });

  it('GET /api/auth/oauth/config → 200 with { enabled, buttonText, autoLaunch }', async () => {
    const res = await fetch(`${baseUrl}/api/auth/oauth/config`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      enabled: boolean;
      buttonText: string;
      autoLaunch: boolean;
    };
    expect(body.enabled).toBe(true);
    expect(typeof body.buttonText).toBe('string');
    expect(typeof body.autoLaunch).toBe('boolean');
  });
});
