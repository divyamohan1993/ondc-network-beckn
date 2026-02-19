import type { Metadata } from 'next';
import './globals.css';
import SessionProvider from '@/components/session-provider';
import Sidebar from '@/components/sidebar';

export const metadata: Metadata = {
  title: 'ONDC Command Center',
  description: 'Network governance and monitoring for India\'s digital commerce infrastructure',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="noise">
        <SessionProvider>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto bg-grid">
              <div className="p-8 max-w-[1600px] mx-auto">{children}</div>
            </main>
          </div>
        </SessionProvider>
      </body>
    </html>
  );
}
