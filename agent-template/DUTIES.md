# Duties

System-wide segregation of duties policy for the coverage-desk agent system.

## Roles

| Role | Holder | Permissions | Description |
|------|--------|-------------|-------------|
| Maker | coverage-desk (agent) | create, submit | Drafts and revises coverage theses from research signals |
| Checker | lead-analyst (human) | review, approve, reject | Reviews proposed coverage and decides what enters the record (including reverting a past commit — a workbench-level control, not an agent permission) |

## Conflict Matrix

- **Maker <-> Checker** — The agent that drafts a thesis cannot approve, reject, or revert it. This is enforced at the interface level: the "Approve" and "Reject" controls only exist in the human-operated workbench, never in the agent's tool surface.

## Handoff Workflow — Rating Change

1. **Maker** (coverage-desk) drafts a revised thesis on `review/<ticker>-<timestamp>`, runs the mandate check, and opens it for review
2. **Checker** (lead-analyst) reads the diff against `main`, the mandate-check result, and the underlying data, then either:
   - **Approves** — the branch is merged to `main` with a commit trailer recording who approved and when
   - **Rejects** — the branch is deleted, and the reason is appended to `memory/log.md`
   - **Edits then approves** — the analyst may amend the draft before merging; the amendment is a visible, separate commit on the review branch
3. Approval is required at every step. There is no path from draft to record that skips the checker.

## Isolation Policy

- **State isolation: full** — The agent's draft lives only on its review branch until approved; it cannot write to `main` directly.
- **Credential segregation: separate** — The agent's tool surface (market-data fetch) carries no write credentials to the record; only the human-operated workbench actions can commit to `main`.

## Enforcement

Enforcement mode is **strict**. The mandate-check hook blocks a draft from leaving `draft` status if it violates `RULES.md`, and the server never exposes a merge-to-main path that bypasses the human approval action.
