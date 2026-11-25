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
| Rovo agent + MCP server + reusable skill | done, deployed |
| Local manifest validation | done (`npm run validate`) |
| Public repository | done |
| Forge app registered | done — `ari:cloud:ecosystem::app/aa4346e9-fdfe-4379-bd6f-d050c1936bac`, team app in developer space `bb-dev-space` |
| Development deploy | done — 2.11.0 (25 Nov) |
| Production deploy | done — 2.0.0 (25 Nov) |
| Installed on a site | done — Jira on `bugcrowdninja-team-xdnwur9g.atlassian.net` (production build) |
| Panel renders in the issue view | done — issue key KAN-1 read from `view.getContext()`, Agent identity card prefilled |
| Judge installation link | **done** — distribution set to *Sharing with anyone*; Jira + Ecosystem; link in `submission/INSTALL_LINK.txt` |
| Demo video (YouTube, public, < 5 min) | **done** — <https://youtu.be/tKIMEUkLjo4>, 4:11 |
| Devpost registration | **done** — solo, source = Atlassian |
| Devpost project + submission form | **pending** — the *Create project* button is reCAPTCHA-gated, so a human must click it; every field value is in `submission/DEVSForm.md` |

## Blocked on the user

1. **The browser session.** The `browse` extension is currently disconnected
   (`paired-offline`), and three remaining steps need it: the console
   Distribution page, the Devpost form and the YouTube upload.
2. **The demo recording itself** — the app is deployed and installed, so the
   panel is live; the recording is the only user-gated part.
3. **YouTube upload.** The browser already has the Google session; a public
   (< 5 min) upload is one pass once the demo is recorded.

## Step-by-step

### 1. Get the app onto a site — DONE (25 Nov 2026)

```bash
cd /home/c0bw3b/Proj/codegeist2026/agentledger-forge
export PATH="/home/c0bw3b/.nvm/versions/node/v22.22.1/bin:$PATH"   # Forge CLI 14.2.0
npm run check                                                   # build + 25 tests + manifest validation
forge deploy --non-interactive --environment development         # → 2.11.0
forge deploy --non-interactive --environment production          # → 2.0.0
forge install --non-interactive \
  --site https://bugcrowdninja-team-xdnwur9g.atlassian.net \
  --product jira --environment production --confirm-scopes
```

CLI 15+ needs Node 22.23.4+; the local Node is 22.22.1, so CLI **14.2.0** is
the working version. CLI 16 is installed but not logged in.

### 2. Generate the judge installation link — DONE (25 Nov 2026)

The installation link can only be produced in the developer console; there is
no CLI command for it (`forge --help` has no `distribution`/`share` command in
CLI 14 or 16).

1. Open <https://developer.atlassian.com/console/myapps/aa4346e9-fdfe-4379-bd6f-d050c1936bac/manage/distribution>
2. **Distribution controls → Edit → `Sharing with anyone`** (not *Sharing
   within organization* — judges are outside our organization).
3. Fill in the app details: Company/Department `Independent (Leonard Sambu)`,
   Customer support contact `lakterian9@gmail.com`, Privacy policy
   <https://llakterian.github.io/privacy.html>, Terms of service
   <https://llakterian.github.io/terms.html>.
4. Under *Install this app onto*, tick **Jira** (the issue panel) and
   **Ecosystem** (the Rovo agent and MCP server). Save changes.
5. Copy the installation link. It is stored in `submission/INSTALL_LINK.txt`
   and pasted into `submission/SUBMISSION.md`.

App id for reference: `aa4346e9-fdfe-4379-bd6f-d050c1936bac`.

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
