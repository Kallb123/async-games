import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import 'bootstrap/dist/css/bootstrap.css';
import "./globals.css";
import "./ag-theme.css";
import { ClerkProvider } from '@clerk/nextjs'
import Providers from "@/components/Providers";

// Self-hosted at build time by next/font, so there's no render-blocking request
// to Google's CDN and no flash of fallback type. `--ag-font` in ag-theme.css
// points at the family this exposes.
const bricolageGrotesque = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
  variable: "--ag-font-bricolage",
});

export const metadata: Metadata = {
  title: "Async Games",
  description: "Portal for all sorts of asynchronous games",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
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
          <meta name="msapplication-TileColor" content="#2B5797" />
          <meta name="msapplication-tap-highlight" content="no" />
          <meta name="theme-color" content="#F0EEE9" />

          {/* <link rel="apple-touch-icon" href="/icons/touch-icon-iphone.png" />
          <link rel="apple-touch-icon" sizes="152x152" href="/icons/touch-icon-ipad.png" />
          <link rel="apple-touch-icon" sizes="180x180" href="/icons/touch-icon-iphone-retina.png" />
          <link rel="apple-touch-icon" sizes="167x167" href="/icons/touch-icon-ipad-retina.png" /> */}

          {/* <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32x32.png" />
          <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16x16.png" /> */}
          <link rel="manifest" href="/manifest.json" />
          {/* <link rel="mask-icon" href="/icons/safari-pinned-tab.svg" color="#5bbad5" />
          <link rel="shortcut icon" href="/favicon.ico" /> */}

          <meta name="twitter:card" content="summary" />
          <meta name="twitter:url" content="https://async-games.vercel.app" />
          <meta name="twitter:title" content="Async Games" />
          <meta name="twitter:description" content="Best Async Gaming Platform" />
          {/* <meta name="twitter:image" content="https://async-games.vercel.app/icons/android-chrome-192x192.png" /> */}
          <meta name="twitter:creator" content="@Kallb123" />
          <meta property="og:type" content="website" />
          <meta property="og:title" content="Async Games" />
          <meta property="og:description" content="Best Async Gaming Platform" />
          <meta property="og:site_name" content="Async Games" />
          <meta property="og:url" content="https://async-games.vercel.app" />
          {/* <meta property="og:image" content="https://async-games.vercel.app/icons/apple-touch-icon.png" /> */}
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
