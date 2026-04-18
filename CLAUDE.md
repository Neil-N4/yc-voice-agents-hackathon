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

## Workflow (STRICT — updated 2026-04-18 late afternoon)

**Hard rule: ALWAYS branch. ALWAYS commit to the branch first. NEVER commit directly to `main`.** No exceptions — not for doc tweaks, not for one-line fixes, not for bootstrap. Every change goes on a branch first. This rule is global for this repo and applies to every contributor and every AI session.

**Per-turn discipline (for AI sessions):** every time the user sends an input, the AI session must (a) pull the latest `main` before doing substantive work, and (b) report the current branch on the first line of its reply (format: `**Branch: \`<name>\`**`). Multiple Claude sessions run on this repo in parallel — this discipline keeps every session honest about local state.

**Steps for every new feature:**

1. **Sync latest `main` first.** Run `git checkout main && git pull origin main` BEFORE creating a branch. Never branch from stale state.
2. **Create a feature-descriptive branch.** Name it after the feature you're building:
   - Jenny: `jenny/<feature>` (e.g. `jenny/brain`, `jenny/stt`, `jenny/demo-ui`, `jenny/hybrid-routing`)
   - Neil: follow his own convention (likely `neil/<feature>`)
3. **Commit on the branch.** Small logical commits, pushed to origin often (every ~30 min) so teammates can see progress.
4. **Merge branch → main → push.** `git checkout main && git pull && git merge <branch> && git push origin main`. **No PR required** for Jenny's branches (hackathon speed), but the branch-first step is mandatory.

**Rules that still apply:**
- Never commit secrets (`.env`, API keys, tokens). `git status` before every `git add`.
- Never force-push or rewrite `main`.
- Don't merge Neil's branches to `main` without his verbal OK — he's the repo owner.

**When a PR still makes sense:** optional, only when you want a teammate sanity-check or to document a risky change. Default path = no PR.
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
