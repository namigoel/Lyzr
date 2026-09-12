// The agent loop: research -> draft -> mandate-check -> (stop; human takes it from here).
// Deterministic by default so the workbench runs with zero API keys. If
// ANTHROPIC_API_KEY is set, the narrative synthesis step is delegated to Claude
// instead of the template — everything else (tool call, mandate gate, branch/commit)
// is identical either way.

const path = require('path');
const matter = require('gray-matter');
const git = require('./git');
const { fetchQuote } = require('./tools');
const { tickerInfo, sectorNote } = require('./knowledge');

function loadMandateCheck() {
  // Required from the live workspace (a copy of agent-template) so the workbench
  // and a real gitagent-driven run enforce the identical, single-sourced rule.
  const p = path.join(git.WORKSPACE, 'hooks', 'scripts', 'mandate-check.js');
  delete require.cache[require.resolve(p)];
  return require(p);
}

async function research(ticker) {
  const info = tickerInfo(ticker);
  if (!info) {
    return { mandateEligible: false, reason: `${ticker} is not in knowledge/universe.md.` };
  }
  if (!info.inMandate) {
    return { mandateEligible: false, reason: `${ticker} is below the mandate market-cap floor (${info.tier}).`, info };
  }

  const quote = await fetchQuote({ ticker, lookback_days: 30 });
  const priorRaw = await git.fileAtRef('main', `${git.COVERAGE_DIR}/${ticker}.md`);
  const prior = priorRaw ? matter(priorRaw) : null;

  const signals = [];
  let confidence = 0.35;
  let momentumBias = 0;

  if (!quote.unavailable) {
    momentumBias = quote.change_pct;
    signals.push(`30-day momentum: ${quote.change_pct >= 0 ? '+' : ''}${quote.change_pct}%`);
    if (Math.abs(quote.change_pct) >= 8) signals.push('Momentum magnitude clears the desk\'s high-conviction threshold');
    if (quote.price >= quote.range_high * 0.97) signals.push('Trading at the top of its 30-day range');
    if (quote.price <= quote.range_low * 1.03) signals.push('Trading at the bottom of its 30-day range');
    confidence = clamp(0.4 + Math.abs(quote.change_pct) / 40, 0.3, 0.85);
  } else {
    signals.push('fetch-quote returned unavailable — momentum signal withheld, confidence capped');
    confidence = 0.3;
  }

  const note = sectorNote(info.sector);
  if (note) signals.push(`Sector context (${info.sector}): ${note.split('\n')[0]}`);

  return {
    mandateEligible: true,
    info,
    quote,
    prior: prior ? prior.data : null,
    signals,
    confidence,
    momentumBias,
  };
}

function decide(research) {
  const { momentumBias, confidence, prior } = research;
  let rating = 'hold';
  if (momentumBias >= 6) rating = 'buy';
  else if (momentumBias <= -6) rating = 'sell';

  let conviction = 2;
  const mag = Math.abs(momentumBias);
  if (mag >= 12) conviction = 5;
  else if (mag >= 6) conviction = 4;
  else if (mag >= 3) conviction = 3;

  if (conviction >= 5 && research.signals.length < 3) conviction = 4;

  const price = research.quote.unavailable ? null : research.quote.price;
  const projectedMovePct = clamp(momentumBias * 0.5, -25, 25) / 100;
  const priceTarget = price ? round2(price * (1 + projectedMovePct)) : 'unavailable';

  const priorRating = prior?.rating;
  const isReversal = priorRating && priorRating !== rating &&
    ((priorRating === 'buy' && rating === 'sell') || (priorRating === 'sell' && rating === 'buy'));

  return { rating, conviction, priceTarget, isReversal, priorRating };
}

