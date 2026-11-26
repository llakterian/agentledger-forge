---
name: agent-attestation
description: Verify an AI agent's identity against a registry, gather the Teamwork Graph context for a work item, and record the agent's actions in a tamper-evident attestation trail. Use this whenever an AI agent acts on a Jira work item, when a reviewer asks who performed an action, or before an agent approves, refunds or closes anything.
allowed-tools: agentledger-policy agentledger-verify agentledger-context agentledger-trail agentledger-record
---

# Agent attestation

Every consequential action an AI agent takes on a work item gets one
attestation. An attestation answers three questions and nothing else:

1. **Who** acted: the agent's registry identity, verified against a registry
   the agent does not control.
2. **Was it allowed**: the policy decision for that action kind.
3. **What happened**: a hash-chained record that cannot be edited or removed
   without breaking the chain.

## The order of operations

Always follow this order. Skipping a step means the trail is not trustworthy.

1. `agentledger-policy`: read the policy. Actions marked as human-gated
   (`approve`, `refund`, `close`) are never performed by an agent on its own.
2. `agentledger-verify`: verify the agent's identity. If the result is not
   valid, stop and report the failing checks verbatim. Do not retry with a
   different reference to force a pass.
3. `agentledger-context`: collect the Teamwork Graph context for the work
   item: the goals it serves, the recent discussion, the linked pull requests.
   Act in light of that context, not in isolation.
4. `agentledger-record`: record the action. It is appended to the issue's
   hash-chained trail with the verdict the policy produced.
5. `agentledger-trail`: when asked what happened, answer from the trail, not
   from your own memory of the conversation.

## Recording an action

Call `agentledger-record` with:

- `issueKey`: the work item the action applies to.
- `actionKind`: one of `comment`, `triage`, `transition`, `assign`, `create`,
  `approve`, `refund`, `close`.
- `agentRef`: the agent's registry reference (a CIS-8004 token address such as
  `JyP9X278CKWoNLAFg5kVr`, or a numeric id for an ERC-8004 registry).
- `humanApproved`: `true` only when a named human reviewer already approved
  this exact action. Never set it to `true` on your own judgement.

The record returns the verdict: `allowed`, `approved`, `flagged` or `denied`.

- `allowed`: the agent may proceed.
- `approved`: a human approved it and the policy allows it.
- `flagged`: the action is human-gated. Say so and ask a human to approve;
  do not perform the action.
- `denied`: the identity is missing or invalid, or the action is unknown.
  Report the reason and stop.

## Edge cases

- **No identity available.** If the user asks you to act on behalf of an agent
  that has no registry reference, record the attempt as `denied` with the
  reason. An unattributed action is exactly what this trail exists to prevent.
- **The chain is broken.** If `agentledger-trail` reports `chainValid: false`,
  say so explicitly and give the entry index. Do not repair or rewrite the
  trail; a broken chain is a finding, not a bug to tidy away.
- **Graph context unavailable.** If `agentledger-context` reports
  `available: false`, the listed queries could not be read (usually a scope the
  admin has not granted). Continue with the context you do have and say which
  part is missing.
- **The user disputes a verdict.** Do not re-record the action to produce a
  different verdict. Explain the policy rule that produced it.

## What to say

Lead with the verdict and the one-line reason. Name the registry that was
checked and the agent id it returned. Never claim an action happened unless a
tool call confirmed it.
