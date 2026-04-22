from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import sqlite3
from typing import List

app = FastAPI(title="Writeups MCP")


class SearchRequest(BaseModel):
    q: str
    limit: int = 10


def conn(db_path="/home/Serebr1k/writeups-mcp-opencode/data/writeups_index.db"):
    return sqlite3.connect(db_path)


@app.post("/search")
def search(req: SearchRequest):
    if not req.q:
        raise HTTPException(status_code=400, detail="Empty query")
    c = conn()
    cur = c.cursor()
    cur.execute(
        'SELECT rowid, snippet(docs_fts, 0, "...", "...", "...", 10), path FROM docs_fts WHERE docs_fts MATCH ? LIMIT ?',
        (req.q, req.limit),
    )
    rows = cur.fetchall()
    c.close()
    out = []
    for r in rows:
        out.append({"id": r[0], "snippet": r[1], "path": r[2]})
    return {"hits": out}
