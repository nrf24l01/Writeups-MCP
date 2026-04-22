#!/usr/bin/env node
/**
 * Writeups MCP Server
 * 
 * MCP server for CTF writeups knowledge base search
 * Provides tools to search through indexed writeups using FTS5
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

const DB_PATH = process.env.WRITEUPS_DB || path.join(os.homedir(), 'writeups-mcp-opencode', 'data', 'writeups_index.db');

class WriteupsMCPServer {
    constructor() {
        this.server = new Server({
            name: 'Writeups MCP Server',
            version: '1.0.0'
        }, {
            capabilities: {
                tools: {}
            }
        });
        
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'search_writeups',
                        description: 'Search CTF writeups knowledge base for techniques, vulnerabilities, and solutions',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                query: {
                                    type: 'string',
                                    description: 'Search query (keywords, technique name, CVE, etc.)'
                                },
                                limit: {
                                    type: 'number',
                                    description: 'Maximum number of results (default: 10)',
                                    default: 10
                                }
                            },
                            required: ['query']
                        }
                    }
                ]
            };
        });
        
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const name = request.params?.name;
            const args = request.params?.arguments || {};
            
            if (name === 'search_writeups') {
                return await this.search(args.query, args.limit || 10);
            }
            
            return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
        });
    }
    
    search(query, limit) {
        try {
            const db = new Database(DB_PATH, { readonly: true });
            
            const stmt = db.prepare(`
                SELECT rowid, snippet(docs_fts, -1, '===', '===', '...', 10) as snippet, path 
                FROM docs_fts 
                WHERE docs_fts MATCH ? 
                LIMIT ?
            `);
            
            const rows = stmt.all(query, limit);
            db.close();
            
            const results = rows.map(row => {
                return {
                    type: 'text',
                    text: `=== ${row.path} ===\n${row.snippet}\n`
                };
            });
            
            return { content: results };
        } catch (error) {
            return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
        }
    }
    
    async start() {
        try {
            const transport = new StdioServerTransport();
            await this.server.connect(transport);
            console.error("Writeups MCP Server started. Waiting for requests...");
            
            process.on('SIGINT', () => {
                console.error("Shutting down Writeups MCP Server...");
                process.exit(0);
            });
        } catch (error) {
            console.error("Failed to start MCP Writeups Server:", error);
            process.exit(1);
        }
    }
}

const server = new WriteupsMCPServer();
server.start().catch(console.error);