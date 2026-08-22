# Email theme — styling Clerk's emails like the app

Everything Clerk renders **inside the app** is already themed: the sign-in and
sign-up cards read the `--ag-*` tokens through
[`src/utils/ui/clerkAppearance.ts`](../src/utils/ui/clerkAppearance.ts), which
is passed to `<ClerkProvider>` once in the root layout.

Clerk's **emails** are the one surface that theme can't reach. They're rendered
by Clerk's servers, delivered to Gmail/Outlook/Apple Mail, and have no access to
`ag-theme.css`, no CSS custom properties, and no Bricolage Grotesque webfont.
So the design system has to be restated in a form email clients understand:
hex colours, inline styles, and tables.

**This document is that restatement.** It is the spec to hand to anyone (or
anything) writing an Async Games email — Clerk's template editor, a future
transactional email, a designer. Values here are derived from
`src/app/ag-theme.css`; if a token changes there, change it here too.

---

## 1. Where it gets applied

Clerk email templates live in the **Clerk Dashboard → Customization → Emails**,
not in this repo. Open a template, use the editor's HTML/source view, and paste
the markup built from §5.

Three things to know before you start:

- **Templates are per-instance.** Production and preview/local use *separate
  Clerk instances* (see [`docs/environments.md`](./environments.md)). Styling a
  template in the dev instance does **not** carry to asyncgames.com. Do the work
  in one instance, then repeat it in the other — or accept that dev keeps
  Clerk's stock look and only style production.
- **The editor is a WYSIWYG** ([Revolvapp][revolvapp]) that transpiles blocks to
  table-based HTML. Pasting hand-written HTML into the source view works, but
  the editor may normalise it, and anything in `<head>` (a `<style>` block, a
  Google Fonts `@import`, `<meta name="color-scheme">`) may not survive. Design
  so that nothing important depends on it — every style below is inline for
  that reason.
- **Variables are [Handlebars][handlebars]**: `{{app.name}}`, `{{otp_code}}`,
  and so on. Double braces escape HTML; use triple braces (`{{{app.name}}}`)
  where a value contains characters like `&`. The editor's variable picker is
  the authority on which variables a given template exposes — the ones in §6
  are the usual set, but check the picker rather than trusting this list.

Also set, in the same Customization area: the **logo** (upload
`public/icons/icon-512.png`, so Clerk's own default templates and hosted pages
get the mark too), the **from name** (`Async Games`), and per-template
**subject lines** (§6).

[revolvapp]: https://imperavi.com/revolvapp/
[handlebars]: https://handlebarsjs.com/

---

## 2. What email HTML can't do

The rules that shape everything below. None of these are negotiable in Gmail or
Outlook:

| Not available | Use instead |
|---|---|
| CSS custom properties (`var(--ag-terracotta)`) | The literal hex from §3 |
| `oklch()` colours | The literal hex from §3 |
| External stylesheets, `<style>` blocks (unreliable) | Inline `style="…"` on every element |
| Flexbox / grid | `<table role="presentation">` rows and cells |
| Webfonts (Gmail, Outlook, most Android) | The fallback stack in §4 — assume Arial |
| SVG images (blocked or blank nearly everywhere) | PNG (`icon-192.png`) at an absolute URL |
| `border-radius` in Outlook (Word engine) | Accept square corners there; don't build meaning on the radius |
| Background images, `position`, JS | Solid `bgcolor` fills |

Two more habits worth keeping:

- **Set a background *and* a colour on every cell that holds text.** Clients
  that force dark mode invert what they can; explicit pairs survive it legibly,
  transparent ones don't.
- **Images are blocked by default** in Outlook and often Gmail. The mark must
  never be the only thing identifying the sender — the wordmark next to it is
  live text (§5.2) for exactly this reason, and every `<img>` gets an `alt`.

---

## 3. Palette

The `--ag-*` tokens in `ag-theme.css` are authored in `oklch()`. These are their
sRGB hex equivalents — the same conversion `scripts/generate-icons.mjs` already
keeps in its `COLOURS` map for the icon rasteriser, so the two agree.

