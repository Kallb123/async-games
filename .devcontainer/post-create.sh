#!/usr/bin/env bash
# Runs once after the dev container is created.
#
# Dependencies are installed in the Dockerfile (baked into the image), so this
# script only handles runtime setup that can't live in the image: scaffolding
# .env.local from .env.example (the repo is bind-mounted at runtime, not at
# image build time) and pointing MONGODB_URI at the bundled Mongo service so the
# dev server can start out of the box.
set -euo pipefail

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
