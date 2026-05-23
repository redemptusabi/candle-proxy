// server.js — Public candle proxy for the Swing Trading Advisor
// Step 1 of the backend spec: live Bybit data, no API keys, no account access.
//
// Run locally:
//   npm init -y
//   npm install express
//   node server.js
// Then point your frontend fetch at  http://localhost:8787/api/candles?symbol=ETHUSDT&interval=240
//
// Node 18+ has global fetch built in. On older Node, install node-fetch and import it.

const express = require("express");

const app = express();
const PORT = process.env.PORT || 8787;

// --- CORS: allow only your frontend origin in production ---
// For local dev this allows everything; tighten ALLOWED_ORIGIN before deploying.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// --- Simple in-memory cache (per symbol+interval) ---
// Avoids hammering Bybit on repeated clicks and keeps you inside rate limits.
const CACHE_TTL_MS = 20_000; // 20 seconds
const cache = new Map(); // key -> { ts, data }

function cacheGet(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;
  return null;
}
function cacheSet(key, data) {
  cache.set(key, { ts: Date.now(), data });
}

// --- Validation ---
const VALID_INTERVALS = new Set(["1", "3", "5", "15", "30", "60", "120", "240", "360", "720", "D", "W", "M"]);

function validate(symbol, interval, limit) {
  if (!symbol || !/^[A-Z0-9]{5,20}$/.test(symbol)) {
    return "Invalid symbol. Use a plain Bybit symbol like ETHUSDT.";
  }
  if (!VALID_INTERVALS.has(interval)) {
    return `Invalid interval. Allowed: ${[...VALID_INTERVALS].join(", ")}.`;
  }
  if (limit < 1 || limit > 1000) {
    return "Invalid limit. Must be 1-1000.";
  }
  return null;
}

// --- Normalize Bybit's response into the shape the frontend expects ---
// Bybit returns newest-first: [startTime, open, high, low, close, volume, turnover]
// Frontend wants oldest-first objects.
function normalize(list) {
  return list
    .map((k) => ({
      time: Number(k[0]),
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
    }))
    .reverse();
}

// --- The endpoint ---
app.get("/api/candles", async (req, res) => {
  const symbol = String(req.query.symbol || "").toUpperCase();
  const interval = String(req.query.interval || "240");
  const limit = parseInt(req.query.limit, 10) || 300;

  const err = validate(symbol, interval, limit);
  if (err) return res.status(400).json({ error: err });

  const cacheKey = `${symbol}:${interval}:${limit}`;
  const cached = cacheGet(cacheKey);
  if (cached) return res.json({ candles: cached, cached: true });

  const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=${interval}&limit=${limit}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!r.ok) {
      return res.status(502).json({ error: `Bybit responded ${r.status}.` });
    }

    const json = await r.json();
    if (json.retCode !== 0) {
      return res.status(502).json({ error: json.retMsg || "Bybit API error — check the symbol." });
    }

    const list = json.result?.list;
    if (!list || !list.length) {
      return res.status(404).json({ error: "No data for this symbol/interval." });
    }

    const candles = normalize(list);
    cacheSet(cacheKey, candles);
    res.json({ candles, cached: false });
  } catch (e) {
    const msg = e.name === "AbortError" ? "Bybit request timed out." : "Failed to reach Bybit.";
    res.status(502).json({ error: msg });
  }
});

// --- Health check (handy for uptime monitors and host readiness probes) ---
app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Candle proxy listening on http://localhost:${PORT}`);
  console.log(`Try: http://localhost:${PORT}/api/candles?symbol=ETHUSDT&interval=240`);
});
