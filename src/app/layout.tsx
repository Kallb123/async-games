import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import 'bootstrap/dist/css/bootstrap.css';
import "./globals.css";
import "./ag-theme.css";
import { ClerkProvider } from '@clerk/nextjs'
import Providers from "@/components/Providers";
import { clerkAppearance } from "@/utils/ui/clerkAppearance";

// Self-hosted at build time by next/font, so there's no render-blocking request
// to Google's CDN and no flash of fallback type. `--ag-font` in ag-theme.css
// points at the family this exposes.
const bricolageGrotesque = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
  variable: "--ag-font-bricolage",
});

const SITE_URL = "https://asyncgames.com";

// The share card drawn by `scripts/generate-icons.mjs`. The tab, home-screen
// and installed-app icons come from the same script, via the App Router's file
// conventions (`favicon.ico`, `apple-icon.png`) and `public/manifest.json`.
const OG_IMAGE = "/icons/og-image.png";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Async Games",
  description: "Portal for all sorts of asynchronous games",
  openGraph: {
    type: "website",
    siteName: "Async Games",
    title: "Async Games",
    description: "Best Async Gaming Platform",
    url: SITE_URL,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "Async Games — board games, one turn at a time." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Async Games",
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
      <html lang="en" className={bricolageGrotesque.variable}>
        <head>
          <meta name="application-name" content="Async Games" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="default" />
          <meta name="apple-mobile-web-app-title" content="Async Games" />
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
