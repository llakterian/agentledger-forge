# Codegeist 2026 — submission draft (AgentLedger)

**Status:** draft. Everything that still needs a human (Atlassian login, deploy,
YouTube upload, final Devpost form) is listed in `PLAN.md`.

---

## Project name

**AgentLedger** — verifiable identity and a tamper-evident attestation trail for
AI agents acting in Atlassian products.

**One-liner:** Every consequential action an AI agent takes on a Jira work item
is checked against a registry the agent does not control, evaluated against a
human-gated action policy, and appended to a hash-chained attestation trail.

## Category

**Apps for Specialized Industries**

The rules ask for one category per submission (and allow the sponsor to
reassign). The honest case for this one:

- The users this app exists for are **regulated-industry teams that let AI
  agents touch money and approvals** — fintech, healthtech, insurance, legal
  ops. The action vocabulary in the policy is that world: `approve`,
  `refund`, `close`, `assign`, `transition`.
- The demo runs on a JSM-shaped scenario: an agent asked to **trigger a refund
  / close a request**, which the policy refuses and flags for a human, with
  the identity evidence and the hash-chained trail shown alongside.
- The registry behind it, BotIn, is itself a financial-grade agent identity
  layer — on-chain ownership, USDT subscription payments, a reputation score —
  built for professional agents rather than for consumer chat.

*Fallback:* if the judges read the category differently, **Apps for Software
Teams** is the natural reassignment (the panel is a Jira issue panel and the
Teamwork Graph context feeds issue triage). The rules explicitly let the
sponsor move an entry between categories, so the entry is not harmed by this
choice.

There is also a **Participation Prize** — an Atlassian Developer Swag Pack,
first-come first-served to every entrant with an eligible submission — so the
entry has a floor even if it places nowhere.

## Schedule (from the official rules)

| | |
|---|---|
| Registration + submission period | 27 Oct 2026, 9:00 am PT → **22 Dec 2026, 12:00 pm PT** (20:00 UTC / 23:00 EAT) |
| Judging period | 5 Jan 2027, 1:00 pm PT → 3 Feb 2027, 5:00 pm PT |
| Winners announced | on or around 15 Feb 2027, 9:00 am PT |

## Prize structure (from the official rules)

| Prize | Amount | Count |
|---|---|---|
| 1st place (per category) | $15,000 + 2 Team 2027 tickets | 3 |
| 2nd place (per category) | $8,000 | 3 |
| 3rd place (per category) | $5,000 | 3 |
| Best Agents — Rovo/Assignable agents | $1,500 | 6 |
| Best app with Atlassian MCP | $1,500 | 6 |
| Best apps with Teamwork Graph integration | $1,500 | 6 |
| Best Marketplace published app | $1,500 | 6 |
| Participation prize | Atlassian Developer Swag Pack | first-come, first-served |

## Bonus prizes entered

1. **Best Agents — Rovo/Assignable agents** ($1,500 × 6)
   The app ships a `rovo:agent` (AgentLedger Auditor) *and* a reusable
   `rovo:skill` (`agent-attestation`), so any Rovo agent in any workspace can
   follow the same verify → policy → record rules.
2. **Best app with Atlassian MCP** ($1,500 × 6)
   The app exposes an MCP server (`rovo:mcp`) with five tools. The same tools
   are reachable in Rovo Studio and from third-party MCP clients in Preview.
3. **Best apps with Teamwork Graph integration** ($1,500 × 6)
   The app consumes the Teamwork Graph API through
   `api.asUser().requestTeamworkGraph(...)` to pull the goals, recent
   discussion and linked pull requests behind a work item, and feeds that
   context to the agent before it acts.

**Not entered:** Best Marketplace published app (publishing to the Marketplace
was out of scope for the time available).

**Eligibility check:** Kenya is not on the excluded list (Brazil, Quebec,
Russia, Belarus, Crimea, Cuba, Iran, North Korea, Syria, Sudan, Myanmar, plus
OFAC-sanctioned jurisdictions), so the entry is eligible as an individual of
major age. Entered as a **solo** participant.

---

## Explanation (how the project meets the main technology requirement)

> Build an app using Atlassian's Forge platform and integrate with at least one
> Atlassian product or platform capability.

AgentLedger is a Forge app built on `nodejs24.x` that integrates with Jira, the
Teamwork Graph and Rovo. It is not a wrapper around a language model: the model
is optional, and every decision the app makes is enforced in code.

### The problem it solves

Teams are starting to hand real work to AI agents — triaging an issue,
transitioning a ticket, approving a service request, triggering a refund.
Three things are missing in that setup:

1. **Attribution.** An agent can claim to be anything. There is no check that
   the thing acting on your issue is the agent it says it is.
2. **Evidence.** An agent's actions leave no durable trail. "The agent did it"
   is a claim, not a record.
3. **Authority.** Nothing states which actions an agent may take on its own and
   which ones need a human signature — so either humans rubber-stamp
   everything, or agents are trusted with everything.

