import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import LanguageToggle from '@/components/LanguageToggle';
import { getMessages } from '@/lib/i18n';
import { cookies } from 'next/headers';

export const metadata: Metadata = {
  title: 'ONDC Seller Dashboard',
  description: 'Manage your shop on India\'s open digital commerce network',
};

async function getLocale(): Promise<string> {
  const cookieStore = await cookies();
  return cookieStore.get('locale')?.value || 'en';
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const t = getMessages(locale);

  return (
    <html lang={locale} dir="ltr" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-3 focus:bg-saffron-500 focus:text-white focus:rounded-xl focus:text-sm focus:font-semibold"
        >
          {t.app.skip_nav}
        </a>

        <div className="flex h-screen overflow-hidden">
          <Sidebar locale={locale} translations={t.nav} />

          <div className="flex-1 flex flex-col overflow-hidden">
            <header className="h-14 border-b border-surface-border bg-abyss/80 backdrop-blur-sm flex items-center justify-between px-6 shrink-0">
              <h1 className="text-sm font-semibold text-white font-display sr-only">{t.app.name}</h1>
              <div />
              <LanguageToggle locale={locale} label={t.app.language} />
            </header>

            <main id="main-content" className="flex-1 overflow-y-auto bg-grid" role="main" tabIndex={-1}>
              <div className="p-6 sm:p-8 max-w-[1600px] mx-auto">
                {children}
              </div>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
