// AgentLedger — Forge backend.
//
// Handlers are thin: the interesting logic lives in ./verifiers.js (identity),
// ./policy.js (what an agent may do) and ./attestations.js (the hash-chained
// trail). Everything here is glue between the Atlassian UI, the Rovo agent /
// MCP tools and those modules.

import api, { fetch } from '@forge/api';
import kvs from '@forge/kvs';
import { verifyAgent } from './verifiers.js';
import { evaluateAction, policyTable, ACTIONS } from './policy.js';
import { appendAttestation, summarize, verifyChain, GENESIS_HASH } from './attestations.js';
import { buildIssueAri, collectIssueContext, renderContext } from './context.js';

const STORE_PREFIX = 'agentledger.trail.';
const CLOUD_ID_KEY = 'agentledger.cloudId';

// The agent reference the panel pre-fills so a demo (or a reviewer) can verify
// identity with one click. It can be overridden per environment with the
// AGENT_DEFAULT_REF variable; the fallback is BotIn's own registry entry.
const DEFAULT_AGENT_REF = process.env.AGENT_DEFAULT_REF || 'JyP9X278CKWoNLAFg5kVr';

// The Forge runtime does not expose a global fetch: external requests have to
// go through the @forge/api client, which enforces the manifest egress rules.
const forgeFetch = (...args) => fetch(...args);

