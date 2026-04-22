#!/usr/bin/env python3
import argparse
import os
import sqlite3
import hashlib
from pathlib import Path
from tqdm import tqdm
import re


def file_hash(path: Path):
    h = hashlib.sha1()
    with path.open("rb") as f:
        while True:
            chunk = f.read(8192)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def clean_text(text: str) -> str:
    # remove YAML frontmatter
    text = re.sub(r"^---[\s\S]*?---\n", "", text)
    # remove code blocks ``` ```
    text = re.sub(r"```[\s\S]*?```", " ", text)
    # collapse multiple newlines
    text = re.sub(r"\n{2,}", "\n\n", text)
    return text.strip()


def gather_files(root: Path, exts=None):
    exts = exts or {".md", ".txt", ".rst", ".html"}
    for p in root.rglob("*"):
        if p.is_file() and p.suffix.lower() in exts:
            yield p


def create_db(db_path: Path):
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS docs (
        id INTEGER PRIMARY KEY,
        path TEXT UNIQUE,
        hash TEXT,
        title TEXT
    )
    """)
    cur.execute("""
    CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(content, path UNINDEXED, title UNINDEXED, tokenize = "unicode61 remove_diacritics 1");
    """)
    conn.commit()
    return conn


def index_directory(source: Path, db_path: Path, min_chars=300):
    conn = create_db(db_path)
    cur = conn.cursor()

    files = list(gather_files(source))
    print(f"Found {len(files)} candidate files")

    seen_hashes = set()
    pbar = tqdm(files, desc="Indexing", unit="file")
    for p in pbar:
        try:
            raw = p.read_text(errors="ignore")
        except Exception:
            continue
        text = clean_text(raw)
        if len(text) < min_chars:
            pbar.set_postfix({"skipped_short": p.name})
            continue
        h = file_hash(p)
        if h in seen_hashes:
            pbar.set_postfix({"dedup": p.name})
            continue
        seen_hashes.add(h)

        title = p.stem
        cur.execute(
            "INSERT OR REPLACE INTO docs (path, hash, title) VALUES (?, ?, ?)",
            (str(p), h, title),
        )
        # remove existing FTS row for this path
        cur.execute("DELETE FROM docs_fts WHERE path = ?", (str(p),))
        cur.execute(
            "INSERT INTO docs_fts (rowid, content, path, title) VALUES (last_insert_rowid(), ?, ?, ?)",
            (text, str(p), title),
        )
        if cur.lastrowid % 100 == 0:
            conn.commit()
    conn.commit()
    conn.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True)
    ap.add_argument("--db", required=True)
    ap.add_argument("--min-chars", type=int, default=300)
    args = ap.parse_args()
    src = Path(args.source)
    db = Path(args.db)
    if not src.exists():
        raise SystemExit(f"Source {src} does not exist")
    index_directory(src, db, min_chars=args.min_chars)


if __name__ == "__main__":
    main()
