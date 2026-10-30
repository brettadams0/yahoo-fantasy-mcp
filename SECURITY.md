# Security

This server holds an OAuth refresh token with read access to the Yahoo Fantasy
Sports data of the account that authorized it. It has no write tools.

## Threat model

The caller is your own MCP client, but the *arguments* come from a model, and a
model can be steered by text it has read. The server treats every argument as
untrusted input: keys are checked for shape, and every request is verified —
after URL resolution, before the token is read — to stay inside
`/fantasy/v2/`, so no argument can point the bearer token at another endpoint.

Credentials live in `credentials/`, which is git-ignored, and CI fails if a
real credential file is ever tracked. To revoke access, remove the app at
[developer.yahoo.com/apps](https://developer.yahoo.com/apps/).

## Reporting a vulnerability

Please email **adamsbrett00@gmail.com** rather than opening a public issue.
You'll get a reply within a few days.
