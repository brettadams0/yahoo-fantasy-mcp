import test from 'node:test';
import assert from 'node:assert/strict';

import { checkKey, registerFantasyTools } from '../src/fantasy.js';
import {
  API_BASE,
  AUTH_ENDPOINT,
  TOKEN_ENDPOINT,
  REDIRECT_URI,
  createTokenStore,
  resolveApiUrl,
  yahooFetch,
} from '../src/auth.js';
import { REQUEST_TIMEOUT_MS, VERSION, fetchWithTimeout, responseError } from '../src/shared.js';

function collectTools() {
  const tools = new Map();
  registerFantasyTools({
    registerTool(name, config, handler) {
      tools.set(name, { name, config, handler });
    },
  });
  return tools;
}

test('registers all ten fantasy tools', () => {
  assert.equal(collectTools().size, 10);
});

test('tool names are unique and namespaced with yahoo_', () => {
  const names = [...collectTools().keys()];
  assert.equal(new Set(names).size, names.length, 'duplicate tool name');
  for (const name of names) {
    assert.match(name, /^yahoo_[a-z0-9_]+$/, `"${name}" is not namespaced`);
  }
});

test('every tool declares a title, description and input schema', () => {
  for (const { name, config } of collectTools().values()) {
    assert.ok(config.title?.trim(), `${name} has no title`);
    assert.ok(config.description?.trim(), `${name} has no description`);
    assert.ok(config.inputSchema, `${name} has no inputSchema`);
  }
});

// The raw escape hatch is the one tool that can reach any endpoint, so it must
// be described as such rather than looking like just another reader.
test('the raw passthrough tool is present and takes a path', () => {
  const raw = collectTools().get('yahoo_fantasy_raw_get');
  assert.ok(raw, 'yahoo_fantasy_raw_get is not registered');
  assert.ok(
    Object.keys(raw.config.inputSchema).length > 0,
    'raw tool accepts no arguments'
  );
});

// Yahoo issues the authorization code out-of-band: it displays the code for the
// user to paste rather than redirecting to a localhost listener, so there is no
// callback server to run. Changing this to a URL silently breaks consent.
test('the OAuth redirect stays out-of-band', () => {
  assert.equal(REDIRECT_URI, 'oob');
});

