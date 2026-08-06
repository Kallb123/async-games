/**
 * Clerk's prebuilt components (currently `<SignIn />`) render their own markup
 * inside a shadow of our app, so the `ag-*` classes can't reach into them.
 * Clerk does take a theme of its own though, and its theme variables accept
 * `var()` references — so we hand it the same design tokens the rest of the
 * site uses and the auth screens come out looking like the app rather than a
 * bolted-on widget.
 *
 * This is the single place Clerk gets styled: it's passed to `<ClerkProvider>`
 * in the root layout, so every Clerk surface (sign-in, user profile, modals we
 * add later) inherits it without any per-screen restyling.
 *
 * See https://clerk.com/docs/nextjs/guides/customizing-clerk/appearance-prop/variables
 * for the variable list.
 */
export const clerkAppearance = {
    variables: {
        // Type — Bricolage Grotesque, in the app's chunky weights. Clerk's own
        // scale (400/500/600/700) is a notch lighter than ours everywhere.
        fontFamily: 'var(--ag-font)',
        fontFamilyButtons: 'var(--ag-font)',
        fontSize: '0.875rem',
        fontWeight: { normal: 500, medium: 600, semibold: 700, bold: 800 },

        // Colour — terracotta accent on cream, warm ink for text.
        colorPrimary: 'var(--ag-terracotta)',
        colorPrimaryForeground: 'var(--ag-on-dark)',
        colorDanger: 'var(--ag-danger)',
        colorSuccess: 'var(--ag-green)',
        colorWarning: 'var(--ag-gold)',
        // Clerk derives borders, hover fills and avatar backgrounds from this.
        colorNeutral: 'var(--ag-ink)',
        colorForeground: 'var(--ag-ink)',
        colorMutedForeground: 'var(--ag-ink-soft)',
        colorMuted: 'var(--ag-surface-2)',
        colorBackground: 'var(--ag-surface)',
        colorInput: 'var(--ag-surface)',
        colorInputForeground: 'var(--ag-ink)',
        colorBorder: 'var(--ag-line)',
        // `.ag-input:focus` turns terracotta; Clerk renders the ring at 15%.
        colorRing: 'var(--ag-terracotta)',
        colorShadow: 'var(--ag-shadow-color)',

        // Shape — Clerk scales this base up for cards (x2) and down for small
        // chips, so 10px lands on ~20px cards and ~13px buttons/inputs, close
        // to the 18px `.ag-card` / 14px `.ag-btn` the rest of the app uses.
        borderRadius: '10px',
    },
} as const;
