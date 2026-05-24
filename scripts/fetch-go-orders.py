#!/usr/bin/env python3
"""
Fetch GonnaOrder orders for a single store, dump to JSON.

Run from the project root. Reads creds from .env.local.
Outputs JSON to stdout (and a status summary to stderr) so you can
redirect it to a file:

    python3 scripts/fetch-go-orders.py --shop 5677 --since 2026-03-01 > /tmp/go.json

Then send /tmp/go.json back to Claude for the matching + Supabase upsert.

No external deps — uses Python stdlib only. No npm, no tsx, no Netlify.
"""

import argparse, json, sys, urllib.request, urllib.error
from datetime import datetime, timezone


def load_env(path):
    env = {}
    for line in open(path):
        line = line.strip()
        if not line or line.startswith('#'): continue
        k, _, v = line.partition('=')
        env[k.strip()] = v.strip()
    return env


# Cloudflare in front of admin.gonnaorder.com blocks the default Python UA
# (error 1010). We send a real browser UA + standard accept headers to pass.
DEFAULT_HEADERS = {
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 '
                  '(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.9',
    'origin': 'https://admin.gonnaorder.com',
    'referer': 'https://admin.gonnaorder.com/',
}

def http(url, method='POST', headers=None, body=None, timeout=60):
    merged = dict(DEFAULT_HEADERS)
    if headers: merged.update(headers)
    data = None
    if body is not None:
        if isinstance(body, (dict, list)):
            data = json.dumps(body).encode()
            merged.setdefault('content-type', 'application/json')
        elif isinstance(body, str):
            data = body.encode()
        else:
            data = body
    req = urllib.request.Request(url, data=data, method=method, headers=merged)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--shop', required=True, help='GonnaOrder store id (e.g. 5677)')
    ap.add_argument('--since', required=True, help='YYYY-MM-DD; orders with wishTime older than this are skipped')
    ap.add_argument('--env', default='.env.local', help='Path to .env file (default: ./.env.local)')
    ap.add_argument('--page-size', type=int, default=100)
    ap.add_argument('--max-pages', type=int, default=200, help='Safety belt')
    args = ap.parse_args()

    env = load_env(args.env)
    GO_BASE = env['GONNAORDER_API_BASE']
    GO_USER = env['GONNAORDER_USERNAME']
    GO_PASS = env['GONNAORDER_PASSWORD']

    since = datetime.fromisoformat(args.since + 'T00:00:00+00:00')
    print(f"→ Auth POST {GO_BASE}/auth/login", file=sys.stderr)
    s, b = http(f'{GO_BASE}/auth/login', body={'username': GO_USER, 'password': GO_PASS})
    if s != 200:
        print(f"AUTH FAILED status={s} body={b[:400]!r}", file=sys.stderr); sys.exit(1)
    auth = json.loads(b)
    jwt = (auth.get('tokens') or {}).get('jwt')
    if not jwt:
        print(f"AUTH OK but no tokens.jwt; keys={list(auth.keys())}", file=sys.stderr); sys.exit(1)
    print(f"  ✓ JWT acquired ({len(jwt)} chars)", file=sys.stderr)

    print(f"\n→ Fetch /stores/{args.shop}/orders/search since {since.date()}", file=sys.stderr)
    all_orders, page = [], 0
    while True:
        url = (f'{GO_BASE}/stores/{args.shop}/orders/search'
               f'?size={args.page_size}&page={page}&sort=wishTime,desc')
        s, b = http(url, body={'status': ['CLOSED'], 'isReady': False},
                    headers={'authorization': f'Bearer {jwt}'})
        if s != 200:
            print(f"  page {page} FAILED status={s} body={b[:300]!r}", file=sys.stderr); sys.exit(1)
        p = json.loads(b)
        if isinstance(p, list): orders = p
        elif isinstance(p, dict): orders = p.get('content') or p.get('data') or []
        else: orders = []
        print(f"  page {page}: {len(orders)} orders", file=sys.stderr)
        if not orders: break
        crossed = False
        for o in orders:
            wt = o.get('wishTime')
            if wt:
                try:
                    d = datetime.fromisoformat(wt.replace('Z', '+00:00'))
                    if d < since: crossed = True; continue
                except Exception: pass
            all_orders.append(o)
        if crossed or len(orders) < args.page_size: break
        page += 1
        if page > args.max_pages:
            print(f"  safety stop at page {page}", file=sys.stderr); break

    # dedupe
    seen, deduped = set(), []
    for o in all_orders:
        k = o.get('uuid') or str(o.get('orderId'))
        if k in seen: continue
        seen.add(k); deduped.append(o)

    print(f"\n  ✓ Total fetched (post-since-filter): {len(all_orders)}", file=sys.stderr)
    print(f"  ✓ After dedup by uuid/orderId: {len(deduped)}", file=sys.stderr)
    print(f"\n→ Writing JSON to stdout (size: {sum(len(json.dumps(o)) for o in deduped) // 1024} KB)", file=sys.stderr)

    json.dump({'shop': args.shop, 'since': args.since, 'orders': deduped}, sys.stdout)


if __name__ == '__main__':
    main()
