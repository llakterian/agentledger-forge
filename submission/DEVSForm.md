# Devpost submission form: paste-ready values

Everything the Codegeist 2026 project form asks for, in the order it asks.

**The demo video is published:** <https://youtu.be/tKIMEUkLjo4> (public, 4:11).
Every value below is complete, so filling the form is a paste-in job.

## How to create the project (one human step)

Go straight to <https://devpost.com/software/new>. That is the same
"Post a new project" form, reached without the submissions page.

The project name box is already filled in. The only thing left is the
**reCAPTCHA checkbox** ("I'm not a robot") which I must not tick, tick it, click
**Save and continue**, and the rest of the form opens.

Registration for the hackathon itself is already done (25 Nov 2026, entered as a
solo participant, source = Atlassian).

---

## 1. Basics

**Project name**: Devpost limits this to **60 characters**, so the short form
below is the one to use (already typed into the form on
<https://devpost.com/software/new>):

```
AgentLedger, verifiable identity for AI agents in Jira
```

The full wording, for the tagline and the story below, is *AgentLedger:
verifiable identity and a tamper-evident attestation trail for AI agents acting
in Atlassian products*.

**Tagline / one-liner**

```
Verified identity, human-gated authority, and a trail you can check.
```

**Project ownership**

Solo. One participant. No team, no company.

---

## 2. Story

### Inspiration

```
Teams are starting to hand real work to AI agents, triaging an issue,
transitioning a ticket, approving a service request, triggering a refund. Three
things are missing in that setup, and all three are ordinary engineering
problems rather than model problems:

1. Attribution. An agent can claim to be anything. There is no check that the
   thing acting on your work item is the agent it says it is.
2. Evidence. An agent's actions leave no durable trail. "The agent did it" is a
   claim, not a record.
3. Authority. Nothing states which actions an agent may take on its own and
   which ones need a human signature. So either humans rubber-stamp everything,
   or agents are trusted with everything.

AgentLedger fixes all three in Forge: the agent is checked against a registry it
does not control, a policy table decides what it may do alone, and every action
is appended to a hash-chained trail.
```

### What it does

```
Four steps, in order, in code rather than in prompt text.

Verify. The agent reference is checked against the Concordium Agent Registry
(CIS-8004) over HTTPS. The registry re-fetches the agent card and compares its
SHA-256 with the hash committed on chain, and returns every individual check it
performed. So the UI can show why an identity is valid rather than just
asserting that it is. A second source, an ERC-8004 identity registry, is read
directly over eth_call on Base Sepolia. An empty registry is reported as "not
registered" instead of failing: an honest negative answer is still an answer.
The shipped demo verifies BotIn agent #1190 live, card hash matching the hash
committed on chain, owner matching, extension conformant.

Evaluate. A short, readable policy table. Comment, triage, transition, assign
and create are within policy for a verified agent. Approve, refund and close are
human-gated: the agent records them as flagged and waits for a human approval
attestation. The table is code, so it cannot be talked around by an LLM.

Record. Every consequential action becomes one attestation. Each attestation
commits to the hash of the previous one, so editing or deleting an entry breaks
the chain. And the panel reports exactly which entry broke it instead of quietly
continuing.

Context. Before an agent acts, the app queries Atlassian's Teamwork Graph for
the work item's connected context: the goals it serves, the recent discussion,
the linked pull requests. A work item with no linked goal is reported as a
finding rather than silently ignored.
```

### How we built it

```
A Forge app on nodejs24.x, with four modules and one shipped identity:

- jira:issuePanel (Custom UI): the verified identity with every registry check,
  the policy table, and the live trail with its chain state.
- rovo:agent: "AgentLedger Auditor". Its prompt enforces the verify → policy →
  context → record order and forbids claiming an action that no tool call
  confirmed.
- rovo:mcp: five tools (policy, verify, context, trail, record), reachable in
  Rovo Studio and from third-party MCP clients.
- rovo:skill: agent-attestation packages the same rules so any Rovo agent in any
  workspace can follow them.

Engineering notes:

- The policy engine, the hash chain and the encoding helpers are pure with no
  Atlassian dependency, so they are covered by unit tests that run without an
  account. 36 tests pass.
- Keccak-256 is implemented in-project (Node's crypto ships SHA3-256, a
  different padding) and checked against the standard vectors.
- External reads go through @forge/api's fetch and
  api.asUser().requestTeamworkGraph(...), so the manifest's egress rules and the
  acting user's own permissions apply. The app never sees data the user cannot
  already see.
- The resolver signature was found the hard way: Forge calls a resolver with
  { context, call: { functionKey, payload } }, not (payload, context). Reading
  payload.op off the first argument returns undefined and the handler answers
  something plausible instead of doing the work. Both shapes are now accepted,
  unit-tested, and a local validator cross-checks every manifest action input
  against the keys the backend actually reads.
```

### Challenges we ran into

```
Three, all of the kind that only show up in a real runtime.

1. The Forge resolver envelope. Forge does not pass (payload, context); it
   passes { context, call: { functionKey, payload } }. Every panel operation was
   silently falling through to its default branch. Once the payload was unpacked
   correctly the panel worked on the first try.
2. @forge/kvs is CommonJS, so a default import can land on the whole
   module.exports namespace instead of the client, which surfaces at runtime as
   "kvs.get is not a function". The client is now resolved once, explicitly, and
   the code fails loudly if none of the export shapes match.
3. A descriptive check reads like a failure. The registry returns
   badge_embedding: "extension". A fact about where the badge lives, not a
   failure. The panel rendered any non-true value with a red dot, so a green
   "identity verified" card sat next to a red check. Now a check only turns red
   when it is explicitly false, and descriptive values are shown as a note.
```

### Accomplishments that we're proud of

```
The Rovo agent answers from the trail rather than from its own memory of the
conversation. Given a refund an agent attempted, it reads the hash-chained
attestation for that work item, confirms chainValid, names the agent and its
registry id, and states that a human must approve before the refund proceeds.

The identity check is genuinely independent of the app: 14 separate checks come
back from the Concordium Agent Registry, including the on-chain card hash
comparison, and the whole set is shown to the user.

The rig refuses to green-wash itself. In the mutation mode of the sibling build
(fluxharness), deliberately weakening the Critic drops the score to 0.000 and
exits non-zero. An eval suite that cannot catch its own regressions is
decoration.
```

### What we learned

```
Forge's module resolver and its Rovo/MCP tools are not the same dispatch
problem. A jira:issuePanel module delivers every invoke to the module resolver,
regardless of the function key, so the panel must route its own operations with
an explicit op and dispatch server-side. A rovo:mcp tool, in contrast, is called
with the tool's manifest inputs. And reading a key the manifest does not declare
produces undefined with no error anywhere.

Also: honest reporting is a feature, not a cop-out. "No agents registered in this
registry", "no linked goal found" and "chain broken at entry #3" are all answers
the app gives deliberately.
```

### What's next

```
- A human approval surface in the panel: approve or deny a flagged action, which
  appends the human approval attestation the trail already expects.
- An exportable audit bundle per work item: the trail, the identity report and
  the policy table as one signed artifact.
- More registries. The verifier is source-agnostic, so a second identity source
  is one adapter away.
```

### Built With

```
atlassian-connect, atlassian-forge, forge-custom-ui, nodejs, nodejs24, javascript,
keccak256, jira, teamwork-graph, rovo, mcp, concordium, cis-8004, erc-8004,
base-sepolia, hash-chain, sha-256
```

---

## 3. Links

**"Try it out" link field**: Devpost caps that field at **255 characters**, and
the signed Atlassian installation link is 1,460, so it cannot go there. Put the
source repository in the field and the installation link in the description body
and in the judge instructions (both are long-text fields with no such cap):

```
https://github.com/llakterian/agentledger-forge
```

**Installation link**. The full signed URL from `submission/INSTALL_LINK.txt`
(it is already in the `## Try it out` section of the description, and in
`SUBMISSION.md`; the console copy is at *Distribution → Installation link* if it
ever needs regenerating).

**Source code / GitHub**

```
https://github.com/llakterian/agentledger-forge
```

**Demo video (public YouTube)**

```
https://youtu.be/tKIMEUkLjo4
```

Uploaded 25 Nov 2026, **Public**, on the Tech_Ale channel
(`UC6vBAiT4UmvbAJ39w7mkOsw`) of lakterian9@gmail.com. 4:11 long, h264, 1280x536.
The file it came from is `submission/agentledger_demo.mp4`.

---

## 4. Prizes

**Category**

```
Apps for Specialized Industries
```

**Bonus prizes (select all that apply)**

```
Best Agents
Best app with Atlassian MCP
Best Teamwork Graph integration
```

Do **not** select *Best Marketplace published app*. Nothing is published to the
Marketplace yet.

---

## 5. Explanation of the technology requirement

```
Build an app using Atlassian's Forge platform and integrate with at least one
Atlassian product or platform capability.

AgentLedger is a Forge app on nodejs24.x integrating with three Atlassian
capabilities:

1. Jira (jira:issuePanel): the panel lives on the issue view and reads the issue
   key from view.getContext(), verified live on issue KAN-1.
2. Teamwork Graph (read:graph:* scopes): via api.asUser().requestTeamworkGraph()
   through the manifest's egress rules, so the acting user's permissions apply.
3. Rovo (rovo:agent, rovo:mcp, rovo:skill): an agent with five tools, a reusable
   skill, and an MCP server reachable from third-party clients.

The app is not a wrapper around a language model: the model is optional, the
policy table and the hash chain are plain code, and every decision the app makes
is enforced in the backend rather than in the UI or in prompt text.
```

---

## 6. Judge instructions

```
1. Install the app from the installation link into a Jira site. Judges must be
   a site administrator. The app is unlicensed and free, so no billing is
   involved.
2. Grant the requested scopes. The Teamwork Graph scopes (read:graph:*) are
   optional, without them the graph queries return empty, the app says so, and
   everything else keeps working.
3. Open any Jira issue and click View app actions → AgentLedger.
4. Paste the agent reference JyP9X278CKWoNLAFg5kVr and press Verify. The app
   calls the Concordium Agent Registry live and shows every check: on-chain agent
   found, status active, agent URI present, card fetched, card hash matches the
   hash committed on chain, badge present, owner matches, contracts match,
   extension conformant.
5. Press Record with an action such as "Comment on an issue": the attestation
   is appended to the trail. Then try "Trigger a refund / payout": it is recorded
   as flagged (human-gated) and the agent is not allowed to proceed.
6. Open the AgentLedger Auditor agent in Jira (Rovo) and ask it to show the
   attestation trail for the issue. It answers from the trail, not from its own
   memory of the conversation.
7. If you have an MCP client, connect it to the app's MCP server and call
   AgentLedger action policy, Verify agent identity, Work item context, Read the
   attestation trail and Record an agent action.
```