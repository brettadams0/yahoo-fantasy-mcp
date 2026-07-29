import { z } from 'zod';
import { yahooFetch } from './auth.js';

function json(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

// Yahoo's three key formats nest inside each other, and mixing them up is the
// usual cause of an opaque 400 — a team key is a league key plus ".t.<id>".
// Spelling out the shape is worth more to a caller than the type alone.
const GAME_KEY = z
  .string()
  .describe('Game key: a sport code like "nfl", "nba", "mlb", "nhl", or a season-specific numeric code like "423". Use yahoo_get_my_games to list valid values.');

const LEAGUE_KEY = z
  .string()
  .describe('League key in the form "<game>.l.<id>", e.g. "nfl.l.12345". Get it from yahoo_get_my_leagues — it is not the league name or the numeric id alone.');

const TEAM_KEY = z
  .string()
  .describe('Team key in the form "<game>.l.<league id>.t.<team id>", e.g. "nfl.l.12345.t.3". This is a league key with ".t.<team id>" appended.');

const WEEK = z
  .number()
  .int()
  .optional()
  .describe('Week number within the season (1-based). Omit for the current week.');

export function registerFantasyTools(server) {
  server.registerTool(
    'yahoo_get_my_games',
    {
      title: 'List your fantasy games',
      annotations: { readOnlyHint: true, openWorldHint: true },
      description: 'Lists every fantasy sport/season (NFL, NBA, MLB, NHL, across years) the logged-in Yahoo account has played.',
      inputSchema: {},
    },
    async () => json(await yahooFetch('/users;use_login=1/games'))
  );

  server.registerTool(
    'yahoo_get_my_leagues',
    {
      title: 'List your leagues for a game',
      annotations: { readOnlyHint: true, openWorldHint: true },
      description: 'Lists the leagues the account belongs to for a given game key (e.g. "nfl", "nba", "mlb", "nhl", or a year-specific code).',
      inputSchema: { gameKey: GAME_KEY },
    },
    async ({ gameKey }) => json(await yahooFetch(`/users;use_login=1/games;game_keys=${encodeURIComponent(gameKey)}/leagues`))
  );

  server.registerTool(
    'yahoo_get_league_standings',
    {
      title: 'Get league standings',
      annotations: { readOnlyHint: true, openWorldHint: true },
      description: 'Current standings for a league.',
      inputSchema: { leagueKey: LEAGUE_KEY },
    },
    async ({ leagueKey }) => json(await yahooFetch(`/league/${encodeURIComponent(leagueKey)}/standings`))
  );

  server.registerTool(
    'yahoo_get_league_settings',
    {
      title: 'Get league settings',
      annotations: { readOnlyHint: true, openWorldHint: true },
      description: 'Scoring rules, roster positions, and other settings for a league.',
      inputSchema: { leagueKey: LEAGUE_KEY },
    },
    async ({ leagueKey }) => json(await yahooFetch(`/league/${encodeURIComponent(leagueKey)}/settings`))
  );

  server.registerTool(
    'yahoo_get_scoreboard',
    {
      title: 'Get league scoreboard',
      annotations: { readOnlyHint: true, openWorldHint: true },
      description: "Matchup scores for a league, optionally for a specific week.",
      inputSchema: { leagueKey: LEAGUE_KEY, week: WEEK },
    },
    async ({ leagueKey, week }) => json(await yahooFetch(`/league/${encodeURIComponent(leagueKey)}/scoreboard`, { query: { week } }))
  );

  server.registerTool(
    'yahoo_get_league_transactions',
    {
      title: 'Get league transactions',
      annotations: { readOnlyHint: true, openWorldHint: true },
      description: 'Recent adds/drops/trades in a league.',
      inputSchema: { leagueKey: LEAGUE_KEY },
    },
    async ({ leagueKey }) => json(await yahooFetch(`/league/${encodeURIComponent(leagueKey)}/transactions`))
  );

  server.registerTool(
    'yahoo_search_league_players',
    {
      title: 'Search players in a league',
      annotations: { readOnlyHint: true, openWorldHint: true },
      description: 'Searches the player pool for a league by name.',
      inputSchema: { leagueKey: LEAGUE_KEY, query: z.string().describe('Player name or partial name to search for, e.g. "Mahomes".') },
    },
    async ({ leagueKey, query }) => json(await yahooFetch(`/league/${encodeURIComponent(leagueKey)}/players`, { query: { search: query } }))
  );

  server.registerTool(
    'yahoo_get_team_roster',
    {
      title: 'Get a team roster',
      annotations: { readOnlyHint: true, openWorldHint: true },
      description: "A team's roster, optionally for a specific week.",
      inputSchema: { teamKey: TEAM_KEY, week: WEEK },
    },
    async ({ teamKey, week }) => json(await yahooFetch(`/team/${encodeURIComponent(teamKey)}/roster`, { query: { week } }))
  );

  server.registerTool(
    'yahoo_get_team_matchups',
    {
      title: 'Get a team\'s matchups',
      annotations: { readOnlyHint: true, openWorldHint: true },
      description: "A team's full schedule of matchups and results for the season.",
      inputSchema: { teamKey: TEAM_KEY },
    },
    async ({ teamKey }) => json(await yahooFetch(`/team/${encodeURIComponent(teamKey)}/matchups`))
  );

  server.registerTool(
    'yahoo_fantasy_raw_get',
    {
      title: 'Raw Yahoo Fantasy API GET',
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        'Escape hatch: GET any Yahoo Fantasy Sports API path (under /fantasy/v2/) not covered by a dedicated tool, e.g. "/league/{key}/draftresults". Read-only.',
      inputSchema: { path: z.string().describe('Path after /fantasy/v2, must start with /') },
    },
    async ({ path }) => json(await yahooFetch(path))
  );
}
