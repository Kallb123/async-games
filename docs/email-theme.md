# Email theme — styling Clerk's emails like the app

Everything Clerk renders **inside the app** is already themed: the sign-in and
sign-up cards read the `--ag-*` tokens through
[`src/utils/ui/clerkAppearance.ts`](../src/utils/ui/clerkAppearance.ts), which
is passed to `<ClerkProvider>` once in the root layout.

Clerk's **emails** are the one surface that theme can't reach. They're rendered
by Clerk's servers and delivered to Gmail/Outlook/Apple Mail, with no access to
`ag-theme.css`, no CSS custom properties, and no Bricolage Grotesque webfont.
So the design system has to be restated in a form the email editor understands:
literal hex colours, set as attributes.

**This document is that restatement** — the spec to hand to anyone writing an
Async Games email. Values here are derived from `src/app/ag-theme.css`; if a
token changes there, change it here too.

---

## 1. Where it gets applied

Clerk email templates live in the **Clerk Dashboard → Customization → Emails**,
not in this repo. Three things to know before you start:

- **Templates are per-instance.** Production and preview/local use *separate
  Clerk instances* (see [`docs/environments.md`](./environments.md)). Styling a
  template in the dev instance does **not** carry to asyncgames.com. Do the work
  in one instance, then repeat it in the other — or accept that dev keeps
  Clerk's stock look and only style production.
- **The subject line is in the template**, as `<re-title>` inside `<re-head>`.
- **Variables are [Handlebars][handlebars]**: `{{otp_code}}`, `{{app.name}}`,
  `{{requested_from}}`, `{{requested_at}}`, `{{current_year}}`, and the partial
  `{{> app_logo}}` (which renders the logo uploaded in Clerk's branding
  settings). Double braces escape HTML; use triple braces (`{{{app.name}}}`)
  where a value could contain `&`. The editor's variable picker is the
  authority on what a given template exposes.

