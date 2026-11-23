// Tests for the Teamwork Graph context helpers.
//
// The GraphQL itself can only be exercised against a live Atlassian site, so
// these tests cover the parts that are pure: ARI construction, connection
// unwrapping and the LLM-facing rendering.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIssueAri, edgesOf, renderContext, runGraphQuery } from '../src/context.js';

test('an issue ARI follows the documented format', () => {
  assert.equal(
    buildIssueAri('abc123-def456', '10001'),
    'ari:cloud:jira:abc123-def456:issue/10001',
  );
});

test('building an ARI requires a site id and an issue id', () => {
  assert.throws(() => buildIssueAri(null, '10001'), /site/);
  assert.throws(() => buildIssueAri('abc', null), /issue id/);
});

test('edgesOf unwraps a Relay connection and drops empty nodes', () => {
  const connection = { edges: [{ node: { id: '1' } }, { node: null }, { node: { id: '2' } }] };
  assert.deepEqual(edgesOf(connection), [{ id: '1' }, { id: '2' }]);
  assert.deepEqual(edgesOf(null), []);
  assert.deepEqual(edgesOf({ edges: 'nope' }), []);
});

test('runGraphQuery reports GraphQL errors instead of throwing', async () => {
  const request = async () => ({
    json: async () => ({ errors: [{ message: 'scope missing' }] }),
  });
  const result = await runGraphQuery(request, 'query {}', {});
  assert.equal(result.ok, false);
  assert.equal(result.error, 'scope missing');
});

test('runGraphQuery returns data on success', async () => {
  const request = async () => ({
    json: async () => ({ data: { jiraWorkItem: { key: 'SAFE-1' } } }),
  });
  const result = await runGraphQuery(request, 'query {}', {});
  assert.equal(result.ok, true);
  assert.equal(result.data.jiraWorkItem.key, 'SAFE-1');
});

test('runGraphQuery turns a transport failure into an error result', async () => {
  const request = async () => { throw new Error('egress blocked'); };
  const result = await runGraphQuery(request, 'query {}', {});
  assert.equal(result.ok, false);
  assert.match(result.error, /egress blocked/);
});

test('the rendered context states the work item, its goals and its comments', () => {
  const text = renderContext({
    ari: 'ari:cloud:jira:site:issue/1',
    available: true,
    unavailable: [],
    workItem: {
      key: 'SAFE-1',
      summary: 'Ship the escrow UI',
      status: { name: 'In Progress' },
      issueType: { name: 'Story' },
      assignee: { name: 'Sambu' },
    },
    goals: [{ key: 'G-1', name: 'Make cross-border payments safe', goalType: { name: 'GOAL' } }],
    comments: [{ content: 'Waiting on compliance review', author: { name: 'Ada' } }],
    pullRequests: [],
  });
  assert.match(text, /SAFE-1/);
  assert.match(text, /Make cross-border payments safe/);
  assert.match(text, /Waiting on compliance review/);
  assert.match(text, /Status: In Progress/);
});

test('the rendered context says when no goal is linked', () => {
  const text = renderContext({ ari: 'x', available: true, unavailable: [], workItem: null, goals: [], comments: [], pullRequests: [] });
  assert.match(text, /none found in the graph/);
});

test('the rendered context reports unavailable graph queries', () => {
  const text = renderContext({ ari: 'x', available: false, unavailable: ['goals: scope missing'], workItem: null, goals: [], comments: [], pullRequests: [] });
  assert.match(text, /scope missing/);
});
