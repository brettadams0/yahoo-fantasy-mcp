#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerFantasyTools } from './fantasy.js';

const server = new McpServer({ name: 'yahoo-fantasy', version: '1.0.0' });

registerFantasyTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
