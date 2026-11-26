# AgentLedger

**Verifiable identity and a tamper-evident attestation trail for AI agents acting in Atlassian products.**

Built for [Codegeist 2026](https://codegeist2026.devpost.com/): Atlassian's annual
Forge hackathon ($120,000 in cash).

---

## The problem

Teams are handing real work to AI agents: triage an issue, transition a ticket,
approve a service request, trigger a refund. What is missing is not capability:
it is **attribution**.

- An agent can *claim* to be anything. There is no check that the thing acting on
  your issue is the agent it says it is.
- An agent's actions leave no durable trail. "The agent did it" is a claim, not
  evidence.
- Nobody can tell, after the fact, whether the agent was *allowed* to do what it
  did.

AgentLedger answers all three: an agent's identity is verified against a registry
the agent does not control, every consequential action is recorded in a
hash-chained attestation trail, and a small explicit policy says which actions
an agent may take on its own and which ones need a human signature.

## What is in the box

| Piece | Module | What it does |
| --- | --- | --- |
| Issue panel | `jira:issuePanel` | Shows the verified identity, the policy and the live trail for a work item |
| Agent | `rovo:agent` | "AgentLedger Auditor", an AI teammate that follows the attestation rules |
| MCP server | `rovo:mcp` | Exposes the same five tools to Rovo Studio **and** to third-party MCP clients |
| Reusable skill | `rovo:skill` | `agent-attestation`, packages the rules so any Rovo agent can follow them |
| Graph context | Teamwork Graph API | Goals, discussion and linked pull requests behind the work item |

### The five tools

| Tool | Verb | Purpose |
| --- | --- | --- |
| `AgentLedger action policy` | GET | Which actions an agent may take alone, which are human-gated |
| `Verify agent identity` | GET | Verify an agent against a registry; returns every check that passed or failed |
| `Work item context` | GET | Teamwork Graph context: goals, comments, linked pull requests |
| `Read the attestation trail` | GET | The hash-chained trail plus the result of verifying that chain |
| `Record an agent action` | UPDATE | Verify → evaluate → append one attestation to the trail |

## How an action is attested

```
agent acts ──▶ verify identity ──▶ evaluate policy ──▶ append attestation
                    │                     │                      │
              registry check        human-gated?          hash = H(payload ‖ H(prev))
                                    approve/refund/close          │
                                                                  ▼
                                                            chain: H₀ → H₁ → H₂
```

1. **Verify.** The agent reference is checked against the Concordium Agent
   Registry (CIS-8004) or an ERC-8004 identity registry. The registry re-fetches
   the agent card and compares its SHA-256 with the hash committed on chain, so a
   self-serving agent cannot mint its own identity.
2. **Evaluate.** A small, readable policy table. `comment`, `triage`,
   `transition`, `assign` and `create` are within policy for a verified agent.
   `approve`, `refund` and `close` are **human-gated**: an agent records them as
   `flagged` and waits.
3. **Append.** Each attestation commits to the previous one. Editing or removing
   an entry breaks the chain, and the panel says exactly where.

The app never claims more than it can show. If an identity check fails, the
panel lists the failing checks. If the chain is broken, it says which entry
broke it. If a Teamwork Graph query is unavailable, it names the query.

## Identity sources

**Concordium Agent Registry (CIS-8004)**. A badge check over HTTPS that
re-fetches the agent card and compares its SHA-256 with the hash committed
on-chain. Every individual check comes back in the response, so the UI can show
*why* an identity is valid.

```
GET https://agent-registry-mcp.concordium.com/v1/badge-check/<token-address>
```

BotIn's own entry (agent #1190, badge `JyP9X278CKWoNLAFg5kVr`) verifies live:
the card hash matches the hash committed on chain, the owner matches, the
extension is conformant.

**ERC-8004 identity registry**. A direct `eth_call` read of the agent record
(owner, wallet, active flag, subscription tier) on Base Sepolia. If the registry
holds no agents, the app says "not registered" instead of failing. An honest
negative answer is still an answer.

Both return the same normalised shape, so nothing downstream cares where an
agent came from.

## Teamwork Graph context

New apps cannot send raw Cypher, so the app uses Atlassian's curated query
fields and the direct object query, all through
`api.asUser().requestTeamworkGraph(...)` so every read is permission-filtered
for the person who triggered it:

| Query | Returns |
| --- | --- |
| `jiraWorkItem(id: <ARI>)` | The work item itself |
| `jiraWorkItemGoals(id: <ARI>)` | Goals linked to the work item |
| `jiraWorkItemComments(id: <ARI>, since: "P30D")` | Recent discussion |
| `jiraWorkItemLinkedExternalPullRequests(id: <ARI>)` | Linked pull requests |

Each query is isolated: one unavailable query (missing scope, schema change) does
not take down the rest. It is reported instead of hidden.

## Repository layout

```
agentledger-forge/
├── manifest.yml              Forge manifest (rovo:agent, rovo:mcp, rovo:skill, jira:issuePanel)
├── package.json
├── src/
│   ├── index.js              Forge handlers (panel, MCP tool, actions)
│   ├── verifiers.js          Identity: Concordium CIS-8004 + ERC-8004
│   ├── policy.js             What an agent may do (pure, tested)
│   ├── attestations.js       Hash-chained trail (pure, tested)
│   ├── context.js            Teamwork Graph queries + LLM rendering
│   ├── abi.js                Minimal ABI encoding/decoding
│   └── keccak.js             Dependency-free Keccak-256
├── ui/src/main.js            Custom UI panel (esbuild → static/panel/app.js)
├── static/panel/             index.html, styles.css, bundled app.js, icon, agent prompt
├── skills/agent-attestation/ SKILL.md. The reusable Rovo skill
├── submission/
│   ├── SUBMISSION.md         The Devpost submission text and demo script
│   └── PLAN.md               Step-by-step deploy → submit checklist
├── test/                     node:test unit tests (25 passing)
└── tools/
    ├── check-agent.mjs       Live check of both identity verifiers
    ├── validate-manifest.mjs Local manifest validation (no Atlassian login needed)
    └── debug-*.mjs           Debug helpers
```

## Running it locally

```bash
npm install
npm run build        # bundle the panel UI
npm test             # 25 unit tests
npm run validate     # manifest validation
npm run check:live   # verify BotIn's identity against both registries, live
```

`npm run check:live` prints the full verification for BotIn #1190:

```
=== Concordium · BotIn #1190 ===
  source        : Concordium Agent Registry (CIS-8004) (testnet)
  agent id      : 1190
  owner         : 2yR1ck8SshaDaK1QbjkRbafjoRtzSVJ1LSSyn23AdkWazZ4Rqh
  status        : Active
  valid         : true
  failed checks : none
  card hash     : matches on-chain hash
```

## Deploying to Forge

Requires an Atlassian Cloud developer site and a Forge login.

```bash
npm install -g @forge/cli@14          # 15+ needs Node 22.23.4+
forge login
forge create agentledger-forge -t blank --personal -y --accept-terms
# copy the generated app id into manifest.yml (app.id)
forge deploy --environment development
forge install --non-interactive
```

The deployment needs the admin to grant the `read:graph:*` scopes for the
Teamwork Graph queries; without them the graph queries return empty and the app
says so.

## Design notes

- **Pure core, thin edges.** The policy, the hash chain and the ARI/encoding
  helpers have no Atlassian dependency, so they are unit-tested without an
  account. The Forge handlers are glue.
- **Dependency-free Keccak.** The Forge runtime bundles `src/` with esbuild and
  Node's crypto only ships SHA3-256, which is a different padding. `src/keccak.js`
  implements Keccak-256 and is checked against the standard vectors in the test
  suite.
- **No global fetch.** In the Forge runtime external requests must go through
  `@forge/api`'s `fetch`, which enforces the manifest egress rules. The
  verifiers take a `fetchImpl`, so the same code runs in Node for the local
  checks and in Forge for the app.
- **Honest negatives.** An empty registry, a missing scope, a broken chain and a
  failed identity check are all reported as themselves. The app is a piece of
  evidence, so it must not overstate.

## Licence

MIT
