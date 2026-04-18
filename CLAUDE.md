# YC Voice Agents Hackathon

## Project

Voice agent built on Gemma 4 via Cactus, on-device, dual STT architecture. Competing for the YC Interview main prize at the YC Voice Agents Hackathon (2026-04-18).

## Team

- **Neil** (owner, repo admin)
- **Jenny** (collaborator, push access) — uses Claude Code + gstack

Both co-located at the hackathon. Verbal real-time comms available — no async handoffs needed for meta-discussion.

This file is also exposed as `AGENTS.md` (Codex convention) and `.cursorrules` (Cursor convention) via symlinks, so any AI coding tool picks up the same shared context.

## Stack (planned)

- **Model:** Gemma 4, running on-device via Cactus (Python SDK)
- **STT:** dual STT pipeline (see Jenny's prior `voice-passport-prototype` for reference patterns only — NO code copying, fresh build only per hackathon rules)
- **Runtime:** TBD — likely Python for Cactus integration

## Workflow (BRANCH + DIRECT MERGE — updated 2026-04-18 evening)

**Rule: build on a feature branch, push the branch to GitHub, merge to `main` directly. No pull requests, no review gate — hackathon speed.** Applies to every contributor and every AI session in this repo.

**Exact flow for any build / change:**

```bash
# start new work
cd ~/yc-voice-agents-hackathon
git checkout main && git pull origin main
git checkout -b jenny/<feature>         # feature-descriptive name

# build + commit as you go
git add <files>
git commit -m "..."

# when ready to land (or hit a milestone)
git push -u origin jenny/<feature>      # visible to Neil on GitHub
git checkout main
git pull origin main                     # sync in case main moved
git merge --no-ff jenny/<feature> -m "merge: <one-line summary>"
git push origin main
git checkout jenny/<feature>             # return to feature branch for follow-up
```

**Per-turn discipline (for AI sessions):** every time the user sends an input, the AI session must (a) pull latest `main` before substantive work, and (b) report the current branch on the first line of its reply (`**Branch: \`<name>\`**`).

**Rules that still apply:**
- Never commit secrets (`.env`, API keys, tokens). `git status` before every `git add`.
- Never force-push or rewrite `main`.
- If `git merge` hits a conflict, resolve locally before pushing. Don't force.
- Don't merge Neil's branches (`neil/*`) or ops branches (`ops/*`) without verbal OK.
- Branches are cheap — one per feature or per commit is fine. Delete after merge is optional.
- Verbal coordination for overlapping changes. If two people edit the same file simultaneously, talk it out — don't fight git.

## Shared memory across AI sessions (hackathon scratchpad)

State that doesn't belong in git — progress, blockers, decisions made mid-build, "heads up for the next AI" notes — lives at `~/shared-memory/scratchpad.md`. This is the async channel between parallel terminals.

**Read at session start.** First substantive action in every new Claude Code session on this repo: `tail -60 ~/shared-memory/scratchpad.md`. Load into context. Catches anything other terminals recorded since your last turn.

**Write after every milestone.** When you finish a merge, push, land a feature, hit a blocker, or lock a decision, append one line to the end of the file:
```
## HH:MM — <one-line summary> (<initials>@<branch>)
```
Example: `## 15:20 — ops/memory-sync merged. Scratchpad auto-read rule live. (cc@ops)`
Initials: `jr` (Jenny), `nb` (Neil), `cc` (Claude Code), `cx` (Codex), `cs` (Cursor).

**The SYNC shortcut.** If the user types `SYNC` (any casing), re-read the full set: `~/shared-memory/scratchpad.md`, `~/shared-memory/neil-blockers.md`, `~/Desktop/0418/hackathon-strategy/hackathon-strategy.md`, `~/Desktop/0418/jenny-action-plan.md`. Return a terse summary: state + blockers + next action.

**Don't dump verbose logs here.** One-line milestones only. If it needs more than a line, write it in a proper design doc or the scratchpad's structured sections.

- **gstack skills:** fully wired. Common flows:
  - `/checkpoint` — save progress (syncs to Drive via MCP)
  - `/office-hours` — design doc sessions (syncs to Drive via MCP)
  - `/ship` — feature branch → PR workflow
  - `/qa` — browser-based QA testing
  - `/investigate` — debugging errors

## Hackathon constraints

- **No pre-existing code:** all code must be written fresh during the hackathon window.
- **No pre-build evidence:** commits, designs, and artifacts must be dated within the hackathon.
- **Demo-first mindset:** every feature is judged on whether it lands in the demo. Ship to demoable state before polishing.

## Related repos (reference only, do NOT copy code)

- `~/voice-passport-prototype` — Jenny's prior voice agent prototype. Architecture patterns only.
- `~/ybuffet/` — Jenny's main product. Unrelated to the hackathon.