| Token | Hex | Use in email |
|---|---|---|
| `--ag-bg` | `#f6e8de` | Page background — the cream field behind the card |
| `--ag-surface` | `#fffdf9` | Card background |
| `--ag-surface-2` | `#efe2d8` | Code slab, quiet fills |
| `--ag-ink` / `--ag-dark` | `#3a221a` | Headings and body copy |
| `--ag-ink-soft` | `#735e56` | Sub-copy, footer links |
| `--ag-ink-softer` | `#8b756d` | Footer text, "if you didn't request this" notes |
| `--ag-line` | `#ddcabb` | Card border (1.5px solid), dividers |
| `--ag-terracotta` | `#b74b21` | Primary button fill, links |
| `--ag-terracotta-deep` | `#923002` | Link hover / darker accent if needed |
| `--ag-on-dark` | `#f7f0eb` | Text on terracotta or brown fills |
| `--ag-green` | `#4d9351` | Success ("your password was changed") |
| `--ag-gold` | `#b18827` | Warning / attention |
| `--ag-danger` | `#c0392b` | Destructive / security alerts |
| brass pip (mark only) | `#f7c28f` | Part of the logo art; not a UI colour |

Never introduce a colour that isn't in this table. If an email needs one, add
the token to `ag-theme.css` first and mirror it here.

---

## 4. Type

The app is set in **Bricolage Grotesque** at chunky weights. It won't load in
most inboxes, so the design has to hold up in Arial — which it does, because
what carries the brand here is *weight and size contrast*, not the letterforms.

Use this stack on every text element:

```
font-family: 'Bricolage Grotesque', 'Bricolage Grotesque 24pt', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
```

Apple Mail will use Bricolage if it's installed locally; everyone else falls
back. Don't add a Google Fonts `@import` — it's stripped or ignored in the
clients that matter and gives a false sense of the result.

Scale, mapped from the app's classes:

| Role | App class | Email style |
|---|---|---|
| Email heading | `.ag-hero-title` | `font-size:26px; font-weight:800; line-height:1.1; letter-spacing:-0.02em; color:#3a221a` |
| Sub-heading / lead | `.ag-hero-sub` | `font-size:14px; font-weight:500; line-height:1.5; color:#735e56` |
| Body copy | — | `font-size:15px; font-weight:500; line-height:1.6; color:#3a221a` |
| Button label | `.ag-btn` | `font-size:15px; font-weight:800; line-height:1.1` |
| Eyebrow / label | `.ag-section-label` | `font-size:12px; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; color:#735e56` |
| Wordmark | `.ag-wordmark` | `font-size:22px; font-weight:800; letter-spacing:-0.02em; color:#3a221a` |
| Footer / fine print | `.ag-footer` | `font-size:12px; font-weight:500; line-height:1.5; color:#8b756d` |

Body copy is a notch larger in email than on screen (15px vs 14px) — inbox
reading distance is longer and there's no app chrome for scale. Everything else
keeps the app's proportions.

---

## 5. Geometry & components

Copy-paste recipes. Together they compose the full template in §7.

### 5.1 The shell

Column width is **480px** — the same `--ag-app-width` as `.ag-app`, so an email
and the app it links into feel like the same width of thing.

```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6e8de;margin:0;padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:480px;max-width:100%;">
        <!-- header, card, footer rows go here -->
      </table>
    </td>
  </tr>
</table>
```

### 5.2 Header lockup (mark + wordmark)

The email equivalent of [`Brand`](../src/components/ui/Brand.tsx). PNG, not the
SVG `Brand` uses on screen, and an absolute URL — relative paths don't exist in
an inbox.

```html
<tr>
  <td style="padding:0 4px 16px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding-right:12px;line-height:0;">
          <img src="https://asyncgames.com/icons/icon-192.png" width="34" height="34" alt="" style="display:block;width:34px;height:34px;border-radius:9px;border:0;">
        </td>
        <td style="font-family:'Bricolage Grotesque',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#3a221a;">Async&nbsp;Games</td>
      </tr>
    </table>
  </td>
</tr>
```

