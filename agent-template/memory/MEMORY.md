# Coverage Memory

## Structure
- `coverage/<TICKER>.md` — one file per covered ticker. This file *is* the recommendation. Every revision is a commit; the file's git history is the full audit trail of how the call changed and why.
- `log.md` — append-only record of every draft, approval, rejection, and revert
- `MEMORY.md` (this file) — portfolio-level snapshot, kept under 200 lines

## Portfolio Snapshot
- Tickers under active coverage: see `coverage/`
- Sector exposure, open reversals, and pending reviews are computed live by the workbench from git state — this file holds only what doesn't already live in that state.

## Last Known State
Updated by the workbench after each approval/rejection/revert. See `log.md` for the full chronological record.
