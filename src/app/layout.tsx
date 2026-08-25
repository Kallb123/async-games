import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import 'bootstrap/dist/css/bootstrap.css';
import "./globals.css";
import "./ag-theme.css";
import { ClerkProvider } from '@clerk/nextjs'
import Providers from "@/components/Providers";
import { clerkAppearance } from "@/utils/ui/clerkAppearance";
import { isDevDeployment } from "@/utils/devEnvironment";
import { APP_BASE_URL, APP_DESCRIPTION, APP_NAME, APP_TAGLINE, DEV_TITLE_PREFIX, OG_IMAGE, shareImage } from "@/utils/app";
import { SRGB } from "@/utils/ui/colours";

// Self-hosted at build time by next/font, so there's no render-blocking request
// to Google's CDN and no flash of fallback type. `--ag-font` in ag-theme.css
// points at the family this exposes.
const bricolageGrotesque = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
  variable: "--ag-font-bricolage",
});

// The colours a browser paints around the page rather than inside it: the
// address bar on mobile, and the frame an installed app runs in. `--ag-bg` is
// what the app itself is painted on, and `app/manifest.ts` hands the same
// value to the install prompt and the splash screen.
export const viewport: Viewport = {
  themeColor: SRGB.bg,
};

// The card a link to anything but a lobby unfurls to. `/join` builds the
// lobby's own the same way.
const SITE_CARD = shareImage(OG_IMAGE, `${APP_NAME} — ${APP_TAGLINE}`);

// Every tag that names, describes or illustrates the app. All of it goes
// through here and is emitted by Next: a hand-written `<head>` used to carry
// half of it — a second app name, a stale theme colour, its own manifest link
// — beside a `metadata` block saying something else. Nothing in this tree
// renders a `<head>` of its own; add tags here instead.
//
// The tab, home-screen and installed-app icons come from the same script that
// draws OG_IMAGE, via the App Router's file conventions (`favicon.ico`,
// `apple-icon.png`, `manifest.ts`).
export const metadata: Metadata = {
  metadataBase: new URL(APP_BASE_URL),
  applicationName: APP_NAME,
  title: {
    default: APP_NAME,
    template: `${DEV_TITLE_PREFIX}%s`,
  },
  description: APP_DESCRIPTION,
  // Installed on iOS: run without browser chrome, under the same name the tab
  // and the manifest use. Next writes the standard `mobile-web-app-capable`
  // for `capable`, so the Apple-prefixed tag it deprecates is gone.
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
  // A join code is not a phone number, however much "4-8-2-1" looks like one.
  formatDetection: { telephone: false },
  // Windows' pinned tiles, which predate the manifest and read their own file.
  other: {
    "msapplication-config": "/icons/browserconfig.xml",
    "msapplication-tap-highlight": "no",
  },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: APP_NAME,
    description: APP_DESCRIPTION,
    url: APP_BASE_URL,
    images: [SITE_CARD],
  },
  // The same card, described the same way — a Twitter entry takes the whole
  // image, so it carries the alt text a screen reader needs rather than a bare
  // URL.
  twitter: {
    card: "summary_large_image",
    title: APP_NAME,
    description: APP_DESCRIPTION,
    creator: "@Kallb123",
    images: [SITE_CARD],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // `signInUrl`/`signUpUrl` keep Clerk's own cross-links ("Don't have an
  // account? Sign up") pointed at the pages we mount and theme, rather than at
  // Clerk's hosted Account Portal on its own domain.
  return (
    <ClerkProvider appearance={clerkAppearance} signInUrl="/login" signUpUrl="/signup">
      {/* `data-env="dev"` is what ag-theme.css hangs the 🚧 top-bar badge off,
          so every screen is marked without any of them opting in. */}
      <html lang="en" className={bricolageGrotesque.variable} data-env={isDevDeployment ? "dev" : undefined}>
        <body>
          <Providers>
            <div className="ag-app">
              {children}
            </div>
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
