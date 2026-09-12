#!/usr/bin/env node
// Builds the live agent workspace from agent-template/ and seeds a realistic,
// backdated commit history: a maker/checker cadence, a reversal, a bad call
// that gets reverted, a mandate amendment written in direct response to that
// bad call, and a pending review branch waiting for a human decision.
//
// Re-runnable: deletes and rebuilds agent-workspace/ every time. This is
// declared as seed/demo data in the root README and WRITEUP — it exists so
// the workbench has a real history to show on first run, not to misrepresent
// the build timeline of this submission itself.

const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git');
const matter = require('gray-matter');

const ROOT = path.join(__dirname, '..');
const TEMPLATE = path.join(ROOT, 'agent-template');
const WORKSPACE = path.join(ROOT, 'agent-workspace');

const AGENT_AUTHOR = 'coverage-desk-agent <agent@coverage-desk.local>';
const ANALYST_AUTHOR = 'lead-analyst <analyst@coverage-desk.local>';

let g;

function isoAt(daysAgoCount) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgoCount);
  d.setHours(14, 30, 0, 0);
  return d.toISOString();
}

async function at(iso, fn) {
  process.env.GIT_AUTHOR_DATE = iso;
  process.env.GIT_COMMITTER_DATE = iso;
  try {
    return await fn();
  } finally {
    delete process.env.GIT_AUTHOR_DATE;
    delete process.env.GIT_COMMITTER_DATE;
  }
}

