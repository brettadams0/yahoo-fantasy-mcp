# yahoo-fantasy-mcp

[![CI](https://github.com/brettadams0/yahoo-fantasy-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/brettadams0/yahoo-fantasy-mcp/actions/workflows/ci.yml)
[![Surface checked by mcp-surface](https://img.shields.io/badge/surface-mcp--surface-7c3aed.svg)](https://github.com/brettadams0/mcp-surface)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen.svg)](package.json)

An [MCP](https://modelcontextprotocol.io) server over Yahoo Fantasy Sports, backed by a self-owned Yahoo Developer
OAuth2 app. Read-only — it reports on leagues, rosters, and matchups but does not
set lineups or make transactions.

10 tools. Runs locally over stdio.

## Tools

| Tool | Purpose |
|---|---|
| `yahoo_get_my_games` | Fantasy games (NFL, NBA, MLB, NHL) the account has played |
| `yahoo_get_my_leagues` | Leagues for the account, optionally filtered by game |
| `yahoo_get_league_settings` | Scoring rules, roster slots, league configuration |
| `yahoo_get_league_standings` | Current standings with W/L/T and points |
| `yahoo_get_league_transactions` | Adds, drops, and trades |
| `yahoo_get_scoreboard` | Matchups and scores for a given week |
| `yahoo_get_team_roster` | A team's roster, optionally for a specific week |
| `yahoo_get_team_matchups` | A team's full matchup history |
| `yahoo_search_league_players` | Player search within a league, with filters |
| `yahoo_fantasy_raw_get` | Escape hatch — arbitrary path against the Fantasy API |

`yahoo_fantasy_raw_get` exists because Yahoo's API surface is much wider than the
typed tools above, and its response shapes are too irregular to wrap exhaustively.
Use it when a typed tool doesn't cover what you need. Every tool is annotated
`readOnlyHint: true`, so a client can approve them without prompting.

The exact schemas the model sees are in [`mcp-surface.json`](mcp-surface.json).

## Design notes

### A rotating refresh token makes parallel calls dangerous

Yahoo issues a new refresh token on every refresh and retires the old one.
Clients call tools in parallel, so when the access token expires, several calls
can find it expired at the same moment. If each refreshed on its own, they would
all present the same refresh token: the first would succeed and spend it, the
rest would get `invalid_grant`, and depending on which write landed last, the
token on disk could be the dead one — a failure that only shows up an hour
later, as an inexplicable need to re-authorize.

Refresh is therefore single-flight: concurrent callers wait on one refresh, and
the rotated token is written to disk before anything uses it. The token store
takes its storage and its refresh function as parameters, which is what lets the
tests drive four parallel calls through an expiry and assert the refresh token
was presented exactly once.

### Every request stays inside `/fantasy/v2/`

League and team keys are interpolated into the request path, and the raw tool
takes a path outright. URL resolution collapses `..` — and `%2e%2e` — so the
check is made on the *resolved* URL, before the token is read: a path that
would land outside `/fantasy/v2/` is refused, and never travels with a bearer
token. Keys are also checked for shape, so passing a league's *name* where its
key belongs gets an error showing what a key looks like, instead of Yahoo's
opaque 400.

## Auth

OAuth2 with a refresh token in `credentials/token.json` (gitignored). Yahoo
**does** rotate refresh tokens on use, so the stored token is rewritten after each
refresh — meaning `credentials/` must be writable, and restoring an old backup of
it will fail with an invalid-grant error rather than working.

```bash
npm run authorize    # one-time browser consent
npm run check-auth   # verify the stored token still works
```

The token file is kept owner-readable only (0600).

## Setup

Requires Node 20+.

1. Create an app at [developer.yahoo.com/apps](https://developer.yahoo.com/apps/)
   with **Fantasy Sports → Read** permission. Set the redirect URI to **OOB**
   (out-of-band): Yahoo displays the code on screen instead of redirecting, so
   there is no callback server to run.
2. Save the id and secret to `credentials/client_secret.json` — see
   `credentials/client_secret.example.json`. `credentials/` is git-ignored.
3. Authorize and register:

   ```bash
   npm ci
   npm run authorize
   claude mcp add yahoo-fantasy -- node /absolute/path/to/yahoo-fantasy-mcp/src/index.js
   ```

   Or in Claude Desktop's `claude_desktop_config.json`:

   ```json
   {
     "mcpServers": {
       "yahoo-fantasy": {
         "command": "node",
         "args": ["/absolute/path/to/yahoo-fantasy-mcp/src/index.js"]
       }
     }
   }
   ```

## Development

```bash
npm test               # unit tests — no network, no credentials
npm run lint           # ESLint
npm run surface        # start the server and diff its tool surface against mcp-surface.json
npm run surface:update # re-record mcp-surface.json after an intended change
```

The tests cover registration, the OAuth constants that silently break consent
if changed (notably the out-of-band redirect), path resolution and key shapes,
single-flight refresh with rotation, and rate-limit and timeout messages. CI runs
them on Node 20, 22 and 24, then starts the server with
[mcp-surface](https://github.com/brettadams0/mcp-surface) and fails if the tool
surface differs from the committed snapshot.

## Layout

```
src/shared.js          version, timeouts, error shaping, tool-result helpers
src/auth.js            token load, single-flight rotate-on-refresh, path guard
src/fantasy.js         key validation and all tool registrations
src/index.js           McpServer construction + stdio transport
scripts/authorize.js   one-time OAuth consent flow
scripts/check-token.js token health check
mcp-surface.json       the committed tool surface CI compares against
```

## Notes

- Yahoo's resource keys are positional and awkward: a league key looks like
  `nfl.l.123456`, a team key like `nfl.l.123456.t.7`. `yahoo_get_my_leagues` is
  the reliable way to discover the keys the other tools need.
- The API returns XML-shaped JSON with numeric-string object keys and `count`
  fields rather than plain arrays. Responses are passed through as-is, so expect
  that structure rather than idiomatic JSON. They are sent compact, not
  indented — Yahoo's nesting makes indentation a large share of the tokens.
- Every request has a 30-second timeout, error bodies are trimmed before they
  reach the model, and a 429 says when to retry.

## License

MIT — see [LICENSE](LICENSE). Changes are recorded in [CHANGELOG.md](CHANGELOG.md).
