#!/usr/bin/env bash
# Runs every time the dev container starts (including reattaches after a
# stop/start, not just on first creation). Starts the Next.js dev server in
# the background so http://localhost:3000 is up without a manual `npm run dev`.
set -euo pipefail

if (exec 3<>/dev/tcp/localhost/3000) 2>/dev/null; then
  exec 3<&- 3>&-
  echo "==> Dev server already running on :3000"
  exit 0
fi

echo "==> Starting Next.js dev server in background (logs: /tmp/next-dev.log)"
nohup npm run dev > /tmp/next-dev.log 2>&1 &
disown
