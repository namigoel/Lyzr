---
name: draft-thesis
description: "Write or revise a ticker's coverage file from research findings, following the mandate's format and fairness rules. Use after research-ticker has gathered data, or when explicitly asked to draft/update a thesis."
allowed-tools: Write Read
metadata:
  category: equity-research
  risk_tier: high
---

# Draft Thesis

Turn research findings into a coverage file revision — never a fresh overwrite.

## Workflow

### Step 1: Decide the branch
- Never write to `main`. Create or use `review/<ticker>-<timestamp>`.

### Step 2: Write the frontmatter
```yaml
---
ticker: NVDA
rating: buy            # buy | hold | sell
conviction: 3          # 1-5, 5 needs 3+ corroborating signals
price_target: 210.00
horizon: 6m
updated: 2026-09-10
analyst_status: draft  # agent never sets this to approved
confidence: 0.62
---
```

### Step 3: Write the body
Required sections, in order:
1. **Rating rationale** — one paragraph, numbers-first, stating what changed since the prior revision (if any)
2. **Bull case** — 2-4 bullet points
3. **Bear case** — 2-4 bullet points, equally substantive (never a token bear case)
4. **Risk** — at least one concrete, specific way this thesis is wrong
5. **Data** — the fetched quote, source, and as-of timestamp; explicitly mark any `unavailable` field
6. **Signal trace** — the computed signal(s) and confidence, and which inputs drove it (for audit — this is what the checker reviews)

### Step 4: Flag reversals
If the new rating flips `buy`↔`sell` from the prior committed revision, open the rating rationale with an explicit "Reversal:" line naming what changed.

### Step 5: Hand off to mandate-check
Do not consider the draft finished until `skills/mandate-check` has run against it. If it fails, revise and re-check — don't hand a failing draft to the analyst.

## Style
Direct, numbers-first. No hedged marketing language, no "this could potentially maybe." State the call and the evidence.
