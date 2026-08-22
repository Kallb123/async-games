# Profile pictures

How a player's picture gets from wherever it lives to the avatar on screen,
what's implemented today, and how the next steps slot in without a rewrite.

---

## 1. Where we are

**Step 1 — SSO pictures.** Signing up with Google/GitHub/etc. hands Clerk an
avatar for that user, and Clerk hosts it at `img.clerk.com`. Step 1 was simply
to *show* it — no new store, no upload UI, no migration.

**Step 2 — uploads.** A player can now set their own picture from `/profile`
(§1b). Clerk hosts that one at `img.clerk.com` too, so it arrives on screen
through exactly the same path as an SSO one.

The rule for "does this user have a picture" lives in one place:

```ts
// src/utils/ui/avatar.ts
profileImageUrl(user)   // → string | null
```

It returns `imageUrl` only when Clerk's `hasImage` is true. That check matters:
Clerk always returns an `imageUrl`, but for a user who has never set a picture
it's a *generated placeholder*, and our own deterministic initials badge is a
better default than Clerk's. The helper is pure and takes the shape shared by
Clerk's server `User` and client `UserResource`, so API routes and client
screens apply the same rule.

`Avatar` (`src/components/ui/Avatar.tsx`) takes an optional `imageUrl` and
renders it via `next/image`, falling back to the existing initials badge when
it's absent **or fails to load**. Every avatar in the app is already an
`Avatar`, so nothing else had to learn about pictures.

`next.config.mjs` allow-lists `img.clerk.com` for the image optimiser. An
unexpected host fails the optimiser, `onError` fires, and the badge shows — a
degraded avatar, never a broken one.

### 1a. What carries the picture over the wire

Clerk is the source of truth; the client never calls Clerk for other people.
Each DTO that already carried a person's name now carries their picture too:

| Endpoint | Field |
|---|---|
| `GET /api/friends` | `IFriendUser.imageUrl` |
| `GET /api/profile/[userId]` | `IProfileUser.imageUrl` |
| `GET /api/user/incominginvites`, `/outgoinginvites` | `IInvitationResponse.senderImageUrl` |
| `GET /api/reactions` | `IReceivedReaction.actorImageUrl` |

Routes that already fetched the Clerk user add one field; `/api/reactions` uses
`userIdListToImageMap` (`src/utils/users/clerk.ts`) to look up its actors.

Screens showing pictures: the dashboard top bar and its invite list, your
profile (identity, friends, requests, reactions), a friend's profile, and the
"who's playing" invite picker.

### 1b. Uploading your own

Your avatar on `/profile` *is* the control: tapping it (it carries a camera
badge to say so) opens the file picker. A "Remove photo" link appears under
your name once you have one — that's the only case the avatar tap doesn't
already cover.

`useProfilePicture` (`src/utils/hooks/useProfilePicture.tsx`) is the whole
flow: it owns the hidden file input (which it hands back as `fileInput` for
the screen to place), guards type and size before uploading, calls
`user.setProfileImage({ file })` on the signed-in Clerk user — `{ file: null }`
removes — then reloads the user so every avatar on screen re-renders from the
new `imageUrl`. It reports through the usual toasts.

There is no upload endpoint, no bucket and no new DTO field: Clerk stores the
image, `hasImage` flips true, and `profileImageUrl` starts returning it for
that player everywhere — including in the API payloads other people's screens
read (§1a). `ProfileIdentity` takes the editing props (`onAvatarClick`,
`avatarBusy`, `action`) only from your own profile, so a friend's header stays
a plain badge.

---

## 2. Next steps

The shape above is deliberately the seam for everything below: **one resolver
that answers "what picture does this user have", one `imageUrl` field per DTO,
one `Avatar`**. Each step changes the resolver, not the screens.

### 2a. Choose from our own pictures

A curated set of app-drawn avatars (`/public/avatars/*.png`, catalogued the way
`src/utils/ui/games.ts` catalogues game art) that a player can pick instead of
a photo. This is the first step that needs a *stored choice*, because the pick
isn't Clerk's to hold:

- Store the chosen key on the `UserProfile` read model
  (`docs/social-features.md` §5) — e.g. `avatarKey: string | null`.
- Turn `profileImageUrl` into the resolver's Clerk *branch*, and add a server
  resolver that reads `UserProfile` first: **chosen art → Clerk picture →
  initials badge**. Routes call the resolver instead of `profileImageUrl`
  directly; the DTO field and every screen stay as they are.
- Because it's our own art, `Avatar` can keep using `next/image` with a local
  path — no host allow-listing, no remote fetch.

### 2b. Pictures earned through achievements

Same storage and same resolver as §2a — the only addition is *eligibility*:
each curated avatar gains an unlock condition, and the picker shows locked ones
greyed with the requirement ("win 10 games of Dice Cities"). That leans on the
`GameResult` / `UserProfile` aggregates that already exist for stats, so the
work is the unlock catalogue plus a check at selection time (validated
server-side on save, not just hidden in the UI).

Sequencing note: do §2a before §2b. Achievements are a reason to pick from a
set that has to exist first, and the picker is the same screen either way.

### 2c. Cross-cutting: moderation & privacy

Now that uploads are live (§1b), a profile picture is user-generated content
and this is the open question, not a future one: **what is the report/remove
path?** Today an admin can clear a picture through Clerk, but nothing in the
app surfaces a bad one.

Worth deciding alongside it: who sees a picture. `/api/profile/[userId]` gates
a profile behind an accepted friendship, but the invite lists and the reactions
feed show a picture to anyone you're mid-game with — the same reach usernames
have always had. That's defensible; it should just be a decision rather than an
accident.