### What the app actually does

**Verify.** The agent reference is checked against the Concordium Agent
Registry (CIS-8004) over HTTPS. The registry re-fetches the agent card and
compares its SHA-256 with the hash committed on chain, and returns every
individual check it performed, so the UI can show *why* an identity is valid
rather than just asserting that it is. A second source — an ERC-8004 identity
registry — is supported through direct `eth_call` reads on Base Sepolia. If the
registry holds no agents, the app reports "not registered" instead of failing:
an honest negative answer is still an answer.

**Evaluate.** A short, readable policy table. `comment`, `triage`,
`transition`, `assign` and `create` are within policy for a verified agent.
`approve`, `refund` and `close` are human-gated: the agent records them as
`flagged` and waits for a human approval attestation. The table is code, not
prompt text, so it cannot be talked around by an LLM.

**Record.** Every consequential action becomes one attestation. Each attestation
commits to the hash of the previous one, so editing or deleting an entry breaks
the chain — and the panel reports exactly which entry broke it, instead of
quietly continuing.

**Context.** Before an agent acts, the app queries Atlassian's Teamwork Graph
for the work item's connected context: the goals it serves, the recent
discussion, the linked pull requests. The agent acts in light of that context,
and a work item with no linked goal is reported as a finding rather than
silently ignored.

### What is in the box

- **Jira issue panel** (`jira:issuePanel`, Custom UI): the verified identity
  with every check, the policy table, and the live trail with its chain state.
- **Rovo agent** (`rovo:agent`): "AgentLedger Auditor", whose prompt enforces
  the verify → policy → context → record order and forbids claiming an action
  that no tool call confirmed.
- **MCP server** (`rovo:mcp`): five tools — policy, verify, context, trail,
  record — reachable in Rovo Studio and from third-party MCP clients.
- **Reusable skill** (`rovo:skill`): `agent-attestation` packages the same
  rules so any Rovo agent in any workspace can follow them.
- **Identity**: Concordium Agent Registry (CIS-8004) and ERC-8004, both
  read-only, with the BotIn agent #1190 verifying live against the registry —
  card hash matching the hash committed on chain, owner matching, extension
  conformant.

### Engineering notes

- The policy engine, the hash chain and the encoding helpers are pure and have
  no Atlassian dependency, so they are covered by unit tests that run without an
  account (25 tests, all passing).
- Keccak-256 is implemented in-project (Node's crypto only ships SHA3-256,
  which is a different padding) and checked against the standard vectors.
- External reads go through `@forge/api`'s `fetch` and
  `api.asUser().requestTeamworkGraph(...)`, so the manifest's egress rules and
  the user's own permissions apply. The app never sees data the acting user
  cannot already see.
- The app is written to report failures honestly: an empty registry, a missing
  scope, a broken chain and a failed identity check are each reported as
  themselves.

---

## Instructions for the judges

1. Install the app from the installation link (see below) into a Jira site.
2. Grant the requested scopes when prompted. The Teamwork Graph scopes
   (`read:graph:*`) are optional — without them the graph queries return empty
   and the app says so, and everything else keeps working.
3. Open any Jira issue and click the **AgentLedger** icon in the issue view to
   open the panel.
4. In the panel, paste the agent reference `JyP9X278CKWoNLAFg5kVr` and press
   **Verify**. The app calls the Concordium Agent Registry live and shows every
   check: on-chain agent found, status active, agent URI present, card fetched,
   card hash matches the hash committed on chain, badge present, owner matches,
   contracts match, extension conformant.
5. Press **Record** with an action such as *Comment on an issue* — the
   attestation is appended to the trail. Try *Trigger a refund / payout*: it is
   recorded as **flagged** (human-gated) and the agent is not allowed to proceed.
6. Open the AgentLedger Auditor agent in Jira (Rovo) and ask it to show the
   attestation trail for the issue. It answers from the trail, not from its own
   memory of the conversation.
7. If you have an MCP client, connect it to the app's MCP server and call
   `AgentLedger action policy`, `Verify agent identity`, `Work item context`,
   `Read the attestation trail` and `Record an agent action`.

**Installation link:** _(paste here — generated in the developer console:
<https://developer.atlassian.com/console/myapps/aa4346e9-fdfe-4379-bd6f-d050c1936bac/manage/distribution>
→ **Distribution controls → Edit → `Sharing`**. There is no CLI command for
this step.)_

**Repository:** https://github.com/llakterian/agentledger-forge

**Live identity check without Atlassian:** the repository contains
`npm run check:live`, which verifies BotIn #1190 against both registries and
prints the full result.

---

## Demo video script (target: 3 minutes 30 seconds)