async function readChain(issueKey) {
  const raw = await kvs.get(STORE_PREFIX + issueKey);
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeChain(issueKey, chain) {
  await kvs.set(STORE_PREFIX + issueKey, JSON.stringify(chain));
}

/** Pull the issue summary from the Jira REST API (as the current user). */
async function issueSummary(issueKey) {
  try {
    const res = await api.asUser().get(`/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary,status,issuetype,assignee`);
    const body = res.data || {};
    return {
      key: body.key || issueKey,
      summary: body.fields?.summary || '',
      status: body.fields?.status?.name || '',
      type: body.fields?.issuetype?.name || '',
      assignee: body.fields?.assignee?.displayName || null,
    };
  } catch (e) {
    return { key: issueKey, summary: '', status: '', type: '', assignee: null, error: e.message };
  }
}

/** Resolver for the jira:issuePanel module — supplies the panel with context. */
export async function resolver(payload, context) {
  const issueKey = payload.issue?.key || payload.key;
  const cloudId = context?.cloudId || payload?.context?.cloudId || null;
  // The panel resolver is the only place where Forge hands us the site's cloud
  // id for free, so remember it: the Teamwork Graph needs it to build ARIs.
  if (cloudId) {
    try { await kvs.set(CLOUD_ID_KEY, cloudId); } catch { /* storage is best effort */ }
  }
  return {
    issueKey,
    issueId: payload.issue?.id || null,
    cloudId,
    defaultAgentRef: DEFAULT_AGENT_REF,
  };
}

/** The site's cloud id, from the payload, from storage, or from the site itself. */
async function resolveCloudId(issueKey, explicit) {
  if (explicit) return explicit;
  const stored = await kvs.get(CLOUD_ID_KEY).catch(() => null);
  if (stored) return stored;
  // Last resort: the Jira issue's `self` URL carries the site domain, and
  // /_edge/tenant_info maps that domain to the cloud id.
  try {
    const res = await api.asUser().get(`/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary`);
    const self = res.data?.self || '';
    const site = /https:\/\/([^/]+)\.atlassian\.net/.exec(self);
    if (site) {
      const tenant = await fetch(`https://${site[1]}.atlassian.net/_edge/tenant_info`);
      if (tenant.ok) {
        const body = await tenant.json();
        if (body && body.cloudId) {
          await kvs.set(CLOUD_ID_KEY, body.cloudId).catch(() => {});
          return body.cloudId;
        }
      }
    }
  } catch { /* fall through to the error below */ }
  return null;
}

/**
 * Resolve a work item ARI from an issue key.
 *
 * The Teamwork Graph identifies a Jira issue by its ARI
 * (ari:cloud:jira:{siteId}:issue/{issueId}); the numeric issue id comes from
 * the Jira REST API and the site id comes from the Forge context.
 */
async function resolveIssueAri(issueKey, cloudId) {
  const res = await api.asUser().get(`/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary`);
  const body = res.data || {};
  const issueId = body.id || null;
  if (!issueId) throw new Error(`could not resolve the numeric id of ${issueKey}`);
  if (!cloudId) {
    throw new Error(
      'the cloud id of the site is not known — open the AgentLedger panel on an issue once, or pass the cloudId explicitly',
    );
  }
  return buildIssueAri(cloudId, issueId);
}

/**
 * Collect the Teamwork Graph context for an issue: the work item, the goals
 * linked to it, recent comments and linked pull requests.
 */
export async function getIssueContext(payload) {
  const issueKey = payload.issueKey;
  if (!issueKey) throw new Error('issueKey is required');
  const cloudId = await resolveCloudId(issueKey, payload.cloudId);
  const ari = payload.ari || (await resolveIssueAri(issueKey, cloudId));
  const context = await collectIssueContext({
    ari,
    requestTeamworkGraph: (...args) => api.asUser().requestTeamworkGraph(...args),
    since: payload.since || 'P30D',
  });
  return { issueKey, ari, cloudId, context, text: renderContext(context) };
}

/** Everything the issue panel renders. */
export async function getPanel(payload) {
  const issueKey = payload.issueKey;
  const chain = await readChain(issueKey);
  const issue = await issueSummary(issueKey);
  return {
    issue,
    trail: chain,
    summary: summarize(chain),
    policy: policyTable(),
  };
}

/** Verify an agent reference against a registry. */
export async function verifyAgentHandler(payload) {
  const ref = payload.agentRef || payload.ref || payload.agentId;
  const report = await verifyAgent(ref, { fetchImpl: forgeFetch, source: payload.source || 'auto' });
  return {
    agentRef: String(ref),
    report,
  };
}

/** Evaluate the policy for an action without recording anything (dry run). */
export async function checkPolicy(payload) {
  const identity = payload.identity || null;
  const decision = evaluateAction({
    action: payload.action,
    identity,
    humanApproved: !!payload.humanApproved,
  });
  return { action: payload.action, decision, policy: policyTable() };
}

/**
 * Record an agent action on an issue.
 *
 * The action is only recorded as `allowed` / `approved` when the agent's
 * identity verified *and* the policy allows it; otherwise it is recorded as
 * `denied` or `flagged` so the trail shows the attempt.
 */
export async function recordAction(payload) {
  const issueKey = payload.issueKey;
  if (!issueKey) throw new Error('issueKey is required');
  const action = payload.action;
  if (!ACTIONS[action]) throw new Error(`unknown action "${action}"`);

  let identity = payload.identity || null;
  if (!identity && payload.agentRef) {
    identity = await verifyAgent(payload.agentRef, { fetchImpl: forgeFetch, source: payload.source || 'auto' });
  }

  const decision = evaluateAction({
    action,
    identity,
    humanApproved: !!payload.humanApproved,
  });

  const chain = await readChain(issueKey);
  const next = appendAttestation(chain, {
    issueKey,
    action,
    agentRef: payload.agentRef || (identity ? identity.agentId : null),
    agentSource: identity ? identity.source : null,
    agentId: identity ? identity.agentId : null,
    verdict: decision.verdict,
    reason: decision.reason,
    actorAccountId: payload.actorAccountId || null,
    actorType: payload.actorType || 'agent',
    ts: payload.ts || new Date().toISOString(),
  });
  await writeChain(issueKey, next);

  return {
    recorded: true,
    decision,
    identity,
    summary: summarize(next),
    latest: next[next.length - 1],
  };
}

/** A human approves (or denies) a flagged action. */
export async function approveAction(payload) {
  const issueKey = payload.issueKey;
  const approved = payload.approved !== false;
  const chain = await readChain(issueKey);
  const next = appendAttestation(chain, {
    issueKey,
    action: payload.action,
    agentRef: payload.agentRef || null,
    agentSource: payload.agentSource || null,
    agentId: payload.agentId || null,
    verdict: approved ? 'approved' : 'denied',
    reason: payload.reason || (approved ? 'approved by a human reviewer' : 'denied by a human reviewer'),
    actorAccountId: payload.actorAccountId || null,
    actorType: 'human',
    ts: payload.ts || new Date().toISOString(),
  });
  await writeChain(issueKey, next);
  return { recorded: true, summary: summarize(next), latest: next[next.length - 1] };
}

/** Read-only trail + chain verification. */
export async function getTrail(payload) {
  const chain = await readChain(payload.issueKey);
  return { trail: chain, summary: summarize(chain), verification: verifyChain(chain) };
}

/**
 * Rovo MCP tool: everything an agent needs to act under AgentLedger.
 * The tool is intentionally explicit — an LLM should not have to guess which
 * of these steps to skip.
 */
export async function agentLedgerTool(payload) {
  const action = payload.action;
  if (action === 'policy') {
    return { policy: policyTable(), note: 'Actions marked requiresHuman need a human approval attestation.' };
  }
  if (action === 'verify') {
    const report = await verifyAgent(payload.agentRef, { fetchImpl: forgeFetch, source: payload.source || 'auto' });
    return {
      agentRef: payload.agentRef,
      valid: report.valid,
      source: report.sourceLabel,
      network: report.network,
      agentId: report.agentId,
      owner: report.owner,
      status: report.status,
      checks: report.checks,
      failedChecks: report.failedChecks,
      cardHashMatches: report.cardHashMatches,
    };
  }
  if (action === 'record') {
    const identity = payload.agentRef ? await verifyAgent(payload.agentRef, { fetchImpl: forgeFetch, source: payload.source || 'auto' }) : null;
    const decision = evaluateAction({ action: payload.actionKind, identity, humanApproved: !!payload.humanApproved });
    const chain = await readChain(payload.issueKey);
    const next = appendAttestation(chain, {
      issueKey: payload.issueKey,
      action: payload.actionKind,
      agentRef: payload.agentRef || null,
      agentSource: identity ? identity.source : null,
      agentId: identity ? identity.agentId : null,
      verdict: decision.verdict,
      reason: decision.reason,
      actorAccountId: payload.actorAccountId || null,
      actorType: 'agent',
      ts: new Date().toISOString(),
    });
    await writeChain(payload.issueKey, next);
    return { recorded: true, decision, summary: summarize(next) };
  }
  if (action === 'trail') {
    const chain = await readChain(payload.issueKey);
    return { summary: summarize(chain), trail: chain };
  }
  if (action === 'context') {
    const result = await getIssueContext({
      issueKey: payload.issueKey,
      cloudId: payload.cloudId,
      since: payload.since,
    });
    return {
      issueKey: result.issueKey,
      ari: result.ari,
      available: result.context.available,
      unavailable: result.context.unavailable,
      workItem: result.context.workItem,
      goals: result.context.goals,
      comments: result.context.comments,
      pullRequests: result.context.pullRequests,
      text: result.text,
    };
  }
  throw new Error(`unknown tool action "${action}" — use policy, verify, record, trail or context`);
}

export { GENESIS_HASH };
