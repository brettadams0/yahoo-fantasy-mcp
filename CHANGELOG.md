# Changelog

Notable changes to this server. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The version is the
server's, as reported to clients in `initialize`; the tool surface itself is
recorded in [`mcp-surface.json`](mcp-surface.json).

## [1.1.0] — 2026-10-16

### Fixed

- Token refresh is single-flight. Yahoo rotates the refresh token on every
  use, so parallel tool calls that found the token expired each presented the
  same refresh token; all but one failed with `invalid_grant`, and the token
  left on disk could be one that had already been spent.
- The rotated token is persisted before it is used.

### Security

- Every request is checked, after URL resolution, to stay inside
  `/fantasy/v2/` — before the token is read. A league key of `..`, or a raw
  path of `/../../oauth2/…` (or its `%2e%2e` form), used to escape it with the
  bearer token attached.
- `yahoo_fantasy_raw_get` enforces the leading `/` its description asks for.
- `credentials/token.json` is set to owner-only (0600) on every write,
  including one left world-readable by 1.0.0.
- Dependencies raised to clear every open `npm audit` advisory, including a
  critical one in `proxy-addr` and a high one in the MCP SDK's OAuth client.

### Changed

- Game, league and team keys are checked for shape, with an example of the
  right one in the error, instead of producing Yahoo's opaque 400.
- Every request has a 30-second timeout; error bodies are trimmed, and a 429
  says when to retry.
- Tool results are compact JSON rather than indented.
- The server reports the version from `package.json`.

### Added

- `mcp-surface.json` and a CI step that fails when the tool surface drifts
  from it. ESLint, Dependabot, Node 24 in the CI matrix.

## [1.0.0] — 2026-07-28

First public release: 10 read-only tools, offline tests and CI.

[1.1.0]: https://github.com/brettadams0/yahoo-fantasy-mcp/compare/32446b8...HEAD
[1.0.0]: https://github.com/brettadams0/yahoo-fantasy-mcp/tree/32446b8
