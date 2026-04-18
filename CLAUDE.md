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

## Workflow

- **Branches:** ALWAYS branch-and-PR. Never push directly to `main`, even for boilerplate or config.
  - Jenny's branches: `jenny/<feature>` (e.g. `jenny/scaffold`, `jenny/brain`, `jenny/demo-ui`)
  - Neil's branches: follow his own convention
- **Commits:** commit continuously on your branch — small logical commits, pushed often. Aggregate into a PR when the feature is mergeable.
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