`alt=""` on the mark is deliberate: the wordmark beside it already says the
name, so an alt text would just repeat it when images are blocked.

### 5.3 Card

`.ag-card` in email form — cream surface, 1.5px line, 18px radius.

```html
<tr>
  <td style="background:#fffdf9;border:1.5px solid #ddcabb;border-radius:18px;padding:26px 22px;">
    <!-- heading, copy, CTA -->
  </td>
</tr>
```

### 5.4 Button

Bulletproof pattern: the `<td>` carries the fill (so Outlook, which ignores the
anchor's padding and radius, still shows a solid terracotta block), the `<a>`
carries the padding and label. Matches `.ag-btn--primary` — 14px radius,
weight 800.

```html
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center" bgcolor="#b74b21" style="border-radius:14px;">
      <a href="{{action_url}}" style="display:inline-block;padding:14px 24px;font-family:'Bricolage Grotesque',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;line-height:1.1;color:#f7f0eb;text-decoration:none;border-radius:14px;">Sign in</a>
    </td>
  </tr>
</table>
```

Always pair a button with the raw URL in fine print below it — some clients
mangle long links, and some readers won't click a styled button:

```html
<p style="margin:14px 0 0;font-family:'Bricolage Grotesque',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:500;line-height:1.5;color:#8b756d;word-break:break-all;">
  Or paste this into your browser: {{action_url}}
</p>
```

### 5.5 Code slab (one-time codes)

The design system has no on-screen equivalent, so this is the one new piece:
`.ag-empty`'s dashed, centred slab holding the digits at hero weight, tracked
out so they're easy to read off and retype.

```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center" style="background:#efe2d8;border:1.5px dashed #ddcabb;border-radius:16px;padding:18px 12px;font-family:'Bricolage Grotesque',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:32px;font-weight:800;letter-spacing:0.18em;color:#3a221a;">
      {{otp_code}}
    </td>
  </tr>
</table>
```

(The `letter-spacing` adds a trailing gap after the last digit; the cell is
centred, so it reads as centred anyway. Don't try to fix it with negative
margins — clients disagree about them.)

### 5.6 Divider

```html
<tr><td style="padding:18px 0 0;"><div style="height:1px;background:#ddcabb;line-height:1px;font-size:0;">&nbsp;</div></td></tr>
```

### 5.7 Footer

Mirrors `.ag-footer` and the app's `Privacy · Terms` pair — the same two pages
[`clerkAppearance`](../src/utils/ui/clerkAppearance.ts) points the auth cards at.

```html
<tr>
  <td align="center" style="padding:22px 12px 0;font-family:'Bricolage Grotesque',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:500;line-height:1.5;color:#8b756d;">
    You're receiving this because someone used this address to sign in to Async Games.<br>
    <span style="display:inline-block;margin-top:8px;">
      <a href="https://asyncgames.com/privacy" style="color:#735e56;text-decoration:underline;">Privacy</a>
      &nbsp;·&nbsp;
      <a href="https://asyncgames.com/terms" style="color:#735e56;text-decoration:underline;">Terms</a>
    </span>
  </td>
</tr>
```

### 5.8 Preheader

The grey line inboxes show after the subject. Without one they show the first
words of the body, or the alt text of the logo. Put it as the first thing in
the body:

```html
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your Async Games code is {{otp_code}} — it expires shortly.</div>
```

---

## 6. Per-template notes

Copy the shell, swap the card contents. Which of these exist depends on the
sign-in methods enabled on the instance — the dashboard's template list is the
authority.

| Template | Subject | Card contents | Key variables |
|---|---|---|---|
| Verification code | `{{otp_code}} is your Async Games code` | Heading "Your code", one line of lead copy, code slab (§5.5), expiry note | `{{otp_code}}`, `{{app.name}}` |
| Magic link (sign in / sign up) | `Your turn awaits — sign in to Async Games` | Heading, lead, button (§5.4) + raw link, expiry note | `{{magic_link}}` |
| Reset password code | `Reset your Async Games password` | Heading "Reset your password", code slab or button, and a "didn't ask for this?" note | `{{otp_code}}` |
| Password changed / removed | `Your Async Games password was changed` | Heading, one line confirming what changed, no CTA — a security notice, not an action | `{{user.first_name}}` |
| Primary email changed | `Your Async Games email was updated` | Same shape as above | — |
| Invitation | `You're invited to Async Games` | Heading, who invited them if available, button to accept | `{{action_url}}` |

Copy voice: the app's own — short, warm, second person, no exclamation marks.
The sign-in screen says *"Your turn awaits. Sign in to pick up your games."*
Emails should sound like that, not like a bank.

Every email that carries a code or link ends with a muted reassurance line, in
footer type (§4):

> If you didn't request this, you can ignore this email — nothing will change.

---

## 7. Worked example — verification code

The whole thing, assembled. This is the one to paste into the editor first;
every other template is this with a different card.

```html
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your Async Games code is {{otp_code}} — it expires shortly.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6e8de;margin:0;padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:480px;max-width:100%;">

        <tr>
          <td style="padding:0 4px 16px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-right:12px;line-height:0;">
                  <img src="https://asyncgames.com/icons/icon-192.png" width="34" height="34" alt="" style="display:block;width:34px;height:34px;border-radius:9px;border:0;">
                </td>
                <td style="font-family:'Bricolage Grotesque',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#3a221a;">Async&nbsp;Games</td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="background:#fffdf9;border:1.5px solid #ddcabb;border-radius:18px;padding:26px 22px;">
            <h1 style="margin:0;font-family:'Bricolage Grotesque',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:26px;font-weight:800;line-height:1.1;letter-spacing:-0.02em;color:#3a221a;">Your code</h1>
            <p style="margin:8px 0 20px;font-family:'Bricolage Grotesque',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:500;line-height:1.5;color:#735e56;">Enter this to finish signing in to Async Games.</p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" style="background:#efe2d8;border:1.5px dashed #ddcabb;border-radius:16px;padding:18px 12px;font-family:'Bricolage Grotesque',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:32px;font-weight:800;letter-spacing:0.18em;color:#3a221a;">{{otp_code}}</td>
              </tr>
            </table>

            <p style="margin:18px 0 0;font-family:'Bricolage Grotesque',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:500;line-height:1.5;color:#8b756d;">If you didn't request this, you can ignore this email — nothing will change.</p>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:22px 12px 0;font-family:'Bricolage Grotesque',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:500;line-height:1.5;color:#8b756d;">
            You're receiving this because someone used this address to sign in to Async Games.<br>
            <span style="display:inline-block;margin-top:8px;">
              <a href="https://asyncgames.com/privacy" style="color:#735e56;text-decoration:underline;">Privacy</a>
              &nbsp;·&nbsp;
              <a href="https://asyncgames.com/terms" style="color:#735e56;text-decoration:underline;">Terms</a>
            </span>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
```

---

## 8. Before you save

- [ ] Every colour is a hex from §3 — no `oklch()`, no `var(--ag-*)`.
- [ ] Every style is inline; nothing depends on `<head>`.
- [ ] Every text cell sets both a background and a colour.
- [ ] The logo is a PNG at an absolute `https://asyncgames.com/…` URL.
- [ ] Buttons repeat their URL as text underneath.
- [ ] There's a preheader, and a "didn't request this" line.
- [ ] Send yourself a test from the dashboard and open it in Gmail (web +
      Android), Apple Mail, and Outlook. Check it with images blocked, and with
      the client forced into dark mode.
- [ ] Repeat in the other Clerk instance, or note that it's production-only.

## Related

- [`src/app/ag-theme.css`](../src/app/ag-theme.css) — the tokens these hex
  values come from. **Source of truth**; if it changes, §3 and §4 change.
- [`src/utils/ui/clerkAppearance.ts`](../src/utils/ui/clerkAppearance.ts) — the
  same design system handed to Clerk's *in-app* components.
- [`scripts/generate-icons.mjs`](../scripts/generate-icons.mjs) — draws the mark
  and writes `public/icons/icon-192.png`, the logo these emails link to.
- [`docs/environments.md`](./environments.md) — why there are two Clerk
  instances and what else is split between them.
