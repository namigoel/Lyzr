---
name: mandate-check
description: "Validate a drafted coverage revision against the RULES.md mandate before it can be handed to the analyst for review. Use after draft-thesis produces a revision, and before any review request."
allowed-tools: Read
metadata:
  category: compliance
  risk_tier: high
---

# Mandate Check

The gate between a draft and a human review request. This mirrors the deterministic check the workbench server runs in `hooks/hooks.yaml` — read that first; this skill exists so an LLM-driven run of this agent enforces the same rules even without the hook script.

## Checks

1. **Both cases present** — bull case and bear case sections both exist and are non-empty
2. **Risk stated** — a risk section exists with at least one concrete failure mode named
3. **Price target + horizon** — both present, or the field is explicitly `unavailable` with confidence lowered accordingly
4. **Mandate floor** — ticker's market-cap tier (from `knowledge/universe.md`) is not below the mandate floor in `RULES.md`
5. **Rating vocabulary** — rating is exactly one of `buy`, `hold`, `sell`
6. **Reversal note** — if rating flipped `buy`↔`sell` since the prior committed revision, a "Reversal:" line is present
7. **Conviction justified** — conviction of 5 has at least 3 named corroborating signals in the signal trace
8. **No fabrication** — no numeric field is present without a cited source; failed fetches are marked `unavailable`, not filled in

## Output

Report each check as `pass` or `fail` with a one-line reason. If any check fails, the draft stays in `analyst_status: draft` and is *not* offered to the analyst as ready — the agent should revise and re-run this check, or explain why the failing check can't be resolved (e.g. genuinely out of mandate).

This check can approve or block a draft from being *shown as ready*. It cannot approve a draft *into the record* — only the human checker can do that (see `DUTIES.md`).
