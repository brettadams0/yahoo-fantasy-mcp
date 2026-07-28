import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

function basicAuthHeader(clientId, clientSecret) {
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

async function persistToken(token) {
  await writeFile(TOKEN_PATH, JSON.stringify(token, null, 2));
}

async function refresh(clientId, clientSecret, refreshToken) {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: basicAuthHeader(clientId, clientSecret), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', redirect_uri: REDIRECT_URI, refresh_token: refreshToken }),
  });
  if (!res.ok) {
    throw new Error(`Yahoo token refresh failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const token = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? refreshToken,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  await persistToken(token);
  return token;
}

let cachedToken = null;

export async function getAccessToken() {
  const { client_id, client_secret } = await loadClientSecret();

  if (!cachedToken) {
    const raw = await readFile(TOKEN_PATH, 'utf-8').catch(() => {
      throw new Error(`No token found at ${TOKEN_PATH}. Run "npm run authorize" first.`);
    });
    cachedToken = JSON.parse(raw);
  }

  if (Date.now() > cachedToken.expires_at - 60_000) {
    cachedToken = await refresh(client_id, client_secret, cachedToken.refresh_token);
  }

  return cachedToken.access_token;
}

export async function yahooFetch(pathname, { query } = {}) {
  const accessToken = await getAccessToken();
  const url = new URL(`${API_BASE}${pathname}`);
  url.searchParams.set('format', 'json');
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    throw new Error(`Yahoo Fantasy API error ${res.status} for ${pathname}: ${await res.text()}`);
  }
  return res.json();
}
