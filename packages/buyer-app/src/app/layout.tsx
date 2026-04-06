import type { Metadata, Viewport } from "next";
import "./globals.css";
import type { Locale } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "ONDC Bazaar - India's Open Digital Marketplace",
  description:
    "Shop from thousands of sellers across India on ONDC, the open digital commerce network. Best prices, fast delivery, trusted sellers.",
  openGraph: {
    title: "ONDC Bazaar",
    description: "India's open digital marketplace",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#b34700",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning className="pb-16 sm:pb-0">{children}</body>
    </html>
  );
}
