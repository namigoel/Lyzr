#!/usr/bin/env node
// Mandate check — the deterministic form of skills/mandate-check/SKILL.md.
// Usable two ways:
//   1. Required as a module: exports checkDraft(frontmatter, body, ctx)
//   2. Run standalone per the gitagent hook I/O protocol (JSON on stdin, JSON on stdout)

const RATING_VALUES = new Set(['buy', 'hold', 'sell']);

function checkDraft(frontmatter, body, ctx = {}) {
  const checks = [];
  const push = (name, pass, reason) => checks.push({ name, pass, reason });

  const hasSection = (heading) =>
    new RegExp(`^##\\s+${heading}`, 'im').test(body) &&
    body
      .split(new RegExp(`^##\\s+${heading}`, 'im'))[1]
      ?.split(/^##\s+/m)[0]
      ?.trim().length > 0;

  push('bull_and_bear_present', hasSection('bull case') && hasSection('bear case'),
    'Both a bull case and a bear case section must be present and non-empty.');

  push('risk_stated', hasSection('risk'),
    'A risk section naming a concrete way the thesis is wrong must be present.');

  const hasTarget = frontmatter.price_target != null && frontmatter.price_target !== 'unavailable';
  const hasHorizon = !!frontmatter.horizon;
  push('target_and_horizon', hasTarget && hasHorizon,
    'price_target and horizon must both be set, or price_target explicitly "unavailable".');

  push('mandate_floor', ctx.mandateEligible !== false,
    ctx.mandateEligible === false
      ? `Ticker is below the mandate market-cap floor (${ctx.tier || 'unknown tier'}).`
      : 'Ticker clears the mandate market-cap floor.');

  push('rating_vocabulary', RATING_VALUES.has(frontmatter.rating),
    'rating must be exactly one of buy, hold, sell.');

  const priorRating = ctx.priorRating;
  const isReversal = priorRating && priorRating !== frontmatter.rating &&
    ((priorRating === 'buy' && frontmatter.rating === 'sell') ||
     (priorRating === 'sell' && frontmatter.rating === 'buy'));
  const hasReversalNote = /reversal:/i.test(body);
  push('reversal_note', !isReversal || hasReversalNote,
    isReversal
      ? (hasReversalNote ? 'Reversal correctly flagged.' : 'Rating flipped buy/sell with no "Reversal:" line.')
      : 'No buy/sell reversal in this revision.');

  const signalCount = (body.match(/^-\s+/gm) || []).length;
  const convictionOk = frontmatter.conviction < 5 || signalCount >= 3;
  push('conviction_justified', convictionOk,
    frontmatter.conviction >= 5
      ? `Conviction 5 requires 3+ corroborating bullets; found ${signalCount}.`
      : 'Conviction level is within what the draft supports.');

  push('no_fabrication', ctx.noFabrication !== false,
    'Numeric fields must cite a source or be marked unavailable.');

  const blocked = checks.some((c) => !c.pass);
  return { checks, blocked };
}

async function runAsHook() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  const { frontmatter = {}, body = '', context = {} } = input.data || {};
  const result = checkDraft(frontmatter, body, context);
  process.stdout.write(JSON.stringify({
    action: result.blocked ? 'block' : 'allow',
    modifications: null,
    audit: { logged: true, checks: result.checks },
  }));
}

module.exports = { checkDraft };

if (require.main === module) {
  runAsHook();
}
