# Environments: development vs production

Two things are environment-scoped and must not be shared between a
dev/preview deployment and asyncgames.com: the **Clerk instance** and the
**MongoDB database**. They are coupled — Clerk owns identity and Mongo only
stores Clerk `userId`s — so splitting one without the other leaves rows
pointing at users that don't exist.

## Why the database has to split with Clerk

A Clerk production instance is a *separate instance with its own user store*.
User data can't be transferred between instances, and a re-created user gets a
new `user_…` ID. Everything in Mongo is keyed on those IDs —
`GameData.userIdList` / `currentTurn` / `winner` / `forfeitedBy` /
`missedTurnCounts` keys / `gameState.turnOrder` / the `senderId` on every
command in `gameState.commandHistory`, plus `Invitation.senderId` and its
invitee `userId`s, `Friendship.requesterId` / `recipientId`,
`GameResult.playerIds`, and `Reaction.actorId` / `recipientId`.

Point two Clerk instances at one database and:

- `userIdListToUsernameList` (`src/utils/users/clerk.ts`) shows "Unknown
  player" for users the current instance doesn't know, rather than skipping
  them — so a game with a cross-instance player shows a placeholder name in
  that seat instead of a real one.
- `/api/users` only lists current-instance users, so old games reference people
  the invite picker can't show.
- `/api/cron/turntimer` sweeps **every** unfinished game in the database whose
  turn timer has anything to say about it, whichever instance created it. The
  nightly production run will expire, force-forfeit (`endReason: "abandoned"`)
  and record results for games created against the dev instance.
- `npm run dev` locally takes turns in live games.

## The split

| Variable | Production | Preview / local |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | `pk_live_…` / `sk_live_…` | `pk_test_…` / `sk_test_…` |
| `MONGODB_URI` | `…mongodb.net/asyncgames` | `…mongodb.net/asyncgames-dev` |
| `CRON_SECRET` | its own secret | a different secret |
| `APP_URL` | `https://asyncgames.com` | the preview or `localhost` origin |
| Firebase Admin (`FIREBASE_*`) | one project is fine on both sides — device tokens live in Clerk private metadata, so they partition with the instance |
| `ANDROID_APP_FINGERPRINT` | the release keystore's SHA-256, so Android opens `asyncgames.com` links in the app | unset, unless you're verifying a debug-signed APK against a preview — then that keystore's SHA-256 |

Nothing in `src/` is instance- or database-aware. `dbConnect()`
(`src/utils/mongodb/mongodb.ts`) hands `MONGODB_URI` straight to
`mongoose.connect` with no `dbName` override, so the database name is just the
path in the URI: a second database on the same free Atlas cluster is enough, no
second cluster needed.

