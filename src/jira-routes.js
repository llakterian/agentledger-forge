// The Jira REST routes the backend reads, built with @forge/api v6's `route`
// tagged template. Kept in their own module so the paths are unit-tested without
// a Forge runtime: `requestJira` rejects a plain string at runtime with
// "You must create your route using the 'route' export from '@forge/api'", and
// that failure is invisible until an agent (or a panel) tries to read an issue.
//
// The path and the query are literals in the template; only the issue key is
// interpolated, and `route` rejects path separators and `..` in it.

import { route } from '@forge/api';

export const jiraIssueSummary = (key) => route`/rest/api/3/issue/${key}?fields=summary`;

export const jiraIssueFull = (key) =>
  route`/rest/api/3/issue/${key}?fields=summary,status,issuetype,assignee`;
