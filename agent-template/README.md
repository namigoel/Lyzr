# coverage-desk

A GitAgent definition for an equity-research coverage agent. This directory is a complete, portable agent per the [gitagent/OpenGAP spec](https://github.com/open-gitagent/gitagent): clone it and you have the agent's identity, rules, skills, tools, and memory.

It is meant to be driven by the Coverage Desk workbench (see the repository root `README.md`), which turns this definition into a running git workspace and gives a human analyst a UI over the agent's proposals, the mandate, and the coverage history. You can also point the real `opengap` CLI at it directly:

```bash
npx @open-gitagent/opengap validate --compliance --dir .
npx @open-gitagent/opengap info --dir .
npx @open-gitagent/opengap audit --dir .
npx @open-gitagent/opengap export --format system-prompt --dir .
```

## Layout

- `agent.yaml` — manifest: model, skills, tools, and the compliance/SOD policy that makes the agent a *maker*, never a *checker*
- `SOUL.md` / `RULES.md` / `DUTIES.md` — identity, hard constraints, and the maker/checker split
- `skills/` — `research-ticker`, `draft-thesis`, `mandate-check`
- `tools/fetch-quote.yaml` — market-data tool schema (implementation lives in `server/lib/tools.js` in the workbench)
- `knowledge/` — the static sector/fundamentals reference the agent is allowed to consult
- `memory/` — `MEMORY.md` (portfolio-level state), `log.md` (append-only operation log), `coverage/<TICKER>.md` (one file per ticker — this *is* the recommendation, and its git history *is* the audit trail)
- `workflows/recommendation-review.yaml` — the maker → mandate-check → checker pipeline, as a structured workflow
- `hooks/` — the mandate-check hook that runs before a draft can leave `draft` status
- `compliance/` — regulatory mapping and risk assessment
