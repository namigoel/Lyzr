const path = require('path');
const fs = require('fs');
const express = require('express');
const matter = require('gray-matter');

const git = require('./lib/git');
const opengap = require('./lib/opengap');
const agentEngine = require('./lib/agentEngine');
const { universe } = require('./lib/knowledge');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const TICKER_RE = /^[A-Z]{1,6}$/;
function validTicker(req, res, next) {
  const t = (req.params.ticker || '').toUpperCase();
  if (!TICKER_RE.test(t)) return res.status(400).json({ error: 'invalid ticker' });
  req.ticker = t;
  next();
}

function requireWorkspace(req, res, next) {
  if (!fs.existsSync(path.join(git.WORKSPACE, '.git'))) {
    return res.status(503).json({ error: 'workspace not initialized — run `npm run seed` first' });
  }
  next();
}
app.use('/api', requireWorkspace);

// ---------- Coverage ----------

app.get('/api/coverage', async (req, res) => {
  const branches = await git.listBranches();
  const reviewBranches = branches.filter((b) => b.startsWith('review/'));
  const list = universe();
  const out = [];
  for (const u of list) {
    const raw = await git.fileAtRef('main', `${git.COVERAGE_DIR}/${u.ticker}.md`);
    const parsed = raw ? matter(raw) : null;
    const pending = reviewBranches.filter((b) => b.startsWith(`review/${u.ticker.toLowerCase()}-`));
    out.push({
      ...u,
      covered: !!parsed,
      rating: parsed?.data.rating || null,
      conviction: parsed?.data.conviction || null,
      priceTarget: parsed?.data.price_target ?? null,
      updated: parsed?.data.updated || null,
      analystStatus: parsed?.data.analyst_status || null,
      pendingReview: pending[0] || null,
    });
  }
  res.json(out);
});

app.get('/api/coverage/:ticker', validTicker, async (req, res) => {
  const ticker = req.ticker;
  const relPath = `${git.COVERAGE_DIR}/${ticker}.md`;
  const raw = await git.fileAtRef('main', relPath);
  const parsed = raw ? matter(raw) : null;
  const history = await git.fileHistory(relPath, 'main');
  const branches = await git.listBranches();
  const pending = branches.filter((b) => b.startsWith(`review/${ticker.toLowerCase()}-`));

  const pendingDetails = [];
  for (const branch of pending) {
    const diff = await git.diffWorkingBranch(branch, relPath);
    const branchRaw = await git.fileAtRef(branch, relPath);
    pendingDetails.push({ branch, diff, content: branchRaw, frontmatter: branchRaw ? matter(branchRaw).data : null });
  }

  res.json({
    ticker,
    content: parsed?.content || null,
    frontmatter: parsed?.data || null,
    raw,
    history,
    pending: pendingDetails,
  });
});

