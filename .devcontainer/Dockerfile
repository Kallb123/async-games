# Dev container image for Async Games (Next.js 16 / React 19 / TypeScript).
#
# Node 22 matches the version used in CI (.github/workflows/ci.yml) so that
# `npm ci`, `npx tsc --noEmit`, `npm test`, and `npx next build` behave the
# same locally as they do on the pipeline.
# Pinned to the bookworm variant (rather than the floating default tag, which
# now resolves to a trixie base): the MongoDB apt repo below is configured for
# bookworm and its Release file is signed with a SHA-1 digest, which trixie's
# stricter apt/gpg policy refuses to verify.
ARG NODE_VERSION=22-bookworm
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


# Pre-create these dirs owned by vscode so that when Docker initializes a fresh
# named volume over .claude (login persistence), it copies vscode ownership onto
# the volume root — otherwise the volume defaults to root:root and the non-root
# vscode user can't write credentials, breaking login.
RUN mkdir -p /home/node/.claude \
 && chown -R node:node /home/node/.claude

# Install the app's dependencies at build time so they are baked into the
# image. Only the manifest + lockfile are copied first, so this layer is cached
# and only re-runs when dependencies change. At runtime a named volume is
# mounted over node_modules (see docker-compose.yml); Docker seeds that empty
# volume from the image's node_modules on first create, so these installed
# packages are what the container uses.
WORKDIR /workspaces/async-games
COPY --chown=node:node package.json package-lock.json ./
# WORKDIR above runs as root, so the directory itself is root-owned even
# though --chown fixed the copied files; without this chown, npm ci (run as
# node below) fails with EACCES trying to mkdir node_modules inside it.
RUN chown node:node /workspaces/async-games
USER node
RUN npm ci

# Next.js dev server.
EXPOSE 3000
