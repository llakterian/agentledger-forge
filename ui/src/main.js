// AgentLedger issue panel, frontend.
//
// Talks to the Forge backend through the Atlassian bridge (`invoke`). The UI is
// deliberately small and dependency-light: a single page that shows who the
// agent is, what the policy says, and the tamper-evident trail of what the
// agent did.

import { invoke, view } from '@forge/bridge';

// Every `invoke` from this panel reaches the module resolver regardless of the
// function key, so operations are passed as an explicit `op` on one resolver
// call and dispatched server-side.
const call = (op, payload = {}) => invoke('resolver', { op, ...payload });

// The panel is a Custom UI resource, so the issue key comes from the backend
// resolver rather than the URL.
const state = {
  issueKey: '',
  panel: null,
  identity: null,
  agentRef: '',
  busy: false,
  message: null,
};

const el = (id) => document.getElementById(id);

function shortHash(hash) {
  if (!hash) return '-';
  return hash.length > 18 ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : hash;
}

function time(ts) {
  if (!ts) return '-';
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

function badge(text, kind = 'neutral') {
  return `<span class="badge ${kind}">${text}</span>`;
}

function renderIdentity(report) {
  if (!report) {
    return `<p class="muted">No agent verified yet. Paste an agent reference and press <strong>Verify</strong>.</p>`;
  }
  const checks = Object.entries(report.checks || {});
  // A registry check only fails when it is explicitly false. Some checks carry
  // a descriptive value instead of a boolean, "badge_embedding": "extension"
  // means the badge is embedded as an extension, not that the check failed.
  const checkRows = checks.map(([name, value]) => {
    const failed = value === false;
    const note = value !== true && value !== false
      ? ` <span class="muted">(${escapeHtml(String(value))})</span>`
      : '';
    return `<li>${failed ? '<span class="dot bad"></span>' : '<span class="dot ok"></span>'}<code>${escapeHtml(name)}</code>${note}</li>`;
  }).join('');
  return `
    <div class="identity">
      <div class="row">
        <div class="id-badge">${report.agentName ? escapeHtml(report.agentName).slice(0, 2).toUpperCase() : 'AI'}</div>
        <div>
          <div class="id-name">${escapeHtml(report.agentName || 'Unnamed agent')}</div>
          <div class="muted">${escapeHtml(report.sourceLabel || report.source)} · ${escapeHtml(report.network || '')}</div>
        </div>
        <div class="spacer"></div>
        ${report.valid ? badge('identity verified', 'ok') : badge('identity NOT verified', 'bad')}
      </div>
      <dl class="facts">
        <dt>Agent id</dt><dd class="mono">${escapeHtml(String(report.agentId ?? '-'))}</dd>
        <dt>Reference</dt><dd class="mono">${escapeHtml(report.tokenAddress || state.agentRef || '-')}</dd>
        <dt>Owner</dt><dd class="mono">${escapeHtml(report.owner || '-')}</dd>
        <dt>Status</dt><dd>${escapeHtml(report.status || '-')}</dd>
        <dt>Agent card</dt><dd class="mono break">${report.agentUri ? `<a href="${escapeHtml(report.agentUri)}" target="_blank" rel="noreferrer">${escapeHtml(report.agentUri)}</a>` : '-'}</dd>
        ${report.cardHashMatches !== null ? `<dt>Card hash</dt><dd>${report.cardHashMatches ? badge('matches on-chain hash', 'ok') : badge('MISMATCH', 'bad')} <span class="mono muted">${shortHash(report.cardHashComputed)}</span></dd>` : ''}
      </dl>
      ${checkRows ? `<div class="checks"><div class="muted">Registry checks</div><ul class="checklist">${checkRows}</ul></div>` : ''}
      ${(report.failedChecks || []).length ? `<div class="alert">Failed checks: ${report.failedChecks.map(escapeHtml).join(', ')}</div>` : ''}
    </div>`;
}

function renderTrail(panel) {
  const trail = (panel && panel.trail) || [];
  if (!trail.length) {
    return `<p class="muted">No agent actions recorded for this issue yet.</p>`;
  }
  const rows = trail.map((e) => {
    const verdictKind = e.verdict === 'allowed' || e.verdict === 'approved' ? 'ok' : e.verdict === 'flagged' ? 'warn' : 'bad';
    return `<tr>
      <td>${escapeHtml(e.action)}</td>
      <td>${e.agentId ? `<span class="mono">#${escapeHtml(String(e.agentId))}</span>` : '<span class="muted">, </span>'}</td>
      <td>${badge(e.verdict, verdictKind)}</td>
      <td>${escapeHtml(e.actorType || '')}</td>
      <td class="muted">${time(e.ts)}</td>
      <td class="mono" title="${escapeHtml(e.hash)}">${shortHash(e.hash)}</td>
    </tr>`;
  }).join('');
  const s = panel.summary || {};
  return `
    <div class="chain ${s.chainValid ? 'ok' : 'bad'}">
      ${s.chainValid
        ? `Chain intact, ${s.count} attestation${s.count === 1 ? '' : 's'}, head <span class="mono">${shortHash(s.head)}</span>`
        : `Chain broken at entry ${s.brokenAt}: ${escapeHtml(s.reason || '')}`}
    </div>
    <table class="trail">
      <thead><tr><th>Action</th><th>Agent</th><th>Verdict</th><th>By</th><th>When</th><th>Hash</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderPolicy(panel) {
  const policy = (panel && panel.policy) || [];
  if (!policy.length) return '';
  const rows = policy.map((p) => `<tr>
      <td>${escapeHtml(p.label)}</td>
      <td>${badge(p.severity, p.severity === 'critical' ? 'bad' : p.severity === 'high' ? 'warn' : 'neutral')}</td>
      <td>${p.requiresHuman ? badge('human approval required', 'warn') : '<span class="muted">agent may act</span>'}</td>
    </tr>`).join('');
  return `<details class="policy"><summary>Action policy</summary>
    <table class="trail"><thead><tr><th>Action</th><th>Severity</th><th>Gate</th></tr></thead><tbody>${rows}</tbody></table>
  </details>`;
}

// Escape a value for safe interpolation into an HTML template.
// The replacement entities are written with unicode escapes so the source
// stays unambiguous (a literal `<` in a JS string is easy to misread).
const HTML_ENTITIES = {
  '\u0026': '\u0026amp;',
  '\u003c': '\u003clt;',
  '\u003e': '\u003egt;',
  '\u0022': '\u0022quot;',
  '\u0027': '\u0027#39;',
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ENTITIES[c]);
}

function render() {
  el('panel').innerHTML = `
    ${state.message ? `<div class="notice">${escapeHtml(state.message)}</div>` : ''}
    <section class="card">
      <div class="card-hd"><h2>Agent identity</h2>${state.issueKey ? `<span class="spacer"></span><span class="muted mono">${escapeHtml(state.issueKey)}</span>` : ''}</div>
      <div class="card-bd">
        <div class="verify-row">
          <input id="agent-ref" class="mono" placeholder="CIS-8004 token address or agent id" value="${escapeHtml(state.agentRef)}" />
          <button id="verify" class="btn primary" ${state.busy ? 'disabled' : ''}>Verify</button>
        </div>
        ${renderIdentity(state.identity)}
      </div>
    </section>

    <section class="card">
      <div class="card-hd"><h2>Record an agent action</h2></div>
      <div class="card-bd">
        <div class="verify-row">
          <select id="action">
            <option value="comment">Comment on an issue</option>
            <option value="triage">Triage / label an issue</option>
            <option value="transition">Change issue status</option>
            <option value="assign">Assign an issue</option>
            <option value="approve">Approve a request (JSM)</option>
            <option value="refund">Trigger a refund / payout</option>
            <option value="close">Close a request (JSM)</option>
          </select>
          <button id="record" class="btn primary" ${state.busy ? 'disabled' : ''}>Record</button>
        </div>
        <p class="muted small">The identity is verified first, the action is evaluated against the policy, and the result is appended to the hash-chained trail. Human-gated actions are recorded as <em>flagged</em> until a reviewer approves them.</p>
      </div>
    </section>

    <section class="card">
      <div class="card-hd"><h2>Attestation trail</h2></div>
      <div class="card-bd">${renderTrail(state.panel)}</div>
    </section>

    <section class="card">
      <div class="card-hd"><h2>Policy</h2></div>
      <div class="card-bd">${renderPolicy(state.panel)}</div>
    </section>`;

  el('verify').addEventListener('click', () => verify());
  el('record').addEventListener('click', () => record());
  const input = el('agent-ref');
  input.addEventListener('input', (e) => { state.agentRef = e.target.value; });
}

async function load() {
  try {
    // The issue key comes from the bridge's extension context; the backend
    // resolver hands over the agent reference to pre-fill.
    const context = await view.getContext();
    const ext = (context && context.extension) || {};
    state.issueKey = state.issueKey || ext.issue?.key || ext.issueKey || '';
    const ctx = await invoke('resolver');
    if (ctx && !state.agentRef && ctx.defaultAgentRef) state.agentRef = ctx.defaultAgentRef;
    state.panel = await call('get-panel', { issueKey: state.issueKey });
  } catch (e) {
    state.panel = { trail: [], summary: { count: 0, chainValid: true, head: null }, policy: [] };
    state.message = `Could not load the panel: ${e.message}`;
  }
  render();
}

async function verify() {
  state.busy = true;
  render();
  try {
    const res = await call('verify-agent', { agentRef: state.agentRef });
    if (!res || !res.report) {
      state.message = `Verify returned no report: ${JSON.stringify(res)}`;
    } else {
      state.identity = res.report;
      state.message = null;
    }
  } catch (e) {
    state.message = `Verification failed: ${e.message}`;
  } finally {
    state.busy = false;
    render();
  }
}

async function record() {
  state.busy = true;
  const action = el('action').value;
  render();
  try {
    const res = await call('record-action', {
      issueKey: state.issueKey,
      action,
      agentRef: state.agentRef,
      actorType: 'agent',
    });
    state.identity = res.identity || state.identity;
    state.message = `Recorded: ${res.decision.verdict}, ${res.decision.reason}`;
    await load();
  } catch (e) {
    state.message = `Could not record: ${e.message}`;
  } finally {
    state.busy = false;
    render();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  load();
});

if (document.readyState !== 'loading') load();