app.post('/api/coverage/:ticker/research', validTicker, async (req, res) => {
  try {
    const result = await agentEngine.proposeRevision(req.ticker);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/coverage/:ticker/approve', validTicker, async (req, res) => {
  const ticker = req.ticker;
  const { branch, editedContent } = req.body || {};
  if (!branch) return res.status(400).json({ error: 'branch required' });
  try {
    const relPath = `${git.COVERAGE_DIR}/${ticker}.md`;
    let finalContent = editedContent;
    if (!finalContent) {
      finalContent = await git.fileAtRef(branch, relPath);
    }
    const parsed = matter(finalContent);

    const { checkDraft } = agentEngine.loadMandateCheck();
    const check = checkDraft(parsed.data, parsed.content, { mandateEligible: true, priorRating: null, noFabrication: true });
    if (check.blocked) {
      return res.status(400).json({ error: 'mandate check failed on final content', checks: check.checks });
    }

    parsed.data.analyst_status = 'approved';
    parsed.data.approved_by = 'lead-analyst';
    parsed.data.approved_at = new Date().toISOString();
    const approvedContent = matter.stringify(parsed.content, parsed.data);

    await git.commitOnBranch(
      branch,
      relPath,
      approvedContent,
      `review(${ticker}): analyst sign-off\n\nApproved-by: lead-analyst <analyst@coverage-desk.local>`,
      'lead-analyst <analyst@coverage-desk.local>',
    );

    const commit = await git.mergeBranch(branch, `approve(${ticker}): merge reviewed coverage into record`);

    await git.appendAndCommit(
      'memory/log.md',
      `\n## [${new Date().toISOString().slice(0, 10)}] approve | ${ticker}\n- actor: lead-analyst\n- merged: ${branch}\n- rating: ${parsed.data.rating}, conviction ${parsed.data.conviction}, target ${parsed.data.price_target}\n`,
      'log approval',
      'main',
      'lead-analyst <analyst@coverage-desk.local>',
    );

    res.json({ ok: true, commit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/coverage/:ticker/reject', validTicker, async (req, res) => {
  const ticker = req.ticker;
  const { branch, reason } = req.body || {};
  if (!branch) return res.status(400).json({ error: 'branch required' });
  try {
    await git.deleteBranch(branch);
    await git.appendAndCommit(
      'memory/log.md',
      `\n## [${new Date().toISOString().slice(0, 10)}] reject | ${ticker}\n- actor: lead-analyst\n- rejected: ${branch}\n- reason: ${reason || 'no reason given'}\n`,
      'log rejection',
      'main',
      'lead-analyst <analyst@coverage-desk.local>',
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/coverage/:ticker/revert', validTicker, async (req, res) => {
  const ticker = req.ticker;
  const { hash, reason } = req.body || {};
  if (!hash) return res.status(400).json({ error: 'hash required' });
  try {
    const commit = await git.revertCommit(hash);
    await git.appendAndCommit(
      'memory/log.md',
      `\n## [${new Date().toISOString().slice(0, 10)}] revert | ${ticker}\n- actor: lead-analyst\n- reverted: ${hash.slice(0, 8)}\n- reason: ${reason || 'no reason given'}\n`,
      'log revert',
      'main',
      'lead-analyst <analyst@coverage-desk.local>',
    );
    res.json({ ok: true, commit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/coverage/:ticker/diff', validTicker, async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  const relPath = `${git.COVERAGE_DIR}/${req.ticker}.md`;
  const diff = await git.diffRefs(from, to, relPath);
  res.json({ diff });
});

// ---------- Rules (the mandate is versioned too) ----------

app.get('/api/rules', async (req, res) => {
  const raw = await git.fileAtRef('main', 'RULES.md');
  const history = await git.fileHistory('RULES.md', 'main');
  const branches = await git.listBranches();
  const pending = branches.filter((b) => b.startsWith('rules/'));
  res.json({ content: raw, history, pending });
});

app.post('/api/rules/propose', async (req, res) => {
  const { content, note } = req.body || {};
  if (!content) return res.status(400).json({ error: 'content required' });
  const branch = `rules/change-${Date.now()}`;
  try {
    await git.createReviewBranch(branch);
    const commit = await git.commitOnBranch(branch, 'RULES.md', content, `propose(rules): ${note || 'mandate change'}`, 'lead-analyst <analyst@coverage-desk.local>');
    const diff = await git.diffWorkingBranch(branch, 'RULES.md');
    res.json({ branch, commit, diff });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/rules/approve', async (req, res) => {
  const { branch } = req.body || {};
  if (!branch) return res.status(400).json({ error: 'branch required' });
  try {
    const commit = await git.mergeBranch(branch, 'approve(rules): merge mandate change');
    res.json({ ok: true, commit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/rules/reject', async (req, res) => {
  const { branch } = req.body || {};
  if (!branch) return res.status(400).json({ error: 'branch required' });
  try {
    await git.deleteBranch(branch);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Memory / branches / harness ----------

app.get('/api/memory', async (req, res) => {
  const memory = await git.fileAtRef('main', 'memory/MEMORY.md');
  const log = await git.fileAtRef('main', 'memory/log.md');
  const entries = (log || '').split(/\n(?=## )/).filter((e) => e.trim().startsWith('## ')).reverse();
  res.json({ memory, log: entries.slice(0, 30) });
});

app.get('/api/branches', async (req, res) => {
  res.json(await git.listBranches());
});

app.get('/api/harness/:cmd', async (req, res) => {
  const cmd = req.params.cmd;
  if (!['validate', 'info', 'audit'].includes(cmd)) return res.status(404).end();
  const result = await opengap[cmd]();
  res.json(result);
});

const PORT = process.env.PORT || 4173;
app.listen(PORT, () => {
  console.log(`Coverage Desk running at http://localhost:${PORT}`);
});