| Beat | What happens on screen | Voiceover |
| --- | --- | --- |
| 0:00–0:20 | Title card: AgentLedger. Problem statement: "An agent acted on my issue. Who was it, was it allowed, and can I prove it?" | "Teams are handing real work to AI agents. But attribution, evidence and authority are all missing." |
| 0:20–0:55 | Jira issue open. The AgentLedger panel appears. Paste `JyP9X278CKWoNLAFg5kVr`, press **Verify**. | "AgentLedger checks the agent against the Concordium Agent Registry — a registry the agent does not control. The registry re-fetches the agent card and compares its hash with the one committed on chain." |
| 0:55–1:25 | The check list ticks over: card fetched, hash matches, owner matches, badge present. | "Every individual check comes back, so you can see why it passed — not just that it passed." |
| 1:25–1:55 | Policy table expanded. `refund` and `close` marked *human approval required*. | "Then a policy decides what the agent may do alone. Approve, refund and close are human-gated. That is code, not prompt text — an LLM cannot talk around it." |
| 1:55–2:30 | Press **Record** with "Comment on an issue" → the trail gains an entry. Press **Record** with "Trigger a refund" → verdict **flagged**. | "Every consequential action becomes one attestation, and each one commits to the hash of the last. Edit one entry and the chain says exactly where it broke." |
| 2:30–2:50 | Rovo agent panel: "Show the attestation trail for this issue" → the agent answers from the trail. | "The Rovo agent answers from the trail, never from its own memory." |
| 2:50–3:10 | MCP client window: call `Work item context` → goals, comments, linked PRs for the issue. | "And it acts in context: Teamwork Graph tells the agent which goals the work serves." |
| 3:10–3:30 | Back to the issue panel: chain intact, head hash shown. | "AgentLedger: verifiable identity, human-gated authority, and a trail you can check. Built on Forge." |

**Recording notes:** 1080p if possible; keep the browser zoom at 100 %; the
panel is a narrow column, so read the check list at 125 % if it is too small on
screen.

### Recording rig

`submission/record_demo.sh` records the screen and prints the timed cue sheet
for the beats above:

```bash
cd /home/c0bw3b/Proj/codegeist2026/agentledger-forge
./submission/record_demo.sh --cue      # just the cue sheet
./submission/record_demo.sh            # record a 4-minute take
```

The laptop panel is 1366×768 (no 1080p available), so the capture is native.

### YouTube upload

- **Title:** `AgentLedger — verifiable identity and a tamper-evident trail for AI agents in Atlassian`
- **Visibility:** **Public** (unlisted will not satisfy the rules).
- **Description:**

```
AgentLedger is a Forge app that answers three questions about any AI agent
that acts inside an Atlassian product: who was it, was it allowed to act, and
can I prove it afterwards?

IDENTITY — the agent is verified against the Concordium Agent Registry
(CIS-8004) over HTTPS. The registry re-fetches the agent's card and compares
its SHA-256 with the hash committed on chain, so the agent cannot vouch for
itself. A second verifier checks an ERC-8004 identity registry on Base
Sepolia by direct eth_call.

AUTHORITY — a policy engine (code, not prompt text) decides what an agent may
do alone. Comment, triage, transition, assign and create are within policy for
a verified agent; approve, refund and close are human-gated and are recorded
as "flagged" until a reviewer signs off.

EVIDENCE — every action becomes one attestation that commits to the hash of
the previous one. Tamper with any entry and the panel names the exact entry
that broke the chain.

CONTEXT — Teamwork Graph tells the agent which work item it is acting on and
which goals that work serves, before it acts.

BUILT ON FORGE — jira:issuePanel (Custom UI), a rovo:agent, a rovo:mcp server
with five tools, and a reusable rovo:skill.

Install it from the judge installation link, open any Jira issue, click
"View app actions" -> AgentLedger, and press Verify.

Repo: https://github.com/llakterian/agentledger-forge
Built by Sambu Leonard (@lakterian9) — https://linkedin.com/in/cheruiyoot-sambu
```

- **Tags:** `atlassian`, `codegeist2026`, `forge`, `jira`, `rovo`, `mcp`,
  `ai-agents`, `security`, `audit-trail`

---

## Open items before submission

See `PLAN.md` for the full checklist.

- [x] Atlassian Cloud developer site + Forge CLI login
- [x] `forge create` → app id `aa4346e9-fdfe-4379-bd6f-d050c1936bac` in `manifest.yml`
- [x] `forge deploy` → development 2.11.0, production 2.0.0
- [x] `forge install` → installed in Jira on `bugcrowdninja-team-xdnwur9g.atlassian.net`
- [ ] Console **Distribution → Edit → `Sharing`** → copy the judge installation
      link into the box above and into the Devpost form
- [ ] Confirm the Teamwork Graph scopes are granted; record a real graph
      response for the demo
- [ ] Link a goal to the demo issue so the "Work item context" beat shows a
      goal, not an empty result
- [ ] Record the demo video (< 5 min) and upload it to YouTube as **public**
- [ ] Fill the Devpost submission form (category, two/three bonus prizes,
      installation link, YouTube URL, explanation)
- [x] Confirm Kenya is not on the excluded countries/territories list
