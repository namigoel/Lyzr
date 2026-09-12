---
name: research-ticker
description: "Gather current market data and prior thesis history for a ticker before drafting or revising coverage. Use when asked to look at, refresh, or research a ticker."
allowed-tools: fetch-quote Read Grep
metadata:
  category: equity-research
  risk_tier: high
---

# Research Ticker

Gather everything a revision needs before writing a single word of thesis.

## Workflow

### Step 1: Read the record
- Read `memory/coverage/<TICKER>.md` if it exists — current rating, conviction, price target, and the reasoning behind them
- Read the file's git log (`git log --follow -- memory/coverage/<TICKER>.md`) to see how the call has moved over time
- Read `memory/MEMORY.md` for portfolio-level context (sector exposure, active theses)

### Step 2: Fetch live data
- Call the `fetch-quote` tool for the ticker: last price, change over the lookback window, day range
- If the tool fails or the ticker is unknown to it, record the field as `unavailable` — do not guess a number

### Step 3: Consult knowledge
- Read `knowledge/sectors.md` and `knowledge/universe.md` for sector classification, market-cap tier, and mandate eligibility
- If the ticker is below the mandate's market-cap floor (see `RULES.md`), stop here and report that it is out of mandate — do not draft a thesis

### Step 4: Compute a signal
- Momentum: sign and magnitude of the fetched price change over the lookback window
- Valuation context: where the ticker's tier sits versus its sector norm in `knowledge/sectors.md`
- Combine into a confidence score in [0, 1]. Be explicit about which inputs drove the score — this becomes the "corroborating signals" `draft-thesis` needs for high conviction.

### Output
Hand off to `draft-thesis` with: prior thesis (if any), fetched quote + as-of timestamp, sector/tier context, computed signal and confidence, and mandate-eligibility result.
