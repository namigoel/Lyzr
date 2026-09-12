/* Coverage Desk workbench — plain JS, no build step. */

const state = {
  view: 'coverage',
  coverage: [],
  selectedTicker: null,
  detail: null,
  activeTab: 'thesis',
  rules: null,
  memory: null,
  harnessOutput: {},
  harnessLoading: null,
  busy: false,
  editingBranch: null,
  editingContent: null,
  rejectingBranch: null,
  rejectReason: '',
  revertingHash: null,
  revertReason: '',
  diffFrom: null,
  diffTo: null,
  rulesDraft: null,
  rulesProposedDiff: null,
  rulesProposedBranch: null,
};

// ---------- API helpers ----------

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `request failed (${res.status})`);
  return body;
}

function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 5200);
}

// ---------- Utilities ----------

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function shortHash(h) { return (h || '').slice(0, 8); }

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function ratingPillClass(rating) {
  if (rating === 'buy') return 'buy';
  if (rating === 'sell') return 'sell';
  if (rating === 'hold') return 'hold';
  return 'neutral';
}

function convictionDots(n) {
  const filled = n || 0;
  let html = '<div class="conviction-dots">';
  for (let i = 1; i <= 5; i += 1) html += `<span class="${i <= filled ? 'filled' : ''}"></span>`;
  return html + '</div>';
}

