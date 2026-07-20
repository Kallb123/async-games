#!/usr/bin/env bash
# Runs once after the dev container is created.
#   1. Installs dependencies with a clean, lockfile-faithful install.
#   2. Scaffolds .env.local from .env.example (without clobbering an existing
#      one) and points MONGODB_URI at the bundled Mongo service so the dev
#      server can start out of the box.
set -euo pipefail

echo "==> Installing npm dependencies (npm ci)"
npm ci

if [ ! -f .env.local ]; then
  echo "==> Creating .env.local from .env.example"
  cp .env.example .env.local
  # Point at the Mongo service defined in docker-compose.yml.
  if grep -q '^MONGODB_URI=' .env.local; then
    sed -i 's#^MONGODB_URI=.*#MONGODB_URI=mongodb://mongo:27017/async-games#' .env.local
  else
    echo 'MONGODB_URI=mongodb://mongo:27017/async-games' >> .env.local
  fi
  echo "    .env.local created — fill in Clerk and Firebase keys before running the app."
else
  echo "==> .env.local already exists, leaving it untouched"
fi

cat <<'EOF'

==> Dev container ready.

  Common commands:
    npm run dev        # start the Next.js dev server on http://localhost:3000
    npm test           # run the Vitest suite
    npx tsc --noEmit   # type-check
    npm run build      # production build (needs Clerk/Firebase env vars)

  MongoDB is available on the `mongo` host (mongodb://mongo:27017/async-games).
  Clerk and Firebase are external services — add their keys to .env.local.
EOF