function write(relPath, content) {
  const full = path.join(WORKSPACE, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function append(relPath, content) {
  const full = path.join(WORKSPACE, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.appendFileSync(full, content, 'utf8');
}

function coverageFile(front, body) {
  return matter.stringify(body.trim() + '\n', front);
}

async function commit(message, author) {
  await g.add(['.']);
  await g.commit(message, undefined, { '--author': author });
  return (await g.log(['-1'])).latest.hash;
}

async function draftLogApprove(iso, ticker, front, body, draftNote, approveNote) {
  return at(iso, async () => {
    const relPath = `memory/coverage/${ticker}.md`;
    write(relPath, coverageFile({ ...front, analyst_status: 'draft' }, body));
    const draftHash = await commit(`draft(${ticker}): ${draftNote}`, AGENT_AUTHOR);
    append('memory/log.md', `\n## [${iso.slice(0, 10)}] draft | ${ticker}\n- actor: coverage-desk-agent\n- proposed: ${front.rating}, conviction ${front.conviction}, target ${front.price_target}\n- mandate check: pass\n`);
    await commit('log agent draft', AGENT_AUTHOR);

    write(relPath, coverageFile({ ...front, analyst_status: 'approved', approved_by: 'lead-analyst', approved_at: iso }, body));
    const approveHash = await commit(`review(${ticker}): analyst sign-off\n\nApproved-by: lead-analyst <analyst@coverage-desk.local>`, ANALYST_AUTHOR);
    append('memory/log.md', `\n## [${iso.slice(0, 10)}] approve | ${ticker}\n- actor: lead-analyst\n- ${approveNote}\n`);
    await commit('log approval', ANALYST_AUTHOR);
    return { draftHash, approveHash };
  });
}

const OLD_RULES_MANDATE_SECTION = `## Mandate Constraints
- Minimum market cap for initiation: $2B (micro-caps are out of mandate)
- Rating scale: \`buy\`, \`hold\`, \`sell\` — no invented labels
- A rating cannot flip (\`buy\`↔\`sell\`) in a single revision without an explicit "reversal" note explaining what changed since the prior thesis
`;

async function main() {
  if (fs.existsSync(WORKSPACE)) fs.rmSync(WORKSPACE, { recursive: true, force: true });
  fs.cpSync(TEMPLATE, WORKSPACE, { recursive: true });

  const finalRules = fs.readFileSync(path.join(WORKSPACE, 'RULES.md'), 'utf8');

  g = simpleGit({ baseDir: WORKSPACE, maxConcurrentProcesses: 1 });
  await g.raw(['init', '-b', 'main']);
  // Default identity is the human checker — the workbench's merge/revert/reject
  // actions run as the analyst by default. Agent-authored commits explicitly
  // override --author (see commit() below), so Author still reads correctly
  // even though the default committer identity here is the analyst.
  await g.raw(['config', 'user.name', 'lead-analyst']);
  await g.raw(['config', 'user.email', 'analyst@coverage-desk.local']);
  await g.raw(['config', 'commit.gpgsign', 'false']);

  // ---- Day 42: scaffold, with an earlier, looser mandate ----
  await at(isoAt(42), async () => {
    write('RULES.md', finalRules.replace(/## Mandate Constraints[\s\S]*?(?=\n## )/, OLD_RULES_MANDATE_SECTION));
    await commit('init: scaffold coverage-desk agent from the gitagent/OpenGAP standard template', ANALYST_AUTHOR);
  });

  // ---- Day 40: initiate NVDA ----
  await draftLogApprove(isoAt(40), 'NVDA',
    { ticker: 'NVDA', rating: 'buy', conviction: 3, price_target: 182.00, horizon: '6m', updated: isoAt(40).slice(0, 10), confidence: 0.52 },
    `## Rating rationale\nInitiating coverage. NVDA is up over the trailing month on continued AI data-center demand; conviction 3 reflects a single strong momentum signal without a second corroborating read yet.\n\n## Bull case\n- Data-center demand signal is broad-based, not one customer\n- Momentum is positive and has not stalled at range highs\n\n## Bear case\n- Semiconductors are cyclical and capex-sensitive per desk sector notes; one month of price action is weak evidence alone\n- Valuation already prices in a lot of the AI narrative\n\n## Risk\nIf data-center capex guidance disappoints next quarter, this buy call reverses fast — semis reprice on forward guidance, not trailing momentum.\n\n## Data\nPrice: $176.20, +9.1% over trailing 30 days (range $158.40-$179.90). Source: Yahoo Finance chart API, as of ${isoAt(40)}.\n\n## Signal trace\n- 30-day momentum: +9.1%\n- Momentum magnitude clears the desk's high-conviction threshold\n- Confidence: 0.52`,
    'initiate coverage, buy @ 182 (conviction 3)', 'rating: buy, conviction 3, target 182.00');

  // ---- Day 35: initiate SOFI ----
  await draftLogApprove(isoAt(35), 'SOFI',
    { ticker: 'SOFI', rating: 'hold', conviction: 2, price_target: 10.80, horizon: '6m', updated: isoAt(35).slice(0, 10), confidence: 0.40 },
    `## Rating rationale\nInitiating coverage at hold. Price action is flat over the trailing month — not enough signal in either direction to take a directional call.\n\n## Bull case\n- Deposit growth has been a recurring positive theme in prior quarters\n- Loan-platform fee income is diversifying revenue away from lending-only\n\n## Bear case\n- Rate-sensitive per desk sector notes; a single rate surprise can move this name independent of fundamentals\n- No momentum signal currently supports an upgrade\n\n## Risk\nA regulatory headline (this sector carries real enforcement-action risk per desk notes) could move this name fast in either direction with no warning in the price signal.\n\n## Data\nPrice: $9.40, +0.8% over trailing 30 days (range $9.05-$9.65). Source: Yahoo Finance chart API, as of ${isoAt(35)}.\n\n## Signal trace\n- 30-day momentum: +0.8% (flat)\n- Confidence: 0.40`,
    'initiate coverage, hold @ 10.80 (conviction 2)', 'rating: hold, conviction 2, target 10.80');

  // ---- Day 33: initiate PYPL ----
  await draftLogApprove(isoAt(33), 'PYPL',
    { ticker: 'PYPL', rating: 'hold', conviction: 2, price_target: 68.00, horizon: '6m', updated: isoAt(33).slice(0, 10), confidence: 0.38 },
    `## Rating rationale\nInitiating coverage at hold. Payments names re-rate on valuation compression/expansion more than momentum per desk sector notes, and momentum here is unremarkable.\n\n## Bull case\n- Mature, moat-driven business with durable transaction volume\n- Valuation has already de-rated substantially from prior years, limiting further downside\n\n## Bear case\n- Growth has structurally slowed; no momentum signal currently argues for a re-rate\n- Competitive pressure in checkout from newer entrants continues\n\n## Risk\nIf a competitor takes meaningful share this year, the "mature but stable" bull case stops being true and this should have been a sell, not a hold.\n\n## Data\nPrice: $65.10, -1.4% over trailing 30 days (range $63.80-$67.90). Source: Yahoo Finance chart API, as of ${isoAt(33)}.\n\n## Signal trace\n- 30-day momentum: -1.4% (flat/negative)\n- Confidence: 0.38`,
    'initiate coverage, hold @ 68.00 (conviction 2)', 'rating: hold, conviction 2, target 68.00');

  // ---- Day 28: NVDA revised up ----
  await draftLogApprove(isoAt(28), 'NVDA',
    { ticker: 'NVDA', rating: 'buy', conviction: 4, price_target: 205.00, horizon: '6m', updated: isoAt(28).slice(0, 10), confidence: 0.68 },
    `## Rating rationale\nMomentum extended since initiation; raising conviction to 4 and the target to 205. Two independent signals now corroborate the call rather than one.\n\n## Bull case\n- Momentum has continued for a second consecutive window, not a one-off spike\n- Trading near the top of its 30-day range with no signs of stalling\n\n## Bear case\n- Still primarily a momentum call — no independent fundamentals re-rate confirmed yet\n- Semis are cyclical; this can unwind as fast as it built\n\n## Risk\nA broad AI-capex pullback would hit this name disproportionately given how much of the recent move is narrative-driven rather than confirmed by a second signal type.\n\n## Data\nPrice: $198.40, +12.6% over trailing 30 days (range $176.10-$201.80). Source: Yahoo Finance chart API, as of ${isoAt(28)}.\n\n## Signal trace\n- 30-day momentum: +12.6%\n- Momentum magnitude clears the desk's high-conviction threshold\n- Trading at the top of its 30-day range\n- Confidence: 0.68`,
    'raise conviction to 4, target 205 (momentum continuation)', 'rating: buy, conviction 4, target 205.00');

  // ---- Day 24: SOFI upgraded to buy ----
  await draftLogApprove(isoAt(24), 'SOFI',
    { ticker: 'SOFI', rating: 'buy', conviction: 4, price_target: 13.20, horizon: '6m', updated: isoAt(24).slice(0, 10), confidence: 0.66 },
    `## Rating rationale\nUpgrading from hold to buy. Deposit growth accelerated and the momentum signal now clears the desk's conviction threshold — two corroborating reads support the upgrade.\n\n## Bull case\n- Deposit growth reaccelerated versus the flat trend at initiation\n- Momentum is strong and broad, not a single-day spike\n\n## Bear case\n- Rate-sensitive per desk sector notes; a single Fed surprise can undo this move\n- One quarter of accelerating deposits is not yet a confirmed multi-quarter trend\n\n## Risk\nIf deposit growth was pulled forward (e.g. a promotional rate) rather than structural, this upgrade reverses within a quarter.\n\n## Data\nPrice: $11.35, +20.7% over trailing 30 days (range $9.30-$11.60). Source: Yahoo Finance chart API, as of ${isoAt(24)}.\n\n## Signal trace\n- 30-day momentum: +20.7%\n- Momentum magnitude clears the desk's high-conviction threshold\n- Trading at the top of its 30-day range\n- Confidence: 0.66`,
    'upgrade to buy, target 13.20 (conviction 4)', 'rating: buy, conviction 4, target 13.20');

  // ---- Day 20: NVDA overreach — the bad call ----
  const nvdaBad = await draftLogApprove(isoAt(20), 'NVDA',
    { ticker: 'NVDA', rating: 'buy', conviction: 5, price_target: 262.00, horizon: '6m', updated: isoAt(20).slice(0, 10), confidence: 0.81 },
    `## Rating rationale\nMomentum remains strong; raising conviction to 5 on continued strength.\n\n## Bull case\n- Momentum remains firmly positive\n- Trading at 30-day highs\n\n## Bear case\n- Valuation is stretched even by this desk's own prior notes\n- A single guidance miss unwinds this fast\n\n## Risk\nThis target assumes the current run-rate holds for two more quarters with no confirmation beyond price action alone.\n\n## Data\nPrice: $224.10, +18.4% over trailing 30 days (range $199.20-$226.80). Source: Yahoo Finance chart API, as of ${isoAt(20)}.\n\n## Signal trace\n- 30-day momentum: +18.4%\n- Trading at the top of its 30-day range\n- Confidence: 0.81`,
    'raise conviction to 5, target 262 (momentum acceleration)', 'rating: buy, conviction 5, target 262.00 — approved under time pressure ahead of a desk offsite; see memory/log.md revert entry for the correction');

  // ---- Day 14: mandate tightened in direct response to the NVDA overreach ----
  await at(isoAt(14), async () => {
    write('RULES.md', finalRules);
    await commit('amend(RULES): require 3+ corroborating signals for conviction 5\n\nDirect response to the NVDA conviction-5 call on ' + isoAt(20).slice(0, 10) + ' — one momentum read is not sufficient support for the top conviction tier. See memory/log.md.', ANALYST_AUTHOR);
    append('memory/log.md', `\n## [${isoAt(14).slice(0, 10)}] mandate-amend | RULES.md\n- actor: lead-analyst\n- change: conviction 5 now requires 3+ corroborating signals in the draft\n- reason: the NVDA conviction-5 call on ${isoAt(20).slice(0, 10)} was approved on one signal and proved too aggressive\n`);
    await commit('log mandate amendment', ANALYST_AUTHOR);
  });

  // ---- Day 13: revert the NVDA overreach ----
  await at(isoAt(13), async () => {
    await g.raw(['revert', '--no-edit', nvdaBad.approveHash]);
    await g.raw(['revert', '--no-edit', nvdaBad.draftHash]);
    append('memory/log.md', `\n## [${isoAt(13).slice(0, 10)}] revert | NVDA\n- actor: lead-analyst\n- reverted: ${nvdaBad.draftHash.slice(0, 8)} and ${nvdaBad.approveHash.slice(0, 8)}\n- reason: conviction-5 call on ${isoAt(20).slice(0, 10)} relied on one signal; mandate has since been tightened to require 3+. Restoring the prior buy/conviction-4/target-205 record while coverage is refreshed under the new rule.\n`);
    await commit('log revert', ANALYST_AUTHOR);
  });

  // ---- Day 8: SOFI reversal — buy to sell on a regulatory headline ----
  await draftLogApprove(isoAt(8), 'SOFI',
    { ticker: 'SOFI', rating: 'sell', conviction: 4, price_target: 8.60, horizon: '6m', updated: isoAt(8).slice(0, 10), confidence: 0.70 },
    `## Rating rationale\nReversal: moving from buy to sell. A regulatory enforcement headline hit the name this window — exactly the tail risk flagged in this sector's bear case since initiation — and the price signal has flipped hard negative.\n\n## Bull case\n- Deposit franchise itself is unaffected by the headline so far\n- Prior fundamentals (accelerating deposits) have not been contradicted, only overshadowed\n\n## Bear case\n- Regulatory overhang typically takes multiple quarters to resolve and caps multiple expansion in the meantime\n- Momentum has flipped sharply negative, confirming the market is pricing real risk, not noise\n\n## Risk\nIf the enforcement matter resolves quickly with a limited fine, this sell call will look like it chased a headline rather than a structural change.\n\n## Data\nPrice: $8.90, -21.6% over trailing 30 days (range $8.70-$11.50). Source: Yahoo Finance chart API, as of ${isoAt(8)}.\n\n## Signal trace\n- 30-day momentum: -21.6%\n- Momentum magnitude clears the desk's high-conviction threshold\n- Trading at the bottom of its 30-day range\n- Sector context: regulatory headline risk flagged at initiation, now realized\n- Confidence: 0.70`,
    'reversal to sell, target 8.60 (regulatory headline)', 'rating: sell, conviction 4, target 8.60 — reversal approved, headline risk confirmed');

  // ---- Day 2: PYPL — agent drafts an upgrade, left pending for the analyst ----
  await at(isoAt(2), async () => {
    const branch = 'review/pypl-pending-demo';
    await g.checkout('main');
    await g.checkoutLocalBranch(branch);
    const relPath = 'memory/coverage/PYPL.md';
    const content = coverageFile(
      { ticker: 'PYPL', rating: 'buy', conviction: 3, price_target: 74.50, horizon: '6m', updated: isoAt(2).slice(0, 10), analyst_status: 'draft', confidence: 0.55 },
      `## Rating rationale\nReversal: moving from hold to buy is not triggered here (hold→buy is not a buy/sell flip), but this is still a meaningful upgrade. Momentum turned positive for the first time since initiation and now clears the desk's conviction-3 threshold.\n\n## Bull case\n- First positive momentum window since initiation\n- Valuation was already compressed; a re-rate has more room than a re-de-rate\n\n## Bear case\n- One positive window after a long flat/negative stretch could be noise, not a trend\n- Competitive share loss thesis from initiation has not been resolved, only overshadowed by price action\n\n## Risk\nIf this month's move is a short-covering bounce rather than a fundamentals inflection, this upgrade will need to be reversed within a quarter.\n\n## Data\nPrice: $71.80, +10.3% over trailing 30 days (range $64.90-$72.40). Source: Yahoo Finance chart API, as of ${isoAt(2)}.\n\n## Signal trace\n- 30-day momentum: +10.3%\n- Momentum magnitude clears the desk's high-conviction threshold\n- Confidence: 0.55`
    );
    write(relPath, content);
    await g.add([relPath]);
    await g.commit('draft(PYPL): upgrade to buy, target 74.50 (conviction 3)', undefined, { '--author': AGENT_AUTHOR });
    append('memory/log.md', `\n## [${isoAt(2).slice(0, 10)}] draft | PYPL\n- actor: coverage-desk-agent\n- branch: ${branch}\n- proposed: buy, conviction 3, target 74.50\n- mandate check: pass\n- status: awaiting analyst review\n`);
    await g.add(['memory/log.md']);
    await g.commit('log agent draft', undefined, { '--author': AGENT_AUTHOR });
    await g.checkout('main');
  });

  // ---- Day 1: refresh the portfolio snapshot ----
  await at(isoAt(1), async () => {
    const memory = `# Coverage Memory\n\n## Structure\n- \`coverage/<TICKER>.md\` — one file per covered ticker. This file *is* the recommendation. Every revision is a commit; the file's git history is the full audit trail of how the call changed and why.\n- \`log.md\` — append-only record of every draft, approval, rejection, and revert\n- \`MEMORY.md\` (this file) — portfolio-level snapshot, kept under 200 lines\n\n## Portfolio Snapshot (as of ${isoAt(1).slice(0, 10)})\n- Active coverage: NVDA (buy), SOFI (sell), PYPL (hold, upgrade pending review)\n- Not yet covered: RIVN\n- Out of mandate: GMBL (below $2B market-cap floor)\n- Open incidents: NVDA conviction-5 call reverted ${isoAt(13).slice(0, 10)}; mandate tightened same week (see RULES.md history)\n\n## Last Known State\nUpdated by the workbench after each approval/rejection/revert. See \`log.md\` for the full chronological record.\n`;
    write('memory/MEMORY.md', memory);
    await commit('chore: refresh portfolio snapshot', ANALYST_AUTHOR);
  });

  const commitCount = (await g.raw(['rev-list', '--count', 'main'])).trim();
  console.log(`Seeded agent-workspace with ${commitCount} commits on main.`);
  console.log('Branches:', (await g.branchLocal()).all.join(', '));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
