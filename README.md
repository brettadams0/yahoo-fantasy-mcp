# yahoo-fantasy-mcp

An MCP server over Yahoo Fantasy Sports, backed by a self-owned Yahoo Developer
OAuth2 app. Read-only — it reports on leagues, rosters, and matchups but does not
set lineups or make transactions.

Runs over stdio, registered in `~/.claude.json` as `yahoo-fantasy`.

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
Use it when a typed tool doesn't cover what you need.

## Auth

OAuth2 with a refresh token in `credentials/token.json` (gitignored). Yahoo
**does** rotate refresh tokens on use, so the stored token is rewritten after each
refresh — meaning `credentials/` must be writable, and restoring an old backup of
it will fail with an invalid-grant error rather than working.

```bash
npm run authorize    # one-time browser consent
npm run check-auth   # verify the stored token still works
```

## Layout

```
src/auth.js            token load, rotate-on-refresh, caching
src/fantasy.js         all tool registrations
src/index.js           McpServer construction + stdio transport
scripts/authorize.js   one-time OAuth consent flow
scripts/check-token.js token health check
```

## Notes

- Yahoo's resource keys are positional and awkward: a league key looks like
  `nfl.l.123456`, a team key like `nfl.l.123456.t.7`. `yahoo_get_my_leagues` is
  the reliable way to discover the keys the other tools need.
- The API returns XML-shaped JSON with numeric-string object keys and `count`
  fields rather than plain arrays. Responses are passed through as-is, so expect
  that structure rather than idiomatic JSON.