One consequence worth knowing: the `vercel.json` crons only fire on the
production deployment, so nothing sweeps the dev database. Turn timers don't
expire in dev unless you call the endpoint yourself:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/turntimer
```

## Dev-only tooling

The Settings footer carries two buttons that wipe collections outright
(`DevTools`, calling `/api/dev/clearlive` and `/api/dev/clearresults`). Both
sides are gated on `isDevDeployment` (`src/utils/devEnvironment.ts`): the
buttons don't render, and the endpoints answer 404 as though they were never
deployed, on anything that isn't a dev deployment.

"Dev deployment" means `VERCEL_ENV` (mirrored to the browser as
`NEXT_PUBLIC_VERCEL_ENV`, which Vercel injects for you) is `preview` or
`development` — so Vercel's dev/preview deployments qualify and asyncgames.com
does not. Off Vercel it falls back to `NODE_ENV`, so `npm run dev` counts and
a local production build doesn't. Anywhere the environment can't be
identified the tooling stays off.

They still have no authentication of their own, so treat any dev deployment's
database as wipeable by anyone who can reach it.

## End-to-end tests (Playwright)

CI's E2E job (`.github/workflows/e2e.yml`) runs against a *third* database,
`…mongodb.net/asyncgames-e2e` — same free Atlas cluster as above, just another
path segment — rather than `asyncgames-dev`, so a CI run's `/api/dev/clearlive`
+ `/api/dev/clearresults` calls (`e2e/specs/*.spec.ts`) can't wipe out anyone's
manual dev testing. It reuses the dev Clerk instance's `pk_test_`/`sk_test_`
keys; Mongo doesn't need to be 1:1 with a Clerk instance, only Clerk user IDs
need to resolve, and this database only ever holds rows this Clerk instance
created.

Two standing password-auth users live in the dev Clerk instance for this
(email verification is off there, so no inbox is needed) —
`e2e/auth.setup.ts` signs them in once per run via
[Clerk Testing Tokens](https://clerk.com/docs/testing/overview)
(`@clerk/testing/playwright`), unlocks them through `/api/unlock` (the same
invite-gate a real signup goes through — see `ACCESS_PASSWORD` below and
`useAuthGuard`/`/unlockaccess`), and saves their session, so specs start
already authenticated *and* past the gate. Provision the two users by hand in
the Clerk dashboard and set:

| Secret | |
|---|---|
| `E2E_MONGODB_URI` | the `asyncgames-e2e` connection string |
| `ACCESS_PASSWORD` | same value as the dev deployment's — only needed if that deployment has the gate configured at all |
| `E2E_PLAYER_ONE_EMAIL` / `E2E_PLAYER_ONE_PASSWORD` | first test user |
| `E2E_PLAYER_TWO_EMAIL` / `E2E_PLAYER_TWO_PASSWORD` | second test user |
| `E2E_PLAYER_TWO_USERNAME` | second test user's Clerk *username* — the multiplayer spec (`e2e/specs/snakesandladders-turns.spec.ts`) invites them by username, since that's how invites are actually resolved (`usersByUsername`), not by email |

`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, the `FIREBASE_*` vars
and `CRON_SECRET` are the same secrets `ci.yml`'s build step already uses.

## Taking Clerk to production

The free plan covers this — 50,000 monthly retained users, custom domain
included. Pro only removes the "Secured by Clerk" footer on `/login` and
`/signup` and adds allowlist/blocklist and a configurable session duration.

1. **Create the production instance** — the environment switcher in the Clerk
   dashboard, or `npx clerk deploy`, which clones the development configuration
   and walks DNS and OAuth (`clerk deploy status` reports what's still missing).
2. **Add the domain** and create the CNAMEs it prints at the DNS provider:
   `clerk` (frontend API), `accounts` (account portal), `clkmail` (email
   return-path) and two DKIM records. Propagation is usually minutes but can
   take up to 24–48h. A DMARC record is worth adding while you're there.
3. **Production OAuth credentials** for every enabled social connection (a
   Google Cloud OAuth client, an Apple `.p8`). Development instances use Clerk's
   shared credentials, which don't work in production.
4. **Keys** — `pk_live_…` / `sk_live_…` into Vercel's **Production**
   environment only, leaving the test keys on Preview and Development. These are
   injected by the Clerk Vercel integration; check the Production environment
   really shows `pk_live_` rather than assuming.
5. **Point Production's `MONGODB_URI` at a new, empty database** and keep the
   existing one as the dev database.
6. **Redeploy and verify**: sign-in works, no development badge on the Clerk
   components, and the verification email arrives from `asyncgames.com`.

Step 5 is what keeps the cut-over consistent. The production instance starts
with no users, so a clean production database means no rows referencing dev IDs
and no migration to write. Everyone signs up again; `publicMetadata.unlocked`
resets, so each user re-enters `ACCESS_PASSWORD` once at `/unlockaccess`; device
push tokens re-register on next load via `/api/notificationtoken`.

Carrying existing games across is possible but not cheap: export the users
(dashboard CSV, hashed passwords included), re-create them in production with
[`clerk/migration-script`](https://github.com/clerk/migration-script), then
remap old → new IDs across every field listed at the top of this doc — including
the per-game `gameState`, where games embed player IDs in their own shapes.
Worth it only when there's history worth keeping.

## Reference

- [Instances and environments](https://clerk.com/docs/guides/development/managing-environments)
- [Deploy your Clerk app to production](https://clerk.com/docs/guides/development/deployment/production)
- [Migrating your data](https://clerk.com/docs/guides/development/migrating/overview)
- [Clerk pricing](https://clerk.com/pricing)
