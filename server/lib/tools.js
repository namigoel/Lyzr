// Implementation of tools/fetch-quote.yaml — a real, no-key market-data tool.
// Uses Yahoo Finance's public chart endpoint. Read-only, best-effort: on any
// failure it returns { unavailable: true } rather than throwing or guessing.

const ENDPOINT = (ticker, range) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=1d`;

function rangeForLookback(lookbackDays) {
  if (lookbackDays <= 7) return '5d';
  if (lookbackDays <= 35) return '1mo';
  if (lookbackDays <= 100) return '3mo';
  return '6mo';
}

async function fetchQuote({ ticker, lookback_days = 30 }) {
  const range = rangeForLookback(lookback_days);
  try {
    const res = await fetch(ENDPOINT(ticker, range), {
      headers: { 'User-Agent': 'Mozilla/5.0 (coverage-desk research tool)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`upstream status ${res.status}`);
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error('no chart result');

    const closes = (result.indicators?.quote?.[0]?.close || []).filter((v) => v != null);
    const timestamps = result.timestamp || [];
    if (!closes.length) throw new Error('no close data');

    const latestClose = closes[closes.length - 1];
    const lookbackMs = lookback_days * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - lookbackMs;
    let windowStartIdx = 0;
    for (let i = 0; i < timestamps.length; i += 1) {
      if (timestamps[i] * 1000 >= cutoff) { windowStartIdx = i; break; }
    }
    const windowCloses = closes.slice(windowStartIdx);
    const startClose = windowCloses[0] ?? closes[0];
    const changePct = ((latestClose - startClose) / startClose) * 100;

    return {
      ticker,
      price: round2(latestClose),
      change_pct: round2(changePct),
      range_low: round2(Math.min(...windowCloses)),
      range_high: round2(Math.max(...windowCloses)),
      as_of: new Date((timestamps[timestamps.length - 1] || Date.now() / 1000) * 1000).toISOString(),
      source: 'Yahoo Finance chart API (public, unauthenticated)',
      unavailable: false,
    };
  } catch (err) {
    return {
      ticker,
      price: null,
      change_pct: null,
      range_low: null,
      range_high: null,
      as_of: new Date().toISOString(),
      source: 'Yahoo Finance chart API (public, unauthenticated)',
      unavailable: true,
      error: err.message,
    };
  }
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { fetchQuote };
