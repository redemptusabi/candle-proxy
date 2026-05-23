# Candle Proxy

A tiny server that fetches public candle data from Bybit and serves it to the
Swing Trading Advisor frontend. Server-to-server, so no browser sandbox or CORS
issues. No API keys — this only touches Bybit's public market data.

## Run locally

    npm install
    npm start

Then open: http://localhost:8787/api/candles?symbol=ETHUSDT&interval=240

## Deploy (Railway)

1. Push this folder to a GitHub repo.
2. Go to railway.app, sign in with GitHub.
3. New Project → Deploy from GitHub repo → pick this repo.
4. Railway auto-detects Node, runs `npm install`, starts with `npm start`.
5. Under Settings → Networking, generate a public domain.
6. (Recommended) Settings → Variables → add `ALLOWED_ORIGIN` = your frontend URL.

## Deploy (Render)

1. Push to GitHub.
2. render.com → New → Web Service → connect the repo.
3. Build command: `npm install`  ·  Start command: `npm start`
4. Add env var `ALLOWED_ORIGIN` once you know your frontend URL.

## Verify

Visit `/api/candles?symbol=ETHUSDT&interval=240` on your deployed URL.
You should see JSON: `{ "candles": [ ... ], "cached": false }`.

`/health` returns `{ "ok": true }` for uptime monitors.

## Endpoint

GET /api/candles?symbol=ETHUSDT&interval=240&limit=300

- symbol   — plain Bybit symbol, uppercase (ETHUSDT, BTCUSDT, ENJUSDT)
- interval — 60 (1h), 240 (4h), D (1d), plus others
- limit    — 1–1000, default 300

Responses are cached 20s per symbol+interval to respect Bybit rate limits.
