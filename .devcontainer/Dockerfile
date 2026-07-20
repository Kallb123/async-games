# Dev container image for Async Games (Next.js 16 / React 19 / TypeScript).
#
# Node 20 matches the version used in CI (.github/workflows/ci.yml) so that
# `npm ci`, `npx tsc --noEmit`, `npm test`, and `npx next build` behave the
# same locally as they do on the pipeline.
ARG NODE_VERSION=20
FROM mcr.microsoft.com/devcontainers/javascript-node:${NODE_VERSION}

# The base image ships with a non-root `node` user, git, curl, and the common
# build tooling. Add the MongoDB shell so contributors can inspect the local
# database that the Compose stack provisions, and pin a recent npm.
RUN set -eux; \
    curl -fsSL https://pgp.mongodb.com/server-7.0.asc \
        | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor; \
    echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/debian bookworm/mongodb-org/7.0 main" \
        > /etc/apt/sources.list.d/mongodb-org-7.0.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends mongodb-mongosh; \
    apt-get clean; \
    rm -rf /var/lib/apt/lists/*; \
    npm install -g npm@latest

# Next.js dev server.
EXPOSE 3000
