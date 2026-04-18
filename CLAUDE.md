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

## Workflow (MAIN-ONLY — updated 2026-04-18 evening)

**Hard rule: commit directly to `main`. No feature branches. No pull requests. No compare views.** Every change — code, docs, config — lands on `main` in a single commit, pushed immediately. Hackathon-speed override. Applies to every contributor and every AI session in this repo.

**Exact flow:**

```bash
cd ~/yc-voice-agents-hackathon
git pull origin main
# make the change
git add <files>
git commit -m "..."
git push origin main
```

**Per-turn discipline (for AI sessions):** every time the user sends an input, the AI session must (a) pull latest `main` before substantive work, and (b) report the current branch on the first line of its reply (`**Branch: \`<name>\`**`). With main-only, this will always say `main`.

**Rules that still apply:**
- Never commit secrets (`.env`, API keys, tokens). `git status` before every `git add`.
- Never force-push or rewrite `main`.
- Pull before push. If `git push` rejects (you're behind), `git pull --rebase origin main` then push.
- Verbal coordination for overlapping changes. If two people edit the same file simultaneously, talk it out — don't fight git.

**Worktrees are obsolete under main-only.** `~/yc-jenny` and `~/yc-ops` worktrees that were set up for branch isolation no longer serve a purpose. Recommend collapsing to a single working directory (`~/yc-voice-agents-hackathon`).

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
