## Inspiration

Teams are starting to hand real work to AI agents — triaging an issue,
transitioning a ticket, approving a service request, triggering a refund. Three
things are missing in that setup, and all three are ordinary engineering
problems rather than model problems:

1. **Attribution.** An agent can claim to be anything. There is no check that the
   thing acting on your work item is the agent it says it is.
2. **Evidence.** An agent's actions leave no durable trail. "The agent did it" is
   a claim, not a record.
3. **Authority.** Nothing states which actions an agent may take on its own and
   which ones need a human signature — so either humans rubber-stamp everything,
   or agents are trusted with everything.

AgentLedger fixes all three in Forge: the agent is checked against a registry it
does not control, a policy table decides what it may do alone, and every action
is appended to a hash-chained trail.

## What it does

Four steps, in order, in code rather than in prompt text.

**Verify.** The agent reference is checked against the Concordium Agent Registry
(CIS-8004) over HTTPS. The registry re-fetches the agent card and compares its
SHA-256 with the hash committed on chain, and returns every individual check it
performed — so the UI can show *why* an identity is valid rather than just
asserting that it is. A second source, an ERC-8004 identity registry, is read
directly over `eth_call` on Base Sepolia. An empty registry is reported as "not
registered" instead of failing: an honest negative answer is still an answer.
The shipped demo verifies BotIn agent **#1190** live — card hash matching the
hash committed on chain, owner matching, extension conformant.

**Evaluate.** A short, readable policy table. `comment`, `triage`, `transition`,
`assign` and `create` are within policy for a verified agent. `approve`,
`refund` and `close` are human-gated: the agent records them as **flagged** and
waits for a human approval attestation. The table is code, so it cannot be
talked around by an LLM.

**Record.** Every consequential action becomes one attestation. Each attestation
commits to the hash of the previous one, so editing or deleting an entry breaks
the chain — and the panel reports exactly which entry broke it instead of
quietly continuing.

**Context.** Before an agent acts, the app queries Atlassian's Teamwork Graph for
the work item's connected context: the goals it serves, the recent discussion,
the linked pull requests. A work item with no linked goal is reported as a
finding rather than silently ignored. Where a site's graph schema does not
expose a field (the Teamwork Graph API is in Early Access), the app says so
explicitly — which cause, and what to do about it — instead of returning a bare
validation error.

## How we built it

A Forge app on nodejs24.x, with four modules and one shipped identity:

- **jira:issuePanel** (Custom UI) — the verified identity with every registry
  check, the policy table, and the live trail with its chain state.
- **rovo:agent** — "AgentLedger Auditor". Its prompt enforces the verify →
  policy → context → record order and forbids claiming an action that no tool
  call confirmed.
- **rovo:mcp** — five tools (policy, verify, context, trail, record), reachable
  in Rovo Studio and from third-party MCP clients.
- **rovo:skill** — *agent-attestation* packages the same rules so any Rovo agent
  in any workspace can follow them.

Engineering notes:

- The policy engine, the hash chain and the encoding helpers are pure with no
  Atlassian dependency, so they are covered by unit tests that run without an
  account. **40 tests pass**, and a local manifest validator cross-checks every
  declared action input against the keys the backend actually reads.
- Keccak-256 is implemented in-project (Node's crypto ships SHA3-256, a
  different padding) and checked against the standard vectors.
- External reads go through `@forge/api`'s `fetch` and
  `api.asUser().requestTeamworkGraph(...)`, so the manifest's egress rules and
  the acting user's own permissions apply. The app never sees data the user
  cannot already see.
- The resolver signature was found the hard way: Forge calls a resolver with
  `{ context, call: { functionKey, payload } }`, not `(payload, context)`.
  Reading `payload.op` off the first argument returns `undefined` and the
  handler answers something plausible instead of doing the work. Both shapes are
  now accepted, unit-tested, and guarded by the validator.

## Challenges we ran into

Five, all of the kind that only show up in a real runtime.

1. **The Forge resolver envelope.** Forge does not pass `(payload, context)`; it
   passes `{ context, call: { functionKey, payload } }`. Every panel operation
   was silently falling through to its default branch. Once the payload was
   unpacked correctly the panel worked on the first try.
2. **`@forge/kvs` is CommonJS**, so a default import can land on the whole
   `module.exports` namespace instead of the client — which surfaces at runtime
   as `kvs.get is not a function`. The client is now resolved once, explicitly,
   and the code fails loudly if none of the export shapes match.
3. **A descriptive check reads like a failure.** The registry returns
   `badge_embedding: "extension"` — a fact about where the badge lives, not a
   failure. The panel rendered any non-`true` value with a red dot, so a green
   "identity verified" card sat next to a red check. Now a check only turns red
   when it is explicitly `false`, and descriptive values are shown as a note.
4. **`api.asUser().get()` does not exist in `@forge/api` v6.** All three Jira
   REST reads called it and failed at runtime as
   `out.asUser(...).get is not a function`. A Jira read in v6 is
   `api.asUser().requestJira(route)`, and the response is read with `.json()`,
   not `.data`.
5. **`requestJira` takes a route, not a string.** Passing a path fails with
   *"You must create your route using the 'route' export from '@forge/api'"*.
   The routes are now built with the `route` tagged template — which also
   rejects `..` and `/` in an issue key — and unit-tested.

Each of the last two is now caught by the local validator, so neither can come
back unnoticed.

## Accomplishments that we're proud of

The Rovo agent answers from the trail rather than from its own memory of the
conversation. Given a refund an agent attempted, it reads the hash-chained
attestation for that work item, confirms `chainValid`, names the agent and its
registry id, and states that a human must approve before the refund proceeds.

The identity check is genuinely independent of the app: **14 separate checks**
come back from the Concordium Agent Registry, including the on-chain card hash
comparison, and the whole set is shown to the user.

The rig refuses to green-wash itself. In the mutation mode of the sibling build
(fluxharness), deliberately weakening the Critic drops the score to 0.000 and
exits non-zero — an eval suite that cannot catch its own regressions is
decoration.

## What we learned

Forge's module resolver and its Rovo/MCP tools are not the same dispatch
problem. A `jira:issuePanel` module delivers every `invoke` to the module
resolver, regardless of the function key, so the panel must route its own
operations with an explicit `op` and dispatch server-side. A `rovo:mcp` tool, in
contrast, is called with the tool's manifest inputs — and reading a key the
manifest does not declare produces `undefined` with no error anywhere.

Also: honest reporting is a feature, not a cop-out. "No agents registered in
this registry", "no linked goal found", "chain broken at entry #3" and "this
site's graph schema does not expose that field" are all answers the app gives
deliberately.

## What's next

- A human approval surface in the panel: approve or deny a flagged action, which
  appends the human approval attestation the trail already expects.
- An exportable audit bundle per work item: the trail, the identity report and
  the policy table as one signed artifact.
- More registries. The verifier is source-agnostic, so a second identity source
  is one adapter away.

## Built With

atlassian-connect, atlassian-forge, forge-custom-ui, nodejs, nodejs24,
javascript, keccak256, jira, teamwork-graph, rovo, mcp, concordium, cis-8004,
erc-8004, base-sepolia, hash-chain, sha-256
