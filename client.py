import requests


class WriteupsClient:
    def __init__(self, base_url="http://localhost:9001"):
        self.base = base_url.rstrip("/")

    def search(self, q, limit=10):
        r = requests.post(
            self.base + "/search", json={"q": q, "limit": limit}, timeout=10
        )
        r.raise_for_status()
        return r.json()


def cli():
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:9001")
    ap.add_argument("query")
    args = ap.parse_args()
    c = WriteupsClient(args.url)
    res = c.search(args.query, limit=50)
    for h in res.get("hits", []):
        print("-----", h["path"])
        print(h["snippet"])


if __name__ == "__main__":
    cli()
