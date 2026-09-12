# Risk Assessment

## Risk tier: high

Rationale: the agent drafts content that, if it reached an end investor without review, would read as a trade recommendation. `risk_tier: high` is set deliberately conservatively for a desk-research tool, because the mandate check and human-in-the-loop controls should be sized for the worst case the interface could enable, not the common case.

## Controls that justify running this agent at all
- The agent has no write path to `main` — see `DUTIES.md`. This is enforced in the workbench server, not just documented.
- `RULES.md` requires a bear case and a stated risk on every revision — structurally prevents one-sided output.
- `hooks/scripts/mandate-check.js` runs deterministically before any draft is shown to the analyst as ready, independent of whether the drafting step itself used an LLM.
- Every revision, approval, rejection, and revert is a git commit — nothing is mutated in place.

## Known limitations (see root WRITEUP.md "what's broken and why")
- The shipped signal computation is a simple heuristic, not a validated model — this is declared, not hidden, in every thesis's signal trace.
- No live fundamentals feed; sector/valuation context is a static, analyst-maintained reference file.
