import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import 'bootstrap/dist/css/bootstrap.css';
import "./globals.css";
import "./ag-theme.css";
import { ClerkProvider } from '@clerk/nextjs'
import Providers from "@/components/Providers";
import { clerkAppearance } from "@/utils/ui/clerkAppearance";
import { isDevDeployment } from "@/utils/devEnvironment";

// Self-hosted at build time by next/font, so there's no render-blocking request
// to Google's CDN and no flash of fallback type. `--ag-font` in ag-theme.css
// points at the family this exposes.
const bricolageGrotesque = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
  variable: "--ag-font-bricolage",
});

const SITE_URL = "https://asyncgames.com";

// Off the production deployment every title is flagged, so a tab, a bookmark
// or a screenshot says which build it came from at a glance. The `template`
// carries the prefix onto the pages that set a title of their own (terms,
// privacy) without either of them having to know about it; in production both
// halves collapse to the plain name.
const DEV_TITLE_PREFIX = isDevDeployment ? "DEV — " : "";
const APP_NAME = `${DEV_TITLE_PREFIX}Async Games`;

// The share card drawn by `scripts/generate-icons.mjs`. The tab, home-screen
// and installed-app icons come from the same script, via the App Router's file
// conventions (`favicon.ico`, `apple-icon.png`) and `public/manifest.json`.
const OG_IMAGE = "/icons/og-image.png";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: APP_NAME,
    template: `${DEV_TITLE_PREFIX}%s`,
  },
  description: "Portal for all sorts of asynchronous games",
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: APP_NAME,
    description: "Best Async Gaming Platform",
    url: SITE_URL,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "Async Games — board games, one turn at a time." }],
  },
  twitter: {
    card: "summary_large_image",
    title: APP_NAME,
    description: "Best Async Gaming Platform",
    creator: "@Kallb123",
    images: [OG_IMAGE],
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
        <head>
          <meta name="application-name" content={APP_NAME} />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="default" />
          <meta name="apple-mobile-web-app-title" content={APP_NAME} />
          <meta name="description" content="Best Async Gaming Platform" />
          <meta name="format-detection" content="telephone=no" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="msapplication-config" content="/icons/browserconfig.xml" />
          <meta name="msapplication-tap-highlight" content="no" />
          <meta name="theme-color" content="#F0EEE9" />

          {/* The tab icon (`favicon.ico`) and the iOS home-screen icon
              (`apple-icon.png`) sit next to this file, so Next links them
              itself; the rest of the set is listed in the manifest. */}
          <link rel="manifest" href="/manifest.json" />
        </head>
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
