#!/bin/bash
set -euo pipefail

# SessionStart hook for Claude Code on the web.
#
# Web sessions clone the repo into a fresh container with no node_modules, so
# the first `npm run build`/`test`/`lint` would otherwise force a manual
# `npm install`. Installing here means dependencies are ready before the
# session begins.

# Only run in remote (web) environments. Local sessions already have their own
# node_modules and dev setup, so there's nothing to do.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# `npm install` (rather than `npm ci`) reuses any node_modules cached in the
# container snapshot and is idempotent, so re-running the hook is cheap.
npm install
