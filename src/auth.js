import { chmod, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchWithTimeout, responseError } from './shared.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const CREDENTIALS_DIR = path.join(__dirname, '..', 'credentials');
export const CLIENT_SECRET_PATH = path.join(CREDENTIALS_DIR, 'client_secret.json');
export const TOKEN_PATH = path.join(CREDENTIALS_DIR, 'token.json');

export const REDIRECT_URI = 'oob'; // out-of-band: Yahoo shows the code on-screen instead of redirecting
export const AUTH_ENDPOINT = 'https://api.login.yahoo.com/oauth2/request_auth';
export const TOKEN_ENDPOINT = 'https://api.login.yahoo.com/oauth2/get_token';
export const API_BASE = 'https://fantasysports.yahooapis.com/fantasy/v2';

export async function loadClientSecret() {
  const raw = await readFile(CLIENT_SECRET_PATH, 'utf-8').catch(() => {
    throw new Error(
      `Missing ${CLIENT_SECRET_PATH}. Create it with {"client_id": "...", "client_secret": "..."} from https://developer.yahoo.com/apps/`
    );
  });
  return JSON.parse(raw);
}

export function basicAuthHeader(clientId, clientSecret) {
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

/**
 * Hand out access tokens, refreshing shortly before expiry.
 *
 * Yahoo rotates the refresh token on every use, which makes concurrency
 * matter: clients call tools in parallel, and two calls that both found the
 * token expired would both present the same refresh token. The first spends
 * it; the second gets invalid_grant, and the run of calls fails until someone
 * re-authorizes. Concurrent callers therefore share one refresh. The storage
 * and the refresh itself are injected so this can be tested without
 * credentials or a network.
 */
/**
 * Write the token file readable by its owner only. `writeFile`'s `mode` applies
 * only when it creates the file, so a token.json left at 0644 by an earlier
 * version is tightened explicitly.
 */
export async function saveToken(token) {
  await writeFile(TOKEN_PATH, JSON.stringify(token, null, 2), { mode: 0o600 });
  await chmod(TOKEN_PATH, 0o600);
}

export function createTokenStore({ load, save, refresh, skewMs = 60_000 }) {
  let token = null;
  let loading = null;
  let pending = null;

  return {
    async accessToken() {
      // The first load is shared too, so a slow read can't put back a token
      // another caller has already refreshed and spent. A failed load is not
      // cached.
      loading ??= load().catch((err) => {
        loading = null;
        throw err;
      });
      token ??= await loading;
      if (Date.now() >= token.expires_at - skewMs) {
        pending ??= (async () => {
          const next = await refresh(token);
          // The old refresh token is spent the moment Yahoo answers, so the
          // new one is used from here on even if saving it fails.
          token = next;
          await save(next);
        })().finally(() => {
          pending = null;
        });
        await pending;
      }
      return token.access_token;
    },
  };
}

async function refreshWithYahoo(current) {
  const { client_id, client_secret } = await loadClientSecret();
  const res = await fetchWithTimeout(
    TOKEN_ENDPOINT,
    {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(client_id, client_secret),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', redirect_uri: REDIRECT_URI, refresh_token: current.refresh_token }),
    },
    'Yahoo token endpoint'
  );
  if (!res.ok) throw await responseError(res, 'Yahoo token refresh', TOKEN_ENDPOINT);
  const data = await res.json();
  if (typeof data.access_token !== 'string' || !Number.isFinite(data.expires_in)) {
    throw new Error(`Yahoo token refresh failed: ${data.error ?? 'no access_token in the response'}`);
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? current.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

const tokens = createTokenStore({
  load: async () => {
    const raw = await readFile(TOKEN_PATH, 'utf-8').catch(() => {
      throw new Error(`No token found at ${TOKEN_PATH}. Run "npm run authorize" first.`);
    });
    return JSON.parse(raw);
  },
  save: saveToken,
  refresh: refreshWithYahoo,
});

export const getAccessToken = () => tokens.accessToken();

/**
 * Every request must stay inside /fantasy/v2/. Paths are assembled from tool
 * arguments, and URL resolution collapses "..", "%2e%2e" and friends, so the
 * check is made on the resolved URL rather than by inspecting the string. It
 * runs before the token is read, so a bad path never travels with one.
 */
export function resolveApiUrl(pathname) {
  const base = new URL(API_BASE);
  const url = new URL(`${API_BASE}${pathname}`);
  if (url.origin !== base.origin || !url.pathname.startsWith(`${base.pathname}/`)) {
    throw new Error(`Refusing a path outside ${base.pathname}/: ${JSON.stringify(pathname)}`);
  }
  return url;
}

export async function yahooFetch(pathname, { query } = {}) {
  const url = resolveApiUrl(pathname);
  const accessToken = await getAccessToken();
  url.searchParams.set('format', 'json');
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }

  const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${accessToken}` } }, 'Yahoo Fantasy API');
  if (!res.ok) throw await responseError(res, 'Yahoo Fantasy API', pathname);
  return res.json();
}
