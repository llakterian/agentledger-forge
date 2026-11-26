// Tests for the Jira REST routes the backend builds.
//
// @forge/api v6 changed how a Jira read is addressed: `requestJira` takes a
// route built with the `route` tagged template, not a plain string, and the
// response is read with `.json()`. Getting this wrong fails at runtime, which
// the Rovo agent can only report as a 500. So the route builders live in
// src/jira-routes.js, are pure, and are tested here.

import test from 'node:test';
import assert from 'node:assert/strict';
import { route } from '@forge/api';
import { jiraIssueSummary, jiraIssueFull } from '../src/jira-routes.js';

test('the summary route points at the issue with only summary selected', () => {
  assert.equal(jiraIssueSummary('KAN-5').value, '/rest/api/3/issue/KAN-5?fields=summary');
  assert.equal(jiraIssueFull('SAFE-42').value, '/rest/api/3/issue/SAFE-42?fields=summary,status,issuetype,assignee');
});

test('an issue key that tries to move up the path is rejected', () => {
  assert.throws(() => jiraIssueSummary('../../rest/api/2'), /path manipulation/i);
  assert.throws(() => jiraIssueFull('a/b'), /path manipulation/i);
});
