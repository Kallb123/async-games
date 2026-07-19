import type { Metadata } from "next";
import 'bootstrap/dist/css/bootstrap.css';
import "./globals.css";
import "./ag-theme.css";
import { ClerkProvider } from '@clerk/nextjs'
import Providers from "@/components/Providers";

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
      <html lang="en">
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
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&display=swap" />

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
