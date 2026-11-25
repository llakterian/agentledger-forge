// Teamwork Graph context — what the graph knows about an issue.
//
// AgentLedger does not let an agent act in a vacuum: before an action is
// recorded, the app pulls the connected context from Atlassian's Teamwork
// Graph (TWG) so the agent (and the human reviewing the trail) can see the
// goals, recent discussion and linked pull requests behind the work item.
//
// The Teamwork Graph API is reached through `api.asUser().requestTeamworkGraph`
// so every read is permission-filtered for the person who triggered it.
//
// New apps cannot send raw Cypher, so the queries below use Atlassian's
// curated query fields and the direct object query:
//
//   jiraWorkItem(id: <ARI>)                          -> the work item itself
//   jiraWorkItemGoals(id: <ARI>)                     -> goals linked to it
//   jiraWorkItemComments(id: <ARI>, since: "P30D")   -> recent discussion
//   jiraWorkItemLinkedExternalPullRequests(id: <ARI>)-> linked pull requests
//
// Each query is isolated: if one is unavailable (missing scope, schema change,
// no permission) the others still return, and the failure is reported instead
// of being hidden.

export const GRAPH_SCOPES = [
  'read:graph:issue:jira',
  'read:graph:goal:atlassian',
  'read:graph:issue-comment:jira',
  'read:graph:user:atlassian',
  'read:graph:pull-request:external',
];

/** A Jira issue ARI: ari:cloud:jira:{siteId}:issue/{issueId} */
export function buildIssueAri(siteId, issueId) {
  if (!siteId) throw new Error('a site (cloud) id is required to build an ARI');
  if (!issueId) throw new Error('an issue id is required to build an ARI');
  return `ari:cloud:jira:${siteId}:issue/${issueId}`;
}

const WORK_ITEM_QUERY = `
query agentLedger_workItem($id: ID!) {
  jiraWorkItem(id: $id) {
    id
    key
    summary
    status { name }
    issueType { name }
    assignee { id name }
    reporter { id name }
    webUrl
  }
}`;

const GOALS_QUERY = `
query agentLedger_workItemGoals($id: ID!) {
  jiraWorkItemGoals(id: $id, first: 25) {
    edges {
      node {
        ... on AtlassianGoal {
          id
          key
          name
          goalType { name }
          owner { id name }
        }
      }
    }
  }
}`;

const COMMENTS_QUERY = `
query agentLedger_workItemComments($id: ID!, $since: String!) {
  jiraWorkItemComments(id: $id, since: $since, first: 25) {
    edges {
      node {
        ... on JiraWorkItemComment {
          id
          content
          createdAt
          author { id name }
        }
      }
    }
  }
}`;

const PULL_REQUESTS_QUERY = `
query agentLedger_workItemPullRequests($id: ID!) {
  jiraWorkItemLinkedExternalPullRequests(id: $id, first: 25) {
    edges {
      node {
        ... on ExternalPullRequest {
          id
          displayName
          description
          author { id name }
        }
      }
    }
  }
}`;

/** Run one TWG query, returning { ok, data, error }. Never throws. */
export async function runGraphQuery(requestTeamworkGraph, query, variables) {
  try {
    const response = await requestTeamworkGraph(query, variables);
    const body = await response.json();
    if (body && body.errors && body.errors.length) {
      const message = body.errors.map((e) => e.message).join('; ');
      return { ok: false, data: null, error: message };
    }
    return { ok: true, data: (body && body.data) || {}, error: null };
  } catch (err) {
    return { ok: false, data: null, error: err.message };
  }
}

/** Unwrap a Relay-style connection into a plain array. */
export function edgesOf(connection) {
  if (!connection || !Array.isArray(connection.edges)) return [];
  return connection.edges.map((e) => e && e.node).filter(Boolean);
}

/**
 * Collect the Teamwork Graph context for a work item.
 *
 * @param {object} p
 * @param {string} p.ari the work item ARI
 * @param {Function} p.requestTeamworkGraph bound `api.asUser().requestTeamworkGraph`
 * @param {string} [p.since] ISO-8601 duration for the comment window
 */
