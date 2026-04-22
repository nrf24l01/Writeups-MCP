Writeups MCP for OpenCode
=========================

This project provides:
- a cleaner indexer for the Kraber writeups knowledge base
- a FastAPI search service exposing endpoints agents can call
- a Python client wrapper + CLI

Build index:
  python3 build_index.py --source /home/Serebr1k/kraber/knowledge_base --db data/writeups_index.db

Run service:
  uvicorn service:app --host 0.0.0.0 --port 9001

Search from Python:
  from client import WriteupsClient
  c = WriteupsClient('http://localhost:9001')
  c.search('privilege escalation')