// Minimal markdown -> HTML for thesis bodies (## headings, - lists, **bold**, `code`).
function mdToHtml(md) {
  if (!md) return '';
  const inline = (s) => escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>');

  const blocks = md.split(/\n(?=## )/);
  return blocks.map((block) => {
    const lines = block.split('\n');
    let out = '';
    if (lines[0].startsWith('## ')) {
      out += `<h2>${inline(lines[0].slice(3).trim())}</h2>`;
      lines.shift();
    }
    const body = lines.join('\n').trim();
    if (!body) return out;
    const paras = body.split(/\n{2,}/);
    for (const para of paras) {
      const plines = para.split('\n').filter((l) => l.trim().length);
      if (!plines.length) continue;
      if (plines.every((l) => l.trim().startsWith('- '))) {
        out += '<ul>' + plines.map((l) => `<li>${inline(l.trim().slice(2))}</li>`).join('') + '</ul>';
      } else {
        out += `<p>${plines.map(inline).join('<br/>')}</p>`;
      }
    }
    return out;
  }).join('');
}

function renderDiffText(diff) {
  if (!diff || !diff.trim()) return '<span class="d-ctx">No differences.</span>';
  return diff.split('\n').map((line) => {
    const esc = escapeHtml(line);
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff --git') || line.startsWith('index ')) return `<span class="d-meta">${esc}</span>`;
    if (line.startsWith('@@')) return `<span class="d-hunk">${esc}</span>`;
    if (line.startsWith('+')) return `<span class="d-add">${esc}</span>`;
    if (line.startsWith('-')) return `<span class="d-del">${esc}</span>`;
    return `<span class="d-ctx">${esc}</span>`;
  }).join('\n');
}

function parseLogEntries(entries) {
  return entries.map((raw) => {
    const m = raw.match(/^## \[(.+?)\]\s+(\S+)\s+\|\s+(.+)/);
    if (!m) return { date: '', op: 'note', subject: raw.trim(), body: '' };
    const [, date, op, subject] = m;
    const body = raw.split('\n').slice(1).join('\n').trim();
    return { date, op, subject, body };
  });
}

// ---------- Data loading ----------

async function loadCoverage() {
  state.coverage = await api('/api/coverage');
}

async function loadDetail(ticker) {
  state.detail = await api(`/api/coverage/${ticker}`);
  state.diffFrom = null;
  state.diffTo = null;
  state.editingBranch = null;
  state.editingContent = null;
}

async function loadRules() {
  state.rules = await api('/api/rules');
}

async function loadMemory() {
  state.memory = await api('/api/memory');
}

async function refreshAll() {
  await Promise.all([loadCoverage(), loadMemory(), state.rules ? loadRules() : Promise.resolve()]);
}

// ---------- Actions ----------

async function selectTicker(ticker) {
  state.selectedTicker = ticker;
  state.activeTab = 'thesis';
  render();
  await loadDetail(ticker);
  render();
}

async function runResearch(ticker) {
  state.busy = true; render();
  try {
    const result = await api(`/api/coverage/${ticker}/research`, { method: 'POST' });
    if (result.blocked && result.outOfMandate) {
      toast(result.reason, 'error');
    } else if (result.blocked) {
      toast('Draft failed the mandate check — see the blocked checks below.', 'error');
      state.detail = { ...state.detail, lastBlocked: result };
    } else {
      toast(`Agent proposed a revision for ${ticker} on ${result.branch}`, 'success');
      await loadDetail(ticker);
      await loadCoverage();
    }
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    state.busy = false; render();
  }
}

async function approveBranch(ticker, branch) {
  state.busy = true; render();
  try {
    const editedContent = state.editingBranch === branch ? state.editingContent : undefined;
    await api(`/api/coverage/${ticker}/approve`, { method: 'POST', body: JSON.stringify({ branch, editedContent }) });
    toast(`${ticker} approved into the record`, 'success');
    state.editingBranch = null; state.editingContent = null;
    await loadDetail(ticker);
    await loadCoverage();
    await loadMemory();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    state.busy = false; render();
  }
}

async function confirmReject(ticker, branch) {
  state.busy = true; render();
  try {
    await api(`/api/coverage/${ticker}/reject`, { method: 'POST', body: JSON.stringify({ branch, reason: state.rejectReason }) });
    toast(`${ticker} draft rejected`, 'success');
    state.rejectingBranch = null; state.rejectReason = '';
    await loadDetail(ticker);
    await loadCoverage();
    await loadMemory();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    state.busy = false; render();
  }
}

async function confirmRevert(ticker, hash) {
  state.busy = true; render();
  try {
    await api(`/api/coverage/${ticker}/revert`, { method: 'POST', body: JSON.stringify({ hash, reason: state.revertReason }) });
    toast(`Reverted ${shortHash(hash)} on main`, 'success');
    state.revertingHash = null; state.revertReason = '';
    await loadDetail(ticker);
    await loadCoverage();
    await loadMemory();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    state.busy = false; render();
  }
}

async function loadDiffPair(ticker, from, to) {
  const { diff } = await api(`/api/coverage/${ticker}/diff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  return diff;
}

async function runHarness(cmd) {
  state.harnessLoading = cmd; render();
  try {
    const result = await api(`/api/harness/${cmd}`);
    state.harnessOutput[cmd] = result.output;
  } catch (err) {
    state.harnessOutput[cmd] = `Error: ${err.message}`;
  } finally {
    state.harnessLoading = null; render();
  }
}

async function proposeRulesChange() {
  const content = state.rulesDraft;
  if (!content) return;
  state.busy = true; render();
  try {
    const result = await api('/api/rules/propose', { method: 'POST', body: JSON.stringify({ content, note: 'analyst mandate revision' }) });
    state.rulesProposedBranch = result.branch;
    state.rulesProposedDiff = result.diff;
    toast('Mandate change drafted on a review branch', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    state.busy = false; render();
  }
}

async function approveRulesChange() {
  state.busy = true; render();
  try {
    await api('/api/rules/approve', { method: 'POST', body: JSON.stringify({ branch: state.rulesProposedBranch }) });
    toast('Mandate change merged into main', 'success');
    state.rulesProposedBranch = null; state.rulesProposedDiff = null; state.rulesDraft = null;
    await loadRules();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    state.busy = false; render();
  }
}

async function rejectRulesChange() {
  state.busy = true; render();
  try {
    await api('/api/rules/reject', { method: 'POST', body: JSON.stringify({ branch: state.rulesProposedBranch }) });
    toast('Mandate change discarded', 'success');
    state.rulesProposedBranch = null; state.rulesProposedDiff = null;
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    state.busy = false; render();
  }
}

// ---------- Rendering ----------

function render() {
  const layout = document.getElementById('layout');
  document.querySelectorAll('#view-nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
  if (state.view === 'mandate') {
    layout.innerHTML = renderMandateView();
  } else {
    layout.innerHTML = renderCoverageLeft() + renderCoverageCenter() + renderCoverageRight();
  }
  attachHandlers();
}

function renderCoverageLeft() {
  const rows = state.coverage.map((c) => {
    const classes = ['ticker-row'];
    if (c.ticker === state.selectedTicker) classes.push('active');
    if (!c.inMandate) classes.push('out-of-mandate');
    if (!c.covered) classes.push('uncovered');
    const badge = !c.inMandate
      ? '<span class="pill neutral">OUT</span>'
      : c.pendingReview
        ? '<span class="pill review">review</span>'
        : c.covered
          ? `<span class="pill ${ratingPillClass(c.rating)}">${c.rating}</span>`
          : '<span class="pill neutral">new</span>';
    return `<div class="${classes.join(' ')}" data-ticker="${c.ticker}">
      <span class="t-symbol">${c.ticker}</span>
      <span class="t-meta"><div class="t-company">${escapeHtml(c.company)}</div></span>
      <span class="t-badges">${badge}</span>
    </div>`;
  }).join('');

  return `<div class="pane pane-left">
    <div class="pane-section"><h3>Coverage &amp; Universe</h3></div>
    ${rows}
  </div>`;
}

function renderCoverageCenter() {
  if (!state.selectedTicker) {
    return `<div class="pane pane-center"><div class="empty-state">Select a ticker to view its thesis, history, and data.<br/><br/>Try <strong>RIVN</strong> (not yet covered — ask the agent to initiate) or <strong>GMBL</strong> (below the mandate floor — watch it get declined).</div></div>`;
  }
  if (!state.detail || state.detail.ticker !== state.selectedTicker) {
    return `<div class="pane pane-center"><div class="loading">Loading ${state.selectedTicker}…</div></div>`;
  }
  const d = state.detail;
  const covRow = state.coverage.find((c) => c.ticker === state.selectedTicker) || {};
  const fm = d.frontmatter;

  const header = `<div class="center-header">
    <div>
      <div class="ticker-big">${d.ticker}</div>
      <div class="company">${escapeHtml(covRow.company || '')} · ${escapeHtml(covRow.sector || '')}</div>
    </div>
    <div class="stats">
      ${fm ? `<div class="stat"><div class="stat-label">Rating</div><div class="stat-value"><span class="pill ${ratingPillClass(fm.rating)}">${fm.rating}</span></div></div>
      <div class="stat"><div class="stat-label">Conviction</div>${convictionDots(fm.conviction)}</div>
      <div class="stat"><div class="stat-label">Target · Horizon</div><div class="stat-value">${fm.price_target ?? '—'} · ${fm.horizon || '—'}</div></div>
      <div class="stat"><div class="stat-label">Status</div><div class="stat-value">${fm.analyst_status}</div></div>` : ''}
      <div class="stat"><button class="btn primary" id="btn-research" ${state.busy ? 'disabled' : ''}>${covRow.covered ? 'Ask agent to refresh' : 'Ask agent to initiate'}</button></div>
    </div>
  </div>`;

  const tabs = `<div class="tabs">
    ${['thesis', 'history', 'diff', 'data'].map((t) => `<button data-tab="${t}" class="${state.activeTab === t ? 'active' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
  </div>`;

  let body = '';
  if (state.activeTab === 'thesis') body = renderThesisTab(d, covRow);
  else if (state.activeTab === 'history') body = renderHistoryTab(d);
  else if (state.activeTab === 'diff') body = renderDiffTab(d);
  else if (state.activeTab === 'data') body = renderDataTab(d);

  return `<div class="pane-center">${header}${tabs}<div class="center-body">${body}</div></div>`;
}

function renderThesisTab(d, covRow) {
  let out = '';

  if (!covRow.inMandate) {
    out += `<div class="banner out"><div class="banner-title">Out of mandate</div>${d.ticker} is below the desk's market-cap floor. The agent will decline to draft coverage on request — see <code>knowledge/universe.md</code> and <code>RULES.md</code>.</div>`;
  }

  if (d.lastBlocked) {
    out += `<div class="banner blocked"><div class="banner-title">Draft blocked by mandate check</div>
      <div class="checks">${d.lastBlocked.checks.map((c) => `<div class="check-row ${c.pass ? 'pass' : 'fail'}"><span class="status">${c.pass ? '✓' : '✗'}</span><span>${c.name}</span><span class="reason">— ${escapeHtml(c.reason)}</span></div>`).join('')}</div>
    </div>`;
  }

  for (const p of d.pending) {
    const fm = p.frontmatter || {};
    const isEditing = state.editingBranch === p.branch;
    const isRejecting = state.rejectingBranch === p.branch;
    out += `<div class="banner review">
      <div class="banner-title">Pending review — ${p.branch}</div>
      Agent proposal: <span class="pill ${ratingPillClass(fm.rating)}">${fm.rating}</span> conviction ${fm.conviction}, target ${fm.price_target}. Diff against main is in the Diff tab.
      <div class="actions">
        <button class="btn primary" data-approve="${p.branch}" ${state.busy ? 'disabled' : ''}>Approve &amp; commit to main</button>
        <button class="btn" data-edit="${p.branch}">${isEditing ? 'Editing…' : 'Edit before approving'}</button>
        <button class="btn danger" data-reject="${p.branch}">${isRejecting ? 'Cancel' : 'Reject'}</button>
      </div>
      ${isEditing ? `<textarea class="editing-textarea" id="edit-area" style="margin-top:10px;">${escapeHtml(state.editingContent)}</textarea>
        <div class="actions"><button class="btn primary" data-save-edit="${p.branch}">Approve edited version</button></div>` : ''}
      ${isRejecting ? `<div style="margin-top:10px;">
          <input type="text" id="reject-reason" placeholder="Reason (recorded in memory/log.md)" value="${escapeHtml(state.rejectReason)}"
            style="width:100%; background:var(--bg-inset); color:var(--text); border:1px solid var(--border); border-radius:6px; padding:7px 10px; font-size:12px;" />
          <div class="actions"><button class="btn danger" data-confirm-reject="${p.branch}" ${state.busy ? 'disabled' : ''}>Confirm reject</button></div>
        </div>` : ''}
    </div>`;
  }

  if (d.content) {
    out += `<div class="thesis">${mdToHtml(d.content)}</div>`;
  } else if (!d.pending.length) {
    out += `<div class="empty-state">No approved coverage yet. Ask the agent to initiate.</div>`;
  }

  return out;
}

function renderHistoryTab(d) {
  if (!d.history.length) return '<div class="empty-state">No committed history yet.</div>';
  const oldestHash = d.history[d.history.length - 1].hash;
  const items = d.history.map((h) => {
    const isAgent = /coverage-desk-agent|log agent draft/i.test(h.author) || /^draft\(/.test(h.subject);
    const isRevert = /^Revert /.test(h.subject);
    const canRevert = h.hash !== oldestHash;
    const isReverting = state.revertingHash === h.hash;
    return `<div class="tl-item ${isAgent ? 'agent' : ''}">
      <div class="tl-head"><span class="tl-msg">${escapeHtml(h.subject)}</span><span class="tl-hash">${shortHash(h.hash)}</span></div>
      <div class="tl-meta">${escapeHtml(h.author)} · ${fmtDateTime(h.date)}</div>
      <div class="tl-actions">
        ${!isRevert && canRevert ? `<button class="btn small" data-revert="${h.hash}">${isReverting ? 'Cancel' : 'Revert to before this'}</button>` : ''}
        <button class="btn small ghost" data-diff-from="${h.hash}">Set as diff base</button>
      </div>
      ${isReverting ? `<div style="margin-top:6px;">
          <input type="text" id="revert-reason" placeholder="Reason (recorded in memory/log.md)" value="${escapeHtml(state.revertReason)}"
            style="width:100%; background:var(--bg-inset); color:var(--text); border:1px solid var(--border); border-radius:6px; padding:6px 9px; font-size:11.5px;" />
          <div class="tl-actions"><button class="btn small danger" data-confirm-revert="${h.hash}" ${state.busy ? 'disabled' : ''}>Confirm revert</button></div>
        </div>` : ''}
    </div>`;
  }).join('');
  return `<div class="timeline">${items}</div>`;
}

function renderDiffTab(d) {
  const options = d.history.map((h) => `<option value="${h.hash}">${shortHash(h.hash)} — ${escapeHtml(h.subject.slice(0, 40))}</option>`).join('');
  const pendingOptions = d.pending.map((p) => `<option value="${p.branch}">${p.branch} (pending)</option>`).join('');
  const from = state.diffFrom || (d.history[1] ? d.history[1].hash : d.history[0]?.hash);
  const to = state.diffTo || (d.pending[0] ? d.pending[0].branch : d.history[0]?.hash);

  const controls = `<div class="diff-controls">
    <span>Compare</span>
    <select id="diff-from">${options}</select>
    <span>→</span>
    <select id="diff-to">${options}${pendingOptions}</select>
    <button class="btn small" id="btn-run-diff">Diff</button>
  </div>`;

  const pre = state.currentDiff !== undefined
    ? `<pre class="diff">${renderDiffText(state.currentDiff)}</pre>`
    : '<div class="empty-state">Pick two revisions (or a pending branch) and diff them — every rating change is a readable, reviewable patch.</div>';

  window.__diffDefaults = { from, to };
  return controls + pre;
}

function renderDataTab(d) {
  const fm = d.frontmatter || {};
  return `<div class="kv-grid">
    <div class="kv-card"><div class="kv-label">Rating</div><div class="kv-value">${fm.rating || '—'}</div></div>
    <div class="kv-card"><div class="kv-label">Conviction</div><div class="kv-value">${fm.conviction ?? '—'} / 5</div></div>
    <div class="kv-card"><div class="kv-label">Price target</div><div class="kv-value">${fm.price_target ?? '—'}</div></div>
    <div class="kv-card"><div class="kv-label">Confidence</div><div class="kv-value">${fm.confidence ?? '—'}</div></div>
    <div class="kv-card"><div class="kv-label">Horizon</div><div class="kv-value">${fm.horizon || '—'}</div></div>
    <div class="kv-card"><div class="kv-label">Updated</div><div class="kv-value">${fmtDate(fm.updated)}</div></div>
    <div class="kv-card"><div class="kv-label">Approved by</div><div class="kv-value">${fm.approved_by || '—'}</div></div>
    <div class="kv-card"><div class="kv-label">Status</div><div class="kv-value">${fm.analyst_status || '—'}</div></div>
  </div>
  <div class="disclosure">Live quote is fetched live from a public, unauthenticated market-data endpoint at research time (see the Signal trace section of the thesis for the as-of timestamp and source) — it is not stored separately from the committed thesis.</div>`;
}

function renderCoverageRight() {
  const memory = state.memory;
  const rulesPreview = state.rules?.content || '';
  const logEntries = memory ? parseLogEntries(memory.log) : [];

  return `<div class="pane pane-right">
    <div class="pane-section">
      <h3>Mandate</h3>
      <div class="rules-box">${escapeHtml(rulesPreview.slice(0, 900))}${rulesPreview.length > 900 ? '\n…' : ''}</div>
      <div style="margin-top:8px;"><button class="btn small" id="btn-goto-mandate">Open mandate view →</button></div>
    </div>
    <div class="pane-section">
      <h3>Operation log</h3>
      ${logEntries.slice(0, 8).map((e) => `<div class="log-entry ${e.op}"><span class="log-op">${e.op}</span> · ${escapeHtml(e.subject)}<div class="log-body">${escapeHtml(e.body).replace(/\n/g, '<br/>')}</div></div>`).join('') || '<div class="empty-state">No operations yet.</div>'}
    </div>
    <div class="pane-section">
      <h3>Harness (real gitagent CLI)</h3>
      <div style="display:flex; gap:6px; margin-bottom:8px;">
        <button class="btn small" data-harness="validate" ${state.harnessLoading ? 'disabled' : ''}>validate</button>
        <button class="btn small" data-harness="info" ${state.harnessLoading ? 'disabled' : ''}>info</button>
        <button class="btn small" data-harness="audit" ${state.harnessLoading ? 'disabled' : ''}>audit</button>
      </div>
      ${state.harnessLoading ? `<div class="loading">Running opengap ${state.harnessLoading}…</div>` : ''}
      ${Object.entries(state.harnessOutput).map(([k, v]) => `<div style="margin-bottom:8px;"><div class="kv-label" style="margin-bottom:4px;">opengap ${k}</div><div class="harness-output">${escapeHtml(v)}</div></div>`).join('')}
    </div>
  </div>`;
}

function renderMandateView() {
  const rules = state.rules;
  if (!rules) return '<div class="pane pane-center"><div class="loading">Loading mandate…</div></div>';

  const history = rules.history.map((h) => `<div class="tl-item"><div class="tl-head"><span class="tl-msg">${escapeHtml(h.subject)}</span><span class="tl-hash">${shortHash(h.hash)}</span></div><div class="tl-meta">${escapeHtml(h.author)} · ${fmtDateTime(h.date)}</div></div>`).join('');

  if (state.rulesDraft === null) state.rulesDraft = rules.content;

  const proposedBanner = state.rulesProposedBranch ? `<div class="banner review">
    <div class="banner-title">Mandate change pending — ${state.rulesProposedBranch}</div>
    <pre class="diff">${renderDiffText(state.rulesProposedDiff)}</pre>
    <div class="actions">
      <button class="btn primary" id="btn-approve-rules">Approve &amp; merge</button>
      <button class="btn danger" id="btn-reject-rules">Discard</button>
    </div>
  </div>` : '';

  return `<div class="pane pane-left">
      <div class="pane-section"><h3>RULES.md history</h3></div>
      <div style="padding: 0 14px;"><div class="timeline">${history}</div></div>
    </div>
    <div class="pane-center">
      <div class="center-header"><div><div class="ticker-big" style="font-size:16px;">The Mandate</div><div class="company">RULES.md is versioned like everything else — propose a change on a branch, diff it, then merge.</div></div></div>
      <div class="center-body">
        ${proposedBanner}
        <h3 style="margin-top:0;">Edit and propose a change</h3>
        <textarea class="rules-edit" id="rules-textarea" style="min-height:420px;">${escapeHtml(state.rulesDraft)}</textarea>
        <div class="actions" style="margin-top:10px; display:flex; gap:8px;">
          <button class="btn primary" id="btn-propose-rules" ${state.busy ? 'disabled' : ''}>Propose change on a review branch</button>
          <button class="btn" id="btn-reset-rules">Reset to current</button>
        </div>
      </div>
    </div>
    <div class="pane-right">
      <div class="pane-section"><h3>Current RULES.md</h3></div>
      <div style="padding: 0 14px 14px;"><div class="rules-box" style="max-height: 70vh;">${escapeHtml(rules.content)}</div></div>
    </div>`;
}

// ---------- Event wiring ----------

function attachHandlers() {
  document.querySelectorAll('#view-nav button').forEach((btn) => {
    btn.onclick = async () => {
      state.view = btn.dataset.view;
      if (state.view === 'mandate' && !state.rules) await loadRules();
      render();
    };
  });

  document.querySelectorAll('[data-ticker]').forEach((el) => {
    el.onclick = () => selectTicker(el.dataset.ticker);
  });

  document.querySelectorAll('[data-tab]').forEach((el) => {
    el.onclick = () => { state.activeTab = el.dataset.tab; state.currentDiff = undefined; render(); };
  });

  const researchBtn = document.getElementById('btn-research');
  if (researchBtn) researchBtn.onclick = () => runResearch(state.selectedTicker);

  document.querySelectorAll('[data-approve]').forEach((el) => {
    el.onclick = () => approveBranch(state.selectedTicker, el.dataset.approve);
  });
  document.querySelectorAll('[data-reject]').forEach((el) => {
    el.onclick = () => {
      const branch = el.dataset.reject;
      state.rejectingBranch = state.rejectingBranch === branch ? null : branch;
      state.rejectReason = '';
      render();
    };
  });
  document.querySelectorAll('[data-confirm-reject]').forEach((el) => {
    el.onclick = () => confirmReject(state.selectedTicker, el.dataset.confirmReject);
  });
  const rejectReasonInput = document.getElementById('reject-reason');
  if (rejectReasonInput) rejectReasonInput.oninput = () => { state.rejectReason = rejectReasonInput.value; };
  document.querySelectorAll('[data-edit]').forEach((el) => {
    el.onclick = () => {
      const branch = el.dataset.edit;
      const p = state.detail.pending.find((pp) => pp.branch === branch);
      state.editingBranch = state.editingBranch === branch ? null : branch;
      state.editingContent = p.content;
      render();
    };
  });
  document.querySelectorAll('[data-save-edit]').forEach((el) => {
    el.onclick = () => {
      const area = document.getElementById('edit-area');
      state.editingContent = area.value;
      approveBranch(state.selectedTicker, el.dataset.saveEdit);
    };
  });
  document.querySelectorAll('[data-revert]').forEach((el) => {
    el.onclick = () => {
      const hash = el.dataset.revert;
      state.revertingHash = state.revertingHash === hash ? null : hash;
      state.revertReason = '';
      render();
    };
  });
  document.querySelectorAll('[data-confirm-revert]').forEach((el) => {
    el.onclick = () => confirmRevert(state.selectedTicker, el.dataset.confirmRevert);
  });
  const revertReasonInput = document.getElementById('revert-reason');
  if (revertReasonInput) revertReasonInput.oninput = () => { state.revertReason = revertReasonInput.value; };
  document.querySelectorAll('[data-diff-from]').forEach((el) => {
    el.onclick = () => { state.diffFrom = el.dataset.diffFrom; state.activeTab = 'diff'; render(); };
  });

  const diffFromSel = document.getElementById('diff-from');
  const diffToSel = document.getElementById('diff-to');
  if (diffFromSel && window.__diffDefaults) {
    diffFromSel.value = window.__diffDefaults.from;
    diffToSel.value = window.__diffDefaults.to;
  }
  const runDiffBtn = document.getElementById('btn-run-diff');
  if (runDiffBtn) {
    runDiffBtn.onclick = async () => {
      const from = diffFromSel.value;
      const to = diffToSel.value;
      state.currentDiff = await loadDiffPair(state.selectedTicker, from, to);
      render();
    };
  }

  document.querySelectorAll('[data-harness]').forEach((el) => {
    el.onclick = () => runHarness(el.dataset.harness);
  });

  const gotoMandate = document.getElementById('btn-goto-mandate');
  if (gotoMandate) gotoMandate.onclick = async () => { state.view = 'mandate'; if (!state.rules) await loadRules(); render(); };

  const rulesTextarea = document.getElementById('rules-textarea');
  if (rulesTextarea) rulesTextarea.oninput = () => { state.rulesDraft = rulesTextarea.value; };

  const proposeBtn = document.getElementById('btn-propose-rules');
  if (proposeBtn) proposeBtn.onclick = proposeRulesChange;
  const resetBtn = document.getElementById('btn-reset-rules');
  if (resetBtn) resetBtn.onclick = () => { state.rulesDraft = state.rules.content; render(); };
  const approveRulesBtn = document.getElementById('btn-approve-rules');
  if (approveRulesBtn) approveRulesBtn.onclick = approveRulesChange;
  const rejectRulesBtn = document.getElementById('btn-reject-rules');
  if (rejectRulesBtn) rejectRulesBtn.onclick = rejectRulesChange;
}

// ---------- Boot ----------

async function boot() {
  render();
  try {
    await refreshAll();
    render();
  } catch (err) {
    toast(err.message, 'error');
  }
}

boot();