test('every Yahoo endpoint is HTTPS and on a yahoo domain', () => {
  for (const url of [API_BASE, AUTH_ENDPOINT, TOKEN_ENDPOINT]) {
    assert.match(url, /^https:\/\//, `${url} is not HTTPS`);
    assert.match(new URL(url).hostname, /(^|\.)yahoo(apis)?\.com$/, `${url} is off-domain`);
  }
});

test('the API base points at the v2 fantasy tree', () => {
  assert.match(API_BASE, /\/fantasy\/v2$/);
});

// ---------------------------------------------------------------------------
// Paths. Keys and the raw tool's path are interpolated into the URL, and URL
// resolution collapses "..", so every request is checked after resolution.

test('a path that resolves outside /fantasy/v2/ is refused', () => {
  for (const path of ['/../../oauth2/get_token', '/league/%2e%2e/%2e%2e/x', '/..', '/./../v1']) {
    assert.throws(() => resolveApiUrl(path), /Refusing a path outside \/fantasy\/v2\//, path);
  }
});

test('ordinary paths, including matrix parameters, resolve under /fantasy/v2/', () => {
  const url = resolveApiUrl('/users;use_login=1/games;game_keys=nfl/leagues');
  assert.equal(url.origin, 'https://fantasysports.yahooapis.com');
  assert.equal(url.pathname, '/fantasy/v2/users;use_login=1/games;game_keys=nfl/leagues');
});

test('a refused path never reaches the token', async () => {
  // No credentials exist in CI: reading the token would fail with "No token
  // found", so this error proves the check ran first.
  await assert.rejects(() => yahooFetch('/../../oauth'), /Refusing a path/);
});

test('the raw tool requires a leading slash and stays inside the API tree', async () => {
  const { handler } = collectTools().get('yahoo_fantasy_raw_get');
  await assert.rejects(() => handler({ path: 'league/nfl.l.1/settings' }), /must start with "\/"/);
  await assert.rejects(() => handler({ path: '/../../oauth2/request_auth' }), /Refusing a path/);
});

test('keys are checked for shape, with an example of the right one', () => {
  assert.equal(checkKey('game', 'nfl'), 'nfl');
  assert.equal(checkKey('game', '423'), '423');
  assert.equal(checkKey('league', 'nfl.l.12345'), 'nfl.l.12345');
  assert.equal(checkKey('team', '423.l.12345.t.3'), '423.l.12345.t.3');

  assert.throws(() => checkKey('league', 'My Dynasty League'), /not a league key; expected the form "nfl\.l\.12345"/);
  assert.throws(() => checkKey('league', '12345'), /not a league key/);
  assert.throws(() => checkKey('team', 'nfl.l.12345'), /not a team key/);
  assert.throws(() => checkKey('league', '..'), /not a league key/);
});

test('tools reject a malformed key before any request is made', async () => {
  const tools = collectTools();
  const calls = [
    ['yahoo_get_my_leagues', { gameKey: '../x' }],
    ['yahoo_get_league_standings', { leagueKey: '..' }],
    ['yahoo_get_team_roster', { teamKey: 'nfl.l.1' }],
  ];
  for (const [name, args] of calls) {
    await assert.rejects(() => tools.get(name).handler(args), /is not a (game|league|team) key/, name);
  }
});

// ---------------------------------------------------------------------------
// Token refresh. Yahoo rotates the refresh token on every use, so two
// refreshes racing with the same token would leave one of them holding a
// token that has already been spent.

test('parallel calls at expiry share a single refresh, and the rotated token is saved', async () => {
  const presented = [];
  const saved = [];
  const store = createTokenStore({
    load: async () => ({ access_token: 'old', refresh_token: 'r1', expires_at: Date.now() - 1000 }),
    save: async (t) => saved.push(t),
    refresh: async (t) => {
      presented.push(t.refresh_token);
      await new Promise((r) => setTimeout(r, 20));
      return { access_token: 'new', refresh_token: 'r2', expires_at: Date.now() + 3_600_000 };
    },
  });

  const results = await Promise.all(Array.from({ length: 4 }, () => store.accessToken()));
  assert.deepEqual(results, ['new', 'new', 'new', 'new']);
  assert.deepEqual(presented, ['r1'], 'the refresh token was presented more than once');
  assert.deepEqual(saved.map((t) => t.refresh_token), ['r2']);
});

test('the next refresh presents the rotated token, not the original', async () => {
  let now = Date.now();
  const presented = [];
  let n = 1;
  const store = createTokenStore({
    load: async () => ({ access_token: 'a0', refresh_token: 'r1', expires_at: now - 1 }),
    save: async () => {},
    refresh: async (t) => {
      presented.push(t.refresh_token);
      n += 1;
      // Expires immediately, so the following call has to refresh again.
      return { access_token: `a${n}`, refresh_token: `r${n}`, expires_at: Date.now() - 1 };
    },
  });
  await store.accessToken();
  await store.accessToken();
  assert.deepEqual(presented, ['r1', 'r2']);
});

test('a failed refresh is retried on the next call rather than cached', async () => {
  let attempt = 0;
  const store = createTokenStore({
    load: async () => ({ access_token: 'old', refresh_token: 'r1', expires_at: Date.now() - 1000 }),
    save: async () => {},
    refresh: async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('network down');
      return { access_token: 'new', refresh_token: 'r2', expires_at: Date.now() + 3_600_000 };
    },
  });
  await assert.rejects(() => store.accessToken(), /network down/);
  assert.equal(await store.accessToken(), 'new');
});

// ---------------------------------------------------------------------------
// Failure messages and the server's identity.

test('a 429 says how long to wait, and error bodies are bounded', async () => {
  const limited = await responseError(
    new Response('slow down', { status: 429, headers: { 'retry-after': '30' } }),
    'Yahoo Fantasy API',
    '/league/nfl.l.1/players'
  );
  assert.match(limited.message, /rate limit reached for \/league\/nfl\.l\.1\/players; retry after 30s/);

  const huge = await responseError(new Response('x'.repeat(50_000), { status: 500 }), 'Yahoo Fantasy API', '/x');
  assert.ok(huge.message.length < 700, `message is ${huge.message.length} chars`);
});

test('every request carries a timeout, and a timeout reads as one', async () => {
  const original = globalThis.fetch;
  try {
    let signal;
    globalThis.fetch = async (_url, init) => {
      signal = init.signal;
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    };
    await assert.rejects(
      () => fetchWithTimeout(`${API_BASE}/game/nfl`, {}, 'Yahoo Fantasy API'),
      new RegExp(`did not respond within ${REQUEST_TIMEOUT_MS / 1000}s`)
    );
    assert.ok(signal instanceof AbortSignal);
  } finally {
    globalThis.fetch = original;
  }
});

test('the server reports the version in package.json', async () => {
  const { readFile } = await import('node:fs/promises');
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(VERSION, pkg.version);
});
