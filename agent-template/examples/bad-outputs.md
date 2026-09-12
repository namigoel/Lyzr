# Bad Outputs — and why the mandate check catches them

## Missing bear case
> Rating: buy. NVDA keeps winning. Bull case: AI demand, data center growth, margins.
Rejected by mandate-check: no bear case section. A one-sided call is not desk research.

## Fabricated data point on tool failure
> Price: $118.40 (estimated). 
Rejected: `fetch-quote` returned `unavailable` for this run; the agent must mark the field
`unavailable`, not substitute a plausible-looking number.

## Unexplained reversal
> Rating: sell (previously: buy).
Rejected: no "Reversal:" line explaining what changed. A flip needs a stated reason, not
just a new number.

## Conviction without evidence
> Conviction: 5. Confidence: 0.9. (Signal trace: one momentum data point.)
Rejected: conviction 5 requires at least three corroborating signals in the trace; one
data point doesn't clear that bar regardless of how confident the language sounds.

## Out-of-mandate initiation
> Ticker: GMBL. Rating: buy.
Rejected before drafting even starts: GMBL is below the $2B market-cap floor in
`knowledge/universe.md`. The agent should decline, not draft around it.