export async function collectIssueContext({ ari, requestTeamworkGraph, since = 'P30D' }) {
  if (!ari) throw new Error('an issue ARI is required');
  if (typeof requestTeamworkGraph !== 'function') {
    throw new Error('requestTeamworkGraph is required');
  }

  const [workItem, goals, comments, pullRequests] = await Promise.all([
    runGraphQuery(requestTeamworkGraph, WORK_ITEM_QUERY, { id: ari }),
    runGraphQuery(requestTeamworkGraph, GOALS_QUERY, { id: ari }),
    runGraphQuery(requestTeamworkGraph, COMMENTS_QUERY, { id: ari, since }),
    runGraphQuery(requestTeamworkGraph, PULL_REQUESTS_QUERY, { id: ari }),
  ]);

  const unavailable = [];
  if (!workItem.ok) unavailable.push(`work item: ${workItem.error}`);
  if (!goals.ok) unavailable.push(`goals: ${goals.error}`);
  if (!comments.ok) unavailable.push(`comments: ${comments.error}`);
  if (!pullRequests.ok) unavailable.push(`pull requests: ${pullRequests.error}`);

  return {
    ari,
    available: unavailable.length === 0,
    unavailable,
    workItem: workItem.ok ? workItem.data.jiraWorkItem || null : null,
    goals: goals.ok ? edgesOf(goals.data.jiraWorkItemGoals) : [],
    comments: comments.ok ? edgesOf(comments.data.jiraWorkItemComments) : [],
    pullRequests: pullRequests.ok ? edgesOf(pullRequests.data.jiraWorkItemLinkedExternalPullRequests) : [],
  };
}

/**
 * Normalise a context result for the Rovo agent and the MCP client.
 *
 * `getIssueContext` returns a *failure report* when it cannot build the context
 * — no cloud id, no issue id, a graph call that blew up. That report is flat
 * (`available`, `unavailable`, `error`, `step`) while a success nests the same
 * fields under `context`. Tools call this so both shapes produce one shape, and
 * a failure is reported as data rather than surfacing as a 500.
 *
 * @param {object} result
 * @returns {{issueKey: string|null, ari: string|null, available: boolean, unavailable: string[], workItem: object|null, goals: array, comments: array, pullRequests: array, text: string, error?: string, failedAt?: string}}
 */
export function normaliseContextResult(result) {
  const ctx = (result && result.context) || {};
  const pick = (...keys) => {
    for (const k of keys) {
      if (result[k] !== undefined) return result[k];
    }
    return undefined;
  };
  return {
    issueKey: result?.issueKey ?? ctx.issueKey ?? null,
    ari: pick('ari') ?? null,
    cloudId: pick('cloudId') ?? null,
    available: pick('available') ?? ctx.available ?? false,
    unavailable: pick('unavailable') ?? ctx.unavailable ?? [],
    workItem: pick('workItem') ?? ctx.workItem ?? null,
    goals: pick('goals') ?? ctx.goals ?? [],
    comments: pick('comments') ?? ctx.comments ?? [],
    pullRequests: pick('pullRequests') ?? ctx.pullRequests ?? [],
    text: result?.text ?? renderContext(ctx),
    ...(pick('error') ? { error: pick('error'), failedAt: pick('step') } : {}),
  };
}

/**
 * A compact, LLM-friendly rendering of the context. The Rovo agent receives
 * this string, so it stays short and factual.
 */
export function renderContext(context) {
  if (!context) return 'No Teamwork Graph context was collected.';
  const lines = [];
  const w = context.workItem;
  if (w) {
    lines.push(`Work item: ${w.key || context.ari} — ${w.summary || ''}`);
    if (w.status?.name) lines.push(`Status: ${w.status.name}`);
    if (w.issueType?.name) lines.push(`Type: ${w.issueType.name}`);
    if (w.assignee?.name) lines.push(`Assignee: ${w.assignee.name}`);
  }
  if (context.goals?.length) {
    lines.push('Goals linked to this work item:');
    for (const g of context.goals) {
      lines.push(`  - ${g.key ? `${g.key}: ` : ''}${g.name || g.id}${g.goalType?.name ? ` (${g.goalType.name})` : ''}`);
    }
  } else {
    lines.push('Goals linked to this work item: none found in the graph.');
  }
  if (context.comments?.length) {
    lines.push(`Recent comments (${context.comments.length}):`);
    for (const c of context.comments.slice(0, 5)) {
      const body = String(c.content || '').replace(/\s+/g, ' ').slice(0, 160);
      lines.push(`  - ${c.author?.name || 'unknown'}: ${body}`);
    }
  }
  if (context.pullRequests?.length) {
    lines.push('Linked pull requests:');
    for (const p of context.pullRequests.slice(0, 5)) lines.push(`  - ${p.displayName || p.id}`);
  }
  if (context.unavailable?.length) {
    lines.push(`Some graph queries were unavailable: ${context.unavailable.join('; ')}`);
  }
  return lines.join('\n');
}