Also worth setting in the same Customization area: the **logo** (upload
`public/icons/icon-512.png` — that's what `{{> app_logo}}` renders, and it also
covers Clerk's hosted pages) and the **from name** (`Async Games`).

[handlebars]: https://handlebarsjs.com/

---

## 2. The editor's markup: `re-*`

Clerk's editor is [Revolvapp][revolvapp], which uses its own simplified element
set — `re-body`, `re-block`, `re-text`, `re-heading`, `re-button`, `re-image`,
`re-divider` — and transpiles it to the table-based HTML email clients need.
**You don't hand-write tables; you set attributes.** Styles are attributes on
the element, not a `style` string:

```html
<re-text font-size="14px" color="#735e56" margin="16px 0px 0px 0px">Copy goes here.</re-text>
```

Inline HTML still works *inside* a text element for emphasis (`<b>`, `<a>`) —
Clerk's own default templates rely on that.

What still constrains the design, editor or no editor:

| Constraint | Consequence |
|---|---|
| No CSS custom properties, no `oklch()` | Every colour is a literal hex from §3 |
| Webfonts don't load in Gmail, Outlook, most Android | Design must hold up in Arial (§4) |
| `border-radius` is ignored by Outlook's Word engine | Corners degrade to square; don't build meaning on them |
| Images are blocked by default in Outlook and often Gmail | Never let the mark be the only thing identifying the sender |
| Clients force dark mode by inverting | Set a background *and* a colour on anything that carries text |

One more, specific to this editor: **it owns the output.** Attributes it
doesn't recognise may be dropped when the template is saved and transpiled. The
recipes below flag the few that aren't confirmed by Clerk's own default
templates, and every one of them degrades to something that still looks right.

[revolvapp]: https://imperavi.com/revolvapp/

---

## 3. Palette

The `--ag-*` tokens in `ag-theme.css` are authored in `oklch()`. These are their
sRGB hex equivalents — the same conversion `scripts/generate-icons.mjs` already
keeps in its `COLOURS` map for the icon rasteriser, so the two agree.

| Token | Hex | Use in email | Replaces (Clerk default) |
|---|---|---|---|
| `--ag-bg` | `#f6e8de` | `re-body` background — the cream field | `#fff` |
| `--ag-surface` | `#fffdf9` | Card (`re-main` / `re-block`) background | `#ffffff` |
| `--ag-surface-2` | `#efe2d8` | Code slab, quiet fills | — |
| `--ag-ink` / `--ag-dark` | `#3a221a` | Headings, codes, emphasis | `#111827` |
| `--ag-ink-soft` | `#735e56` | Body and sub-copy | `#747686` |
| `--ag-ink-softer` | `#8b756d` | Fine print, footer | `#747686` |
| `--ag-line` | `#ddcabb` | Card border, `re-divider` | `#B7B8C2` |
| `--ag-terracotta` | `#b74b21` | Button fill, links | — |
| `--ag-on-dark` | `#f7f0eb` | Text on terracotta or brown fills | — |
| `--ag-green` | `#4d9351` | Success ("your password was changed") | — |
| `--ag-gold` | `#b18827` | Warning / attention | — |
| `--ag-danger` | `#c0392b` | Destructive / security alerts | — |

Never introduce a colour that isn't in this table. If an email needs one, add
the token to `ag-theme.css` first and mirror it here.

---

## 4. Type

The app is set in **Bricolage Grotesque** at chunky weights. It won't load in
most inboxes, so the design has to hold up in Arial — which it does, because
what carries the brand here is *weight and size contrast*, not the letterforms.

Set the stack once on `re-body` if the editor keeps it, and don't chase it
further; Apple Mail will use Bricolage where it's installed locally, everyone
else falls back:

```
font-family="'Bricolage Grotesque', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
```

Don't add a Google Fonts `@import` — it's stripped or ignored in the clients
that matter and gives a false sense of the result.

Scale, mapped from the app's classes:

| Role | App class | Email attributes |
|---|---|---|
| Heading | `.ag-hero-title` | `font-size="24px" font-weight="800" line-height="32px" color="#3a221a"` |
| Lead / sub-copy | `.ag-hero-sub` | `font-size="15px" line-height="22px" color="#735e56"` |
| Body copy | — | `font-size="15px" line-height="24px" color="#3a221a"` |
| One-time code | — | `font-size="36px" font-weight="800" color="#3a221a"` |
| Button label | `.ag-btn` | `font-size="15px" font-weight="800"` |
| Fine print / footer | `.ag-footer` | `font-size="13px" line-height="20px" color="#8b756d"` |

Body copy is a notch larger in email than on screen (15px vs 14px) — inbox
reading distance is longer and there's no app chrome for scale.

---

## 5. Components

Recipes in the editor's markup. Together they compose §7.

### 5.1 Shell

```html
<re-body background-color="#f6e8de" padding="24px 12px 32px 12px">
```

Cream field, tighter padding than Clerk's default `48px 32px` — the app is
mobile-first and the card should own the width.

### 5.2 Header lockup (mark + wordmark)

The email equivalent of [`Brand`](../src/components/ui/Brand.tsx): the mark
beside the name, not the mark alone.

```html
<re-header padding="8px 8px 16px 8px">
    <re-image src="https://asyncgames.com/icons/icon-192.png" width="34" alt=""></re-image>
    <re-text font-size="22px" font-weight="800" color="#3a221a" margin="8px 0px 0px 0px">Async Games</re-text>
</re-header>
```

PNG, not the SVG `Brand` uses on screen (SVG is blocked or blank nearly
everywhere), and an absolute URL — relative paths don't exist in an inbox. The
wordmark is live text so the sender is still identified when images are blocked;
`alt=""` avoids repeating the name that's already sitting next to it.

The mark sits above the wordmark here rather than beside it, because
`re-header` stacks its children. If you want `Brand`'s side-by-side lockup, put
both inside one text element — inline HTML works there:
`<re-text ...><img src="…/icon-192.png" width="34" align="left" style="margin-right:12px">Async Games</re-text>`.
Check it survives a save before relying on it.

`{{> app_logo}}` is the alternative — it renders whatever is uploaded in Clerk's
branding settings, and stays in sync if that changes. It gives you the mark
without the wordmark, so prefer the lockup above unless you'd rather the
dashboard own the logo.

### 5.3 Card

```html
<re-main background-color="#fffdf9" border-radius="18px">
    <re-block background-color="#fffdf9" border="1.5px solid #ddcabb" border-radius="18px" padding="26px 22px 26px 22px" align="left">
        <!-- heading, copy, CTA -->
    </re-block>
</re-main>
```

`border` isn't used by Clerk's stock templates, so it may not survive the
editor. If it doesn't, the card still reads: `#fffdf9` on `#f6e8de` is a visible
step on its own, which is exactly how `.ag-card` works on screen.

### 5.4 Button

```html
<re-button href="{{action_url}}" background-color="#b74b21" color="#f7f0eb" border-radius="14px" font-size="15px" font-weight="800" padding="14px 24px 14px 24px">Sign in</re-button>
```

`.ag-btn--primary` in email form. Always follow a button with the raw URL in
fine print — some clients mangle long links, and some readers won't click a
styled button:

```html
<re-text margin="14px 0px 0px 0px" font-size="13px" color="#8b756d">Or paste this into your browser: {{action_url}}</re-text>
```

### 5.5 Code slab

The one piece with no on-screen equivalent. Clerk's default sets the digits
naked at 40px; giving them `.ag-empty`'s quiet slab makes them read as something
to copy rather than as a headline.

```html
<re-text background-color="#efe2d8" border-radius="16px" padding="18px 12px 18px 12px" align="center" font-size="36px" font-weight="800" color="#3a221a" margin="20px 0px 0px 0px"><b>{{otp_code}}</b></re-text>
```

`background-color`/`padding` on a text element aren't in Clerk's defaults — if
the editor drops them you're back to bare digits at the right size and colour,
which is still on-theme. To track the digits apart, wrap them:
`<b style="letter-spacing:0.18em">{{otp_code}}</b>` (inline styles inside a text
element are the same mechanism `<b>` uses, but this one is optional garnish).

### 5.6 Divider & footer

```html
<re-footer padding="24px 12px 0px 12px">
    <re-divider background-color="#ddcabb" height="1px"></re-divider>
    <re-text margin="16px 0px 0px 0px" font-size="13px" color="#8b756d">© {{current_year}} {{app.name}}</re-text>
</re-footer>
```

Add the app's `Privacy · Terms` pair — the same two pages
[`clerkAppearance`](../src/utils/ui/clerkAppearance.ts) points the auth cards at
— if you want the email footer to match `.ag-footer` on screen:

```html
<re-text margin="6px 0px 0px 0px" font-size="13px" color="#8b756d"><a href="https://asyncgames.com/privacy" style="color:#735e56;">Privacy</a> · <a href="https://asyncgames.com/terms" style="color:#735e56;">Terms</a></re-text>
```

---

## 6. Per-template notes

Copy the shell, swap the card contents. Which templates exist depends on the
sign-in methods enabled on the instance — the dashboard's list is the authority.

| Template | `re-title` (subject) | Card contents | Variables |
|---|---|---|---|
| Verification code | `{{otp_code}} is your {{app.name}} code` | Heading, one line of lead, code slab, security note | `{{otp_code}}`, `{{requested_from}}`, `{{requested_at}}` |
| Magic link | `Your turn awaits — sign in to {{app.name}}` | Heading, lead, button + raw link, expiry note | `{{action_url}}` / `{{magic_link}}` |
| Reset password code | `Reset your {{app.name}} password` | Heading, code slab, "didn't ask for this?" note | `{{otp_code}}` |
| Password changed / removed | `Your {{app.name}} password was changed` | Heading, one confirming line, no CTA — a notice, not an action | `{{user.first_name}}` |
| Primary email changed | `Your {{app.name}} email was updated` | Same shape as above | — |
| Invitation | `You're invited to {{app.name}}` | Heading, who invited them, button to accept | `{{action_url}}` |

Copy voice: the app's own — short, warm, second person, no exclamation marks.
The sign-in screen says *"Your turn awaits. Sign in to pick up your games."*
Emails should sound like that, not like a bank. Keep Clerk's
`{{requested_from}}` / `{{requested_at}}` security line as it is, though: it's
doing a real job, and it's the one place plainness beats warmth.

---

## 7. Worked example — verification code

Clerk's stock verification-code template, themed. Paste over the existing one.

```html
<re-html>
<re-head>
    <re-title>{{otp_code}} is your {{app.name}} code</re-title>
</re-head>
<re-body background-color="#f6e8de" padding="24px 12px 32px 12px" font-family="'Bricolage Grotesque', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif">
    <re-preheader>Your {{app.name}} code — it expires shortly.</re-preheader>
    <re-header padding="8px 8px 16px 8px">
        <re-image src="https://asyncgames.com/icons/icon-192.png" width="34" alt=""></re-image>
        <re-text font-size="22px" font-weight="800" color="#3a221a" margin="8px 0px 0px 0px">Async Games</re-text>
    </re-header>
    <re-main background-color="#fffdf9" border-radius="18px">
        <re-block background-color="#fffdf9" border="1.5px solid #ddcabb" border-radius="18px" padding="26px 22px 26px 22px" align="left">
            <re-heading level="h1" margin="0" align="left" color="#3a221a" font-size="24px" line-height="32px" font-weight="800">
                Your code
            </re-heading>
            <re-text margin="8px 0px 0px 0px" align="left" font-size="15px" line-height="22px" color="#735e56">
                Enter this to finish signing in to {{app.name}}.
            </re-text>
            <re-text background-color="#efe2d8" border-radius="16px" padding="18px 12px 18px 12px" align="center" font-size="36px" font-weight="800" color="#3a221a" margin="20px 0px 0px 0px">
                <b>{{otp_code}}</b>
            </re-text>
            <re-text margin="16px 0px 0px 0px" font-size="13px" line-height="20px" color="#8b756d">
                To keep your account yours, don't share this code with anyone.
            </re-text>
            <re-text margin="32px 0px 0px 0px" font-size="13px" color="#735e56">
                <b>Didn't request this?</b>
            </re-text>
            <re-text margin="4px 0px 0px 0px" font-size="13px" line-height="20px" color="#8b756d">
                This code was requested from <b>{{requested_from}}</b> at <b>{{requested_at}}</b>. If it wasn't you, you can safely ignore this email — nothing will change.
            </re-text>
        </re-block>
    </re-main>
    <re-footer padding="24px 12px 0px 12px">
        <re-divider background-color="#ddcabb" height="1px"></re-divider>
        <re-text margin="16px 0px 0px 0px" font-size="13px" color="#8b756d">
            © {{current_year}} {{app.name}}
        </re-text>
        <re-text margin="6px 0px 0px 0px" font-size="13px" color="#8b756d">
            <a href="https://asyncgames.com/privacy" style="color:#735e56;">Privacy</a> · <a href="https://asyncgames.com/terms" style="color:#735e56;">Terms</a>
        </re-text>
    </re-footer>
</re-body>
</re-html>
```

What changed from the stock template, and why:

- **Colours** — `#fff` → `#f6e8de` field, `#ffffff` → `#fffdf9` card, `#111827`
  → `#3a221a` ink, `#747686` → `#735e56` / `#8b756d`, `#B7B8C2` → `#ddcabb`.
- **The card is a card** — border and 18px radius, so it sits on the cream field
  the way `.ag-card` does, instead of white-on-white.
- **Weights** — 800 on the heading and the code; the app's type is chunky, and
  weight is the part of it that survives the fallback font.
- **The code got a slab** and dropped from 40px to 36px — it reads as something
  to copy rather than as the headline.
- **Padding** — `48px 32px` → `24px 12px`, mobile-first like the app.
- **Copy** — the app's voice for the two lines that carry no security weight;
  Clerk's `requested_from` / `requested_at` line kept intact.
- **Logo** — the `Brand` lockup (mark + wordmark) in place of `{{> app_logo}}`.

---

## 8. Before you save

- [ ] Every colour is a hex from §3 — no `oklch()`, no `var(--ag-*)`.
- [ ] The logo is a PNG at an absolute `https://asyncgames.com/…` URL, and the
      name also appears as text.
- [ ] Buttons repeat their URL as text underneath.
- [ ] There's a `re-preheader`, and a "didn't request this" line.
- [ ] Save, then re-open the template — check the editor kept `border`,
      and the slab's `background-color`/`padding`. If it dropped them, the
      design still works; don't fight it.
- [ ] Send yourself a test and open it in Gmail (web + Android), Apple Mail and
      Outlook. Check it with images blocked, and in forced dark mode.
- [ ] Repeat in the other Clerk instance, or note that it's production-only.

---

## Appendix — writing an email outside Clerk

If a future transactional email is sent by us rather than by Clerk (a turn
reminder, a digest), there's no Revolvapp to transpile for you: hand-written
email HTML means tables and inline styles, no flexbox, no `<style>` block worth
relying on. The same palette and type scale apply; the shell looks like this,
480px wide to match `--ag-app-width` and the `.ag-app` column:

```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6e8de;margin:0;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:480px;max-width:100%;">
      <tr><td style="background:#fffdf9;border:1.5px solid #ddcabb;border-radius:18px;padding:26px 22px;">
        <h1 style="margin:0;font-family:'Bricolage Grotesque',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:26px;font-weight:800;line-height:1.1;letter-spacing:-0.02em;color:#3a221a;">Your turn</h1>
      </td></tr>
    </table>
  </td></tr>
</table>
```

Buttons need the bulletproof pattern — fill on the `<td>` (Outlook ignores the
anchor's padding and radius), padding and label on the `<a>`:

```html
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
  <tr><td align="center" bgcolor="#b74b21" style="border-radius:14px;">
    <a href="https://asyncgames.com" style="display:inline-block;padding:14px 24px;font-family:'Bricolage Grotesque',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;line-height:1.1;color:#f7f0eb;text-decoration:none;border-radius:14px;">Take your turn</a>
  </td></tr>
</table>
```

## Related

- [`src/app/ag-theme.css`](../src/app/ag-theme.css) — the tokens these hex
  values come from. **Source of truth**; if it changes, §3 and §4 change.
- [`src/utils/ui/clerkAppearance.ts`](../src/utils/ui/clerkAppearance.ts) — the
  same design system handed to Clerk's *in-app* components.
- [`scripts/generate-icons.mjs`](../scripts/generate-icons.mjs) — draws the mark
  and writes `public/icons/icon-192.png`, the logo these emails link to.
- [`docs/environments.md`](./environments.md) — why there are two Clerk
  instances and what else is split between them.
