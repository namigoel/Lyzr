# Demo script (~90 seconds)

Record with QuickTime (macOS: `cmd+shift+5` → "Record Selected Portion" → select the browser window → Record) or any screen recorder. No audio needed if you'd rather add voiceover after — the beats below work as on-screen narration too.

**Before recording:**
```bash
npm run seed && npm start
```
Open `http://localhost:4173`, arrange the window, then start recording.

---

**0:00 — Cold open on the coverage list**
Land on the app. Say: *"This is Coverage Desk — a stock research agent built on GitAgent, where every recommendation is a git commit."* Point at the sidebar: NVDA (buy), SOFI (sell), PYPL (review badge), RIVN (new), GMBL (greyed out, out of mandate).

**0:10 — Click NVDA → Thesis tab**
*"NVDA's thesis — rating, conviction, target, and a bull case, bear case, and risk section the mandate requires on every call."*

**0:20 — Click the History tab**
*"Here's the part a chatbot can't do: this is real git history."* Scroll down to point out:
- `draft(NVDA): initiate coverage` → `review(NVDA): analyst sign-off` (agent proposes, human approves — two different authors, two different commits)
- `draft(NVDA): raise conviction to 5, target 262` → approved → then two `Revert` commits right below it
Say: *"The desk approved a conviction-5 call on one signal, it was too aggressive, and instead of editing history, we reverted it — the mistake and the correction both stay in the log."*

**0:40 — Click Diff tab, hit "Diff"**
*"Every rating change is a reviewable patch — not a re-rendered summary, an actual `git diff`."*

**0:50 — Click PYPL**
*"PYPL has a live agent draft sitting on a review branch right now, waiting for me."* Point at the pending-review banner: Approve / Edit before approving / Reject. *"The agent can never merge its own work — only I can."* Click **Reject**, type a one-line reason, confirm. *"Rejected, and the reason is logged."*

**1:05 — Click RIVN → "Ask agent to initiate"**
*"RIVN isn't covered yet. Watch the agent research it live — this hits a real market-data API, not a mock."* Wait ~2s for the draft to land. Point at the fetched price and the mandate-check pass. Click **Approve & commit to main**. *"Approved — now it's part of the record."*

**1:20 — Click GMBL → "Ask agent to initiate"**
*"And GMBL is below our market-cap mandate — the agent declines instead of drafting anything."*

**1:30 — Click "Mandate" in the top nav**
*"The mandate itself — RULES.md — is versioned exactly the same way."* Point at the history: the amendment that tightened the conviction-5 rule right after that NVDA incident. *"That's not a coincidence — the desk changed its own rules in response to a real mistake, and you can see it in the diff."*

**1:40 — Point at the right-hand Harness panel, click "validate"**
*"And this isn't gitagent-shaped files — this runs the real, published `opengap` CLI against the live workspace."*

**1:50 — Close**
*"Memory as commits, branches as the review queue, diff as the approval interface, revert as the undo button. That's the whole idea."*

---

## Cut list if you want it under 60 seconds
Keep: 0:00, 0:20 (History), 0:50 (PYPL reject), 1:05 (RIVN live initiate + approve). Cut: Diff tab, GMBL, Mandate, Harness.
