import { z } from 'zod';
import { yahooFetch } from './auth.js';

function json(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export function registerFantasyTools(server) {
  server.registerTool(
    'yahoo_get_my_games',
    {
      title: 'List your fantasy games',
      description: 'Lists every fantasy sport/season (NFL, NBA, MLB, NHL, across years) the logged-in Yahoo account has played.',
      inputSchema: {},
    },
    async () => json(await yahooFetch('/users;use_login=1/games'))
  );

  server.registerTool(
    'yahoo_get_my_leagues',
    {
      title: 'List your leagues for a game',
      description: 'Lists the leagues the account belongs to for a given game key (e.g. "nfl", "nba", "mlb", "nhl", or a year-specific code).',
      inputSchema: { gameKey: z.string() },
    },
    async ({ gameKey }) => json(await yahooFetch(`/users;use_login=1/games;game_keys=${encodeURIComponent(gameKey)}/leagues`))
  );

  server.registerTool(
    'yahoo_get_league_standings',
    {
      title: 'Get league standings',
      description: 'Current standings for a league.',
      inputSchema: { leagueKey: z.string() },
    },
    async ({ leagueKey }) => json(await yahooFetch(`/league/${encodeURIComponent(leagueKey)}/standings`))
  );

  server.registerTool(
    'yahoo_get_league_settings',
    {
      title: 'Get league settings',
      description: 'Scoring rules, roster positions, and other settings for a league.',
      inputSchema: { leagueKey: z.string() },
    },
    async ({ leagueKey }) => json(await yahooFetch(`/league/${encodeURIComponent(leagueKey)}/settings`))
  );

  server.registerTool(
    'yahoo_get_scoreboard',
    {
      title: 'Get league scoreboard',
      description: "Matchup scores for a league, optionally for a specific week.",
      inputSchema: { leagueKey: z.string(), week: z.number().int().optional() },
    },
    async ({ leagueKey, week }) => json(await yahooFetch(`/league/${encodeURIComponent(leagueKey)}/scoreboard`, { query: { week } }))
  );

  server.registerTool(
    'yahoo_get_league_transactions',
    {
      title: 'Get league transactions',
      description: 'Recent adds/drops/trades in a league.',
      inputSchema: { leagueKey: z.string() },
    },
    async ({ leagueKey }) => json(await yahooFetch(`/league/${encodeURIComponent(leagueKey)}/transactions`))
  );

  server.registerTool(
    'yahoo_search_league_players',
    {
      title: 'Search players in a league',
      description: 'Searches the player pool for a league by name.',
      inputSchema: { leagueKey: z.string(), query: z.string() },
    },
    async ({ leagueKey, query }) => json(await yahooFetch(`/league/${encodeURIComponent(leagueKey)}/players`, { query: { search: query } }))
  );

  server.registerTool(
    'yahoo_get_team_roster',
    {
      title: 'Get a team roster',
      description: "A team's roster, optionally for a specific week.",
      inputSchema: { teamKey: z.string(), week: z.number().int().optional() },
    },
    async ({ teamKey, week }) => json(await yahooFetch(`/team/${encodeURIComponent(teamKey)}/roster`, { query: { week } }))
  );

  server.registerTool(
    'yahoo_get_team_matchups',
    {
      title: 'Get a team\'s matchups',
      description: "A team's full schedule of matchups and results for the season.",
      inputSchema: { teamKey: z.string() },
    },
    async ({ teamKey }) => json(await yahooFetch(`/team/${encodeURIComponent(teamKey)}/matchups`))
  );

  server.registerTool(
    'yahoo_fantasy_raw_get',
    {
      title: 'Raw Yahoo Fantasy API GET',
      description:
        'Escape hatch: GET any Yahoo Fantasy Sports API path (under /fantasy/v2/) not covered by a dedicated tool, e.g. "/league/{key}/draftresults". Read-only.',
      inputSchema: { path: z.string().describe('Path after /fantasy/v2, must start with /') },
    },
    async ({ path }) => json(await yahooFetch(path))
  );
}
