# Dev Container

A ready-to-use development environment for Async Games. It provisions Node 22
(matching CI) and a local MongoDB instance so you can develop and test the whole
repo without installing anything on your host.

## What's inside

| Piece | Purpose |
|---|---|
| `Dockerfile` | Node 22 base image (`mcr.microsoft.com/devcontainers/javascript-node`) + `mongosh`; installs the app's dependencies (`npm ci`) at build time. |
| `docker-compose.yml` | Two services: `app` (your workspace) and `mongo` (MongoDB 7). |
| `devcontainer.json` | Wires the workspace to the `app` service, forwards port 3000, installs the GitHub CLI feature, and configures VS Code. |
| `post-create.sh` | Scaffolds `.env.local` on first create. |

## Getting started

**VS Code / Cursor:** install the *Dev Containers* extension, open the repo, and
choose **Reopen in Container**. First build runs `post-create.sh` automatically.

**Dev Containers CLI:**

```bash
npm i -g @devcontainers/cli
devcontainer up --workspace-folder .
devcontainer exec --workspace-folder . npm run dev
```

## Environment variables

Dependencies are installed in the image, so the container is ready as soon as it
builds. `post-create.sh` then copies `.env.example` to `.env.local` and sets
`MONGODB_URI` to the bundled Mongo service (`mongodb://mongo:27017/async-games`).
Everything else
talks to **external** services you must supply keys for:

- **Clerk** — `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- **Firebase Admin** — `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
- `CRON_SECRET`, and optional `ACCESS_PASSWORD`

Type-checking and the Vitest suite run without any of these; the dev server and a
production `build` need at least the Clerk keys.

## Common commands

```bash
npm run dev        # Next.js dev server → http://localhost:3000 (forwarded)
npm test           # Vitest suite
npx tsc --noEmit   # type-check
npm run build      # production build (needs Clerk/Firebase env vars)
```

## MongoDB

Mongo listens on the internal Compose network as host `mongo`. Data persists in
the `mongo-data` volume across rebuilds. To reach it from host tools, uncomment
the `ports` mapping for the `mongo` service in `docker-compose.yml`. Inside the
container you can inspect it with:

```bash
mongosh mongodb://mongo:27017/async-games
```
