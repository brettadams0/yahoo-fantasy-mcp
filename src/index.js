#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerFantasyTools } from './fantasy.js';
import { VERSION } from './shared.js';

const server = new McpServer({ name: 'yahoo-fantasy', version: VERSION });

registerFantasyTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
