import test from 'node:test';
import assert from 'node:assert/strict';

import { registerFantasyTools } from '../src/fantasy.js';
import {
  API_BASE,
  AUTH_ENDPOINT,
  TOKEN_ENDPOINT,
  REDIRECT_URI,
} from '../src/auth.js';

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
