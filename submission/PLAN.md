# Codegeist 2026 — plan

**Deadline:** 22 December 2026, 12:00 PM Pacific Time (20:00 UTC).
**Target submit:** 18 December 2026 (four days of slack).
**Repo:** https://github.com/llakterian/agentledger-forge
**App:** https://github.com/llakterian/agentledger-forge (repository root is the app)

---

## Where this stands

| Piece | State |
| --- | --- |
| App scaffold (manifest, backend, panel UI) | done |
| Identity verification (Concordium CIS-8004 + ERC-8004) | done, live-verified |
| Policy engine + hash-chained attestation trail | done, 25 unit tests passing |
| Teamwork Graph context (4 curated/direct queries) | coded, not yet run against a live site |
| Rovo agent + MCP server + reusable skill | done, needs a live deploy to confirm |
| Local manifest validation | done (`npm run validate`) |
| Public repository | done |
| Forge deploy + install link | **blocked** — needs an Atlassian login |
| Demo video (YouTube, public, < 5 min) | **blocked** — needs the live app |
| Devpost submission form | **blocked** — needs the install link + video |

## Blocked on the user

1. **Atlassian account + Cloud developer site.** `forge login` opens a browser
   flow. Everything after that is automated.
2. **YouTube upload.** The browser already has the Google session; a public
   (< 5 min) upload is one pass once the demo is recorded.
3. **The demo recording itself** — the app has to be deployed and installed
   first.

## Step-by-step

### 1. Get the app onto a site

```bash
cd /home/c0bw3b/Proj/codegeist2026/agentledger-forge
npm install -g @forge/cli@14          # 15+ needs Node 22.23.4+; local Node is 22.22.1
forge login                           # opens a browser — the user signs in
forge create agentledger-forge -t blank --personal -y --accept-terms
````forge create` needs a Developer Space and cannot run unattended. It writes a
fresh `manifest.yml`; **merge** the generated `app.id` into the existing
manifest rather than replacing the file, and keep the existing
`permissions`/`modules` blocks.

```bash
# paste the generated id into manifest.yml:
#   app:
#     id: ari:cloud:ecosystem::app/<uuid>
npm run validate                       # catches every dangling reference locally
forge deploy --environment development
```

### 2. Install and generate the judge installation link

```bash
forge install --non-interactive
```

The **Start sharing your app** link (Devpost) produces the installation link
judges use: install → pick a site → grant scopes.

If `forge deploy` rejects the manifest, the likely causes are:

- the `rovo:skill` directory must contain exactly `SKILL.md` (it does);
- `jira:issuePanel` in its current form takes `resource:` + `resolver:` +
  `title:` + `icon:` (it does);
- the graph scopes must exist for the site — `read:graph:issue:jira`,
  `read:graph:goal:atlassian`, `read:graph:issue-comment:jira`,
  `read:graph:user:atlassian`, `read:graph:pull-request:external`;
- `external.fetch.backend` must be domain patterns without a scheme.

### 3. Verify the live behaviour

- Panel → **Verify** with `JyP9X278CKWoNLAFg5kVr` → all checks pass.
- **Record** → *Comment on an issue* → `allowed`, trail grows, chain intact.
- **Record** → *Trigger a refund / payout* → `flagged`.
- Rovo agent → "Show the attestation trail for this issue" → answers from the
  trail.
- MCP client → `Work item context` → goals/comments/PRs for an issue that has
  a linked goal.

If the graph queries come back empty, check that the admin granted the
`read:graph:*` scopes — the app reports the missing scope by name.

### 4. Record the demo

Script and beat-by-beat timings: `SUBMISSION.md` → "Demo video script".
Target 3:30, hard limit 5:00. Upload to YouTube as **public**.

### 5. Submit

- Devpost: `https://codegeist2026.devpost.com/` → **Join hackathon** → submit.
- Category: **Apps for Specialized Industries**.
- Bonus prizes: **Best Agents** and **Best app with Atlassian MCP**; add
  **Best apps with Teamwork Graph integration** if the graph queries worked
  live.
- Attach: installation link, YouTube URL, repository URL.
- Explanation: the "Explanation" section of `SUBMISSION.md`.

## Risks

| Risk | Mitigation |
| --- | --- |
| Forge rejects the manifest on a Preview module | `rovo:mcp`, `rovo:skill` and TWG are Preview but fully supported; the fallback is to drop `rovo:skill` first (it is the least load-bearing) |
| Teamwork Graph scopes not granted by the admin | The app degrades to "graph queries unavailable" and names the scope; everything else works |
| The demo issue has no linked goal | Link a goal to the demo issue before recording, or the "Work item context" beat shows "none found in the graph" |
| The category choice is questioned | The rules allow the sponsor to reassign a project between categories; Software Teams is the natural fallback and is noted in the submission |
| The demo video runs long | The script is timed; the longest beat (0:20–0:55) is a single panel interaction |
| Node version too old for Forge CLI 15+ | CLI 14 is installed and works with Node 22.22.1; `npm install -g @forge/cli@14` |
| Devpost form validation is strict about the video | Upload to YouTube first, set the video to public, then paste the URL |

## Calendar

| When | What |
| --- | --- |
| 18 Dec 2026, 06:00–08:00 UTC (09:00–11:00 EAT) | Target submission (internal deadline) |
| 22 Dec 2026, 18:00–20:00 UTC (21:00–23:00 EAT) | Official deadline — 12:00 PM PT / 20:00 UTC / 23:00 EAT |

Both are on `lakterian9@gmail.com` (calendar *Lakterian*), each with a 2-hour
notification. Cron reminders fire on Dec 17 (pre-stage), Dec 18 (target submit)
and Dec 21 (deadline eve).
