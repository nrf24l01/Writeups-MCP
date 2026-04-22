#!/usr/bin/env node
/**
 * Writeups MCP Server
 * 
 * MCP server for CTF writeups knowledge base search
 * Provides tools to search through indexed writeups for techniques, vulnerabilities, and solutions
 * 
 * Database contains: CTF writeups, HackTricks, security techniques, vulnerability explanations,
 * exploitation guides, cheat sheets, and various security-related documentation
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

const DB_PATH = process.env.WRITEUPS_DB || path.join(os.homedir(), 'writeups-mcp-opencode', 'data', 'writeups_index.db');

const HELP_TEXT = {
    search: `search_writeups - Поиск по базе знаний CTF writeups
==========================================================
Содержит: CTF writeups, HackTricks, техники взлома, описания уязвимостей,
руководства по эксплуатации, читшиты и др. документация по безопасности

ПАРАМЕТРЫ:
- query (string, ОБЯЗАТЕЛЬНО): Поисковый запрос
  • Ключевые слова: "SQL injection", "XSS", "buffer overflow"
  • Названия техник: "privilege escalation", "LFI to RCE"
  • CVE: "CVE-2024-1234"
  • Любые слова из документации
- limit (number, опционально): Максимум результатов (по умолчанию: 10)

ПРИМЕРЫ:
 search_writeups({query: "SQL injection", limit: 5})
 search_writeups({query: "privilege escalation windows"})
 search_writeups({query: "CVE-2024-1709"})

РЕЗУЛЬТАТ:
Возвращает нумерованный список [1], [2], [3]...
Для чтения используй read_writeup с полученным ID`,

    read: `read_writeup - Чтение содержимого райтапа
==========================================
Читает файл полностью или частично по ID из поиска или по пути

ПАРАМЕТРЫ:
- id (number, опционально): ID из результатов поиска (например [1])
  ПРИОРИТЕТНЕЕ чем path - используй этот если есть
- path (string, опционально): Полный путь к файлу
  Пример: "/home/Serebr1k/kraber/knowledge_base/SQL Injection/SQLite Injection.md"
- lines (string, опционально): Диапазон строк
  • "100-150" - показать строки 100-150
  • "50" - показать вокруг строки 50 (50-60)
  • "100-" - с строки 100 до конца
  • Без параметра - весь файл или первые 100 строк

ПРИМЕРЫ:
 read_writeup({id: 1})                          // читать результат #1
 read_writeup({id: 1, lines: "1-50"})         // строки 1-50
 read_writeup({path: "/path/to/file.md", lines: "100"}) // вокруг строки 100
 read_writeup({path: "/path/to/file.md"})          // весь файл

ОШИБКИ:
- "Must provide ID or path" - нужно указать id или path
- "File not found" - файл не существует
- "Invalid line range" - неверный формат строк`,

    invalid: `НЕВЕРНЫЙ ВЫЗОВ!
==============
Получен неправильный запрос к MCP. Используй tools/call с правильным форматом:

ДЛЯ ПОИСКА:
{"method": "tools/call", "params": {"name": "search_writeups", "arguments": {"query": "...", "limit": 10}}

ДЛЯ ЧТЕНИЯ:
{"method": "tools/call", "params": {"name": "read_writeup", "arguments": {"id": 1}}}
{"method": "tools/call", "params": {"name": "read_writeup", "arguments": {"path": "/full/path", "lines": "1-50"}}}

Доступные инструменты: search_writeups, read_writeup`
};

class WriteupsMCPServer {
    constructor() {
        this.cache = new Map();
        this.cacheId = 1;
        
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
                        description: 'Search CTF writeups knowledge base. Database contains: CTF writeups, HackTricks, security techniques, vulnerability explanations, exploitation guides, cheat sheets. Returns numbered results. Use read_writeup with ID to read.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                query: {
                                    type: 'string',
                                    description: 'Search query: keywords (SQL injection), technique name (privilege escalation), CVE number, or any words from docs. REQUIRED'
                                },
                                limit: {
                                    type: 'number',
                                    description: 'Maximum results to return, default 10',
                                    default: 10
                                }
                            },
                            required: ['query']
                        }
                    },
                    {
                        name: 'read_writeup',
                        description: 'Read writeup content by ID (from search results, format: [1]) or by full path. Shows full file or specific line range. Format: id=1 or path="/full/path". Optional lines="100-150" or "50" for around line.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                id: {
                                    type: 'number',
                                    description: 'Result ID from search, format: [1], [2], etc. PRIORITY over path'
                                },
                                path: {
                                    type: 'string',
                                    description: 'Full path to writeup file, e.g. "/home/Serebr1k/kraber/knowledge_base/...". Use ONLY if no id'
                                },
                                lines: {
                                    type: 'string',
                                    description: 'Line range: "100-150" (lines 100-150), "50" (around line 50), "100-" (from line 100). Default: first 100 lines',
                                    default: "1-100"
                                }
                            }
                        }
                    },
                    {
                        name: 'help',
                        description: 'Show detailed help for writeups MCP tools',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                tool: {
                                    type: 'string',
                                    description: 'Tool name: "search", "read", or "all"',
                                    default: "all"
                                }
                            }
                        }
                    }
                ]
            };
        });
        
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const name = request.params?.name;
            const args = request.params?.arguments || {};
            
            if (name === 'search_writeups') {
                if (!args.query || args.query.trim() === '') {
                    return { content: [{ type: 'text', text: HELP_TEXT.invalid + '\n\n' + HELP_TEXT.search }] };
                }
                return await this.search(args.query, args.limit || 10);
            } else if (name === 'read_writeup') {
                if (!args.id && !args.path) {
                    return { content: [{ type: 'text', text: 'Error: Must provide id or path\n\n' + HELP_TEXT.read }] };
                }
                if (args.id && isNaN(args.id)) {
                    return { content: [{ type: 'text', text: 'Error: id must be a number like 1, 2, 3 (from [1], [2] in search results)\n\n' + HELP_TEXT.read }] };
                }
                return await this.readWriteup(args.id, args.path, args.lines);
            } else if (name === 'help') {
                const tool = args.tool || 'all';
                if (tool === 'all') return { content: [{ type: 'text', text: HELP_TEXT.search + '\n\n' + HELP_TEXT.read }] };
                if (tool === 'search') return { content: [{ type: 'text', text: HELP_TEXT.search }] };
                if (tool === 'read') return { content: [{ type: 'text', text: HELP_TEXT.read }] };
                return { content: [{ type: 'text', text: 'Unknown tool: ' + tool + '. Use: search, read, or all' }] };
            }
            
            return { content: [{ type: 'text', text: HELP_TEXT.invalid }] };
        });
    }
    
    search(query, limit) {
        try {
            const db = new Database(DB_PATH, { readonly: true });
            
            const stmt = db.prepare(`
                SELECT d.rowid as id, d.title, d.path
                FROM docs d
                JOIN docs_fts f ON d.rowid = f.rowid
                WHERE docs_fts MATCH ?
                LIMIT ?
            `);
            
            const rows = stmt.all(query, limit);
            
            if (rows.length === 0) {
                db.close();
                return { content: [{ type: 'text', text: `Ничего не найдено по запросу "${query}".\nПопробуй другие ключевые слова или уменьши limit.\n\nЧто есть в базе: CTF writeups, HackTricks, техники безопасности, уязвимости, гайды по эксплуатации.` }] };
            }
            
            const results = [];
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const snippetStmt = db.prepare(`SELECT snippet(docs_fts, -1, '===', '===', '...', 10) as snippet FROM docs_fts WHERE rowid = ?`);
                const snippetRow = snippetStmt.get(row.id);
                
                let lineInfo = "";
                if (snippetRow && snippetRow.snippet) {
                    const fullStmt = db.prepare(`SELECT content FROM docs_fts WHERE rowid = ?`);
                    const fullRow = fullStmt.get(row.id);
                    if (fullRow && fullRow.content) {
                        const matchPos = fullRow.content.indexOf(snippetRow.snippet.substring(10, 50));
                        if (matchPos >= 0) {
                            const beforeMatch = fullRow.content.substring(0, matchPos);
                            const lineNum = (beforeMatch.match(/\n/g) || []).length + 1;
                            lineInfo = ` (lines ~${lineNum}-${lineNum + 10})`;
                        }
                    }
                }
                
                const resultId = this.cacheId++;
                this.cache.set(resultId, { path: row.path, db });
                
                results.push({
                    type: 'text',
                    text: `[${resultId}] ${row.title}${lineInfo}\nPath: ${row.path}\n---snippet---\n${snippetRow?.snippet || 'No preview'}\n`
                });
            }
            
            db.close();
            return { content: results };
        } catch (error) {
            return { content: [{ type: 'text', text: 'Error: ' + error.message + '\n\n' + HELP_TEXT.search }] };
        }
    }
    
    readWriteup(id, pathArg, linesArg) {
        try {
            let filePath;
            
            if (id && this.cache.has(id)) {
                filePath = this.cache.get(id).path;
            } else if (pathArg) {
                filePath = pathArg;
            } else {
                return { content: [{ type: 'text', text: HELP_TEXT.read }] };
            }
            
            if (!fs.existsSync(filePath)) {
                return { content: [{ type: 'text', text: 'Файл не найден: ' + filePath + '\nПроверь путь или выполни новый поиск.' }] };
            }
            
            let content = fs.readFileSync(filePath, 'utf-8');
            let lines = content.split('\n');
            let range = '';
            let startLine = 1;
            let endLine = Math.min(100, lines.length);
            
            if (linesArg) {
                const isRange = linesArg.includes('-');
                const isFrom = linesArg.endsWith('-');
                
                if (isRange && !isFrom) {
                    const [s, e] = linesArg.split('-').map(Number);
                    startLine = Math.max(1, s || 1);
                    endLine = Math.min(lines.length, e || lines.length);
                } else if (isFrom) {
                    const s = parseInt(linesArg.replace('-', ''));
                    startLine = Math.max(1, s || 1);
                    endLine = lines.length;
                } else {
                    const lineNum = parseInt(linesArg);
                    if (isNaN(lineNum)) {
                        return { content: [{ type: 'text', text: 'Invalid line format. Use: "100-150", "50", "100-", or omit.\n\n' + HELP_TEXT.read }] };
                    }
                    startLine = Math.max(1, lineNum - 10);
                    endLine = Math.min(lines.length, lineNum + 10);
                }
                range = ` (lines ${startLine}-${endLine})`;
            }
            
            const selectedLines = lines.slice(startLine - 1, endLine);
            const display = selectedLines.map((l, i) => `${startLine + i}: ${l}`).join('\n');
            const total = lines.length;
            
            return {
                content: [{
                    type: 'text',
                    text: `=== ${path.basename(filePath)}${range} === (total ${total} lines)\n\n${display}\n\n---end---\nID ${id} для этого файла больше недействителен - нужно снова искать если хочешь прочитать другой раздел.`
                }]
            };
        } catch (error) {
            return { content: [{ type: 'text', text: 'Error: ' + error.message + '\n\n' + HELP_TEXT.read }] };
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