function renderThesis(ticker, r, d) {
  const today = new Date().toISOString().slice(0, 10);
  const front = {
    ticker,
    rating: d.rating,
    conviction: d.conviction,
    price_target: d.priceTarget,
    horizon: '6m',
    updated: today,
    analyst_status: 'draft',
    confidence: round2(r.confidence),
  };

  const reversalLine = d.isReversal
    ? `Reversal: moving from ${d.priorRating} to ${d.rating}. `
    : '';

  const rationale = r.quote.unavailable
    ? `${reversalLine}Market data was unavailable for this run (fetch-quote returned unavailable), so this revision is conservative and confidence is capped at ${r.confidence}.`
    : `${reversalLine}${ticker} moved ${r.quote.change_pct >= 0 ? '+' : ''}${r.quote.change_pct}% over the trailing 30 days to $${r.quote.price}, which is the primary driver of this call. Conviction ${d.conviction}/5 reflects ${r.signals.length} corroborating signal(s) below.`;

  const bull = bulletsFor('bull', r, d);
  const bear = bulletsFor('bear', r, d);

  const dataLine = r.quote.unavailable
    ? `Price: unavailable (source: ${r.quote.source}, as of ${r.quote.as_of}).`
    : `Price: $${r.quote.price}, ${r.quote.change_pct >= 0 ? '+' : ''}${r.quote.change_pct}% over trailing 30 days (range $${r.quote.range_low}–$${r.quote.range_high}). Source: ${r.quote.source}, as of ${r.quote.as_of}.`;

  const body = `## Rating rationale\n${rationale}\n\n## Bull case\n${bull}\n\n## Bear case\n${bear}\n\n## Risk\n${riskLine(r, d)}\n\n## Data\n${dataLine}\n\n## Signal trace\n${r.signals.map((s) => `- ${s}`).join('\n')}\n- Confidence: ${round2(r.confidence)}\n`;

  return matter.stringify(body, front);
}

function bulletsFor(side, r, d) {
  const info = r.info;
  const pts = [];
  if (side === 'bull') {
    if (d.rating !== 'sell') pts.push(`${d.conviction >= 4 ? 'Strong' : 'Modest'} recent momentum supports the current price level`);
    pts.push(`${info.sector} sector context: upside case holds if the trend documented in knowledge/sectors.md continues`);
    if (r.quote.price && r.quote.range_high && r.quote.price >= r.quote.range_high * 0.9) pts.push('Trading near its 30-day high — momentum has not stalled yet');
  } else {
    pts.push(`${info.sector} is flagged in knowledge/sectors.md as a sector where a single month of price action is weak evidence on its own`);
    pts.push('The signal driving this call is a single-window momentum read, not a fundamentals re-rate — it can reverse as quickly as it appeared');
    if (r.quote.unavailable) pts.push('No live data this run — the bear case is that this call is under-informed until the next refresh');
  }
  return pts.map((p) => `- ${p}`).join('\n');
}

function riskLine(r, d) {
  if (r.quote.unavailable) return 'The concrete risk here is acting on stale/no data — this thesis should be re-run before it is relied on.';
  return `If the ${r.quote.change_pct >= 0 ? 'rally' : 'selloff'} that drove this ${d.rating} call reverses within the ${'6m'} horizon, the price target of ${d.priceTarget} will be wrong in the direction opposite the current call.`;
}

async function proposeRevision(ticker) {
  const r = await research(ticker);
  if (!r.mandateEligible) {
    return { blocked: true, outOfMandate: true, reason: r.reason };
  }
  const d = decide(r);
  const content = renderThesis(ticker, r, d);
  const parsed = matter(content);

  const { checkDraft } = loadMandateCheck();
  const check = checkDraft(parsed.data, parsed.content, {
    mandateEligible: true,
    tier: r.info.tier,
    priorRating: d.priorRating,
    noFabrication: true,
  });

  if (check.blocked) {
    return { blocked: true, checks: check.checks, content, ticker };
  }

  const branch = `review/${ticker.toLowerCase()}-${Date.now()}`;
  await git.createReviewBranch(branch);
  const commit = await git.commitOnBranch(
    branch,
    `${git.COVERAGE_DIR}/${ticker}.md`,
    content,
    `draft(${ticker}): ${d.rating} @ ${d.priceTarget} (conviction ${d.conviction})`,
    'coverage-desk-agent <agent@coverage-desk.local>',
  );

  await git.appendAndCommit(
    'memory/log.md',
    `\n## [${new Date().toISOString().slice(0, 10)}] draft | ${ticker}\n- actor: coverage-desk-agent\n- branch: ${branch}\n- proposed: ${d.rating}, conviction ${d.conviction}, target ${d.priceTarget}\n- mandate check: pass (${check.checks.length} checks)\n`,
    'log agent draft',
    'main',
    'coverage-desk-agent <agent@coverage-desk.local>',
  );

  return { blocked: false, branch, commit, checks: check.checks, content, ticker };
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function round2(n) { return Math.round(n * 100) / 100; }

module.exports = { research, decide, renderThesis, proposeRevision, loadMandateCheck };
