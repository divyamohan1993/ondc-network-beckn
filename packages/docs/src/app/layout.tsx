import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ONDC Network Platform — Documentation',
  description:
    'Your own private Beckn network — protocol-identical to India\'s ONDC. Complete developer documentation, API reference, and integration guides.',
  keywords: ['ONDC', 'Beckn', 'network', 'protocol', 'API', 'documentation'],
};

const docsDropdownItems = [
  { href: '/docs/onboarding', label: 'Getting Started' },
  { href: '/docs/integration', label: 'Integration Guide' },
  { href: '/docs/signing', label: 'Signing Tutorial' },
  { href: '/docs/api', label: 'API Reference' },
  { href: '/docs/domains', label: 'Domains' },
  { href: '/docs/migration', label: 'Migration Guide' },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="min-h-screen flex flex-col">
        {/* ── Navigation Bar ───────────────────────────────────── */}
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-gray-200">
          <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              {/* Logo / Brand */}
              <a href="/" className="flex items-center gap-3 group">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-600 to-cyan-500 flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow">
                  <svg
                    className="w-5 h-5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"
                    />
                  </svg>
                </div>
                <span className="text-lg font-bold text-gray-900 tracking-tight">
                  ONDC<span className="text-primary-600"> Platform</span>
                </span>
              </a>

              {/* Navigation Links */}
              <div className="hidden md:flex items-center gap-1">
                <a
                  href="/"
                  className="px-4 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 hover:text-gray-900 transition-colors"
                >
                  Home
                </a>

                {/* Docs Dropdown */}
                <div className="relative group">
                  <a
                    href="/docs"
                    className="px-4 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 hover:text-gray-900 transition-colors inline-flex items-center gap-1"
                  >
                    Docs
                    <svg
                      className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-transform group-hover:rotate-180"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                      />
                    </svg>
                  </a>

                  {/* Dropdown Menu */}
                  <div className="absolute top-full left-0 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                    <div className="bg-white rounded-xl shadow-xl border border-gray-200 py-2 w-56">
                      {docsDropdownItems.map((item) => (
                        <a
                          key={item.href}
                          href={item.href}
                          className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-700 transition-colors"
                        >
                          {item.label}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>

                <a
                  href="/docs/api"
                  className="px-4 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 hover:text-gray-900 transition-colors"
                >
                  API
                </a>
              </div>

              {/* CTA */}
              <div className="flex items-center gap-3">
                <a
                  href="/docs/onboarding"
                  className="hidden sm:inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 shadow-sm hover:shadow-md transition-all"
                >
                  Get Started
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                    />
                  </svg>
                </a>

                {/* Mobile menu button */}
                <details className="md:hidden relative">
                  <summary className="list-none p-2 rounded-lg hover:bg-gray-100 cursor-pointer">
                    <svg
                      className="w-6 h-6 text-gray-700"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                      />
                    </svg>
                  </summary>
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-50">
                    <a href="/" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                      Home
                    </a>
                    <a href="/docs" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                      Documentation
                    </a>
                    <hr className="my-2 border-gray-100" />
                    {docsDropdownItems.map((item) => (
                      <a
                        key={item.href}
                        href={item.href}
                        className="block px-6 py-2 text-sm text-gray-600 hover:bg-gray-50"
                      >
                        {item.label}
                      </a>
                    ))}
                  </div>
                </details>
              </div>
            </div>
          </nav>
        </header>

        {/* ── Main Content ─────────────────────────────────────── */}
        <main className="flex-1">{children}</main>

        {/* ── Footer ───────────────────────────────────────────── */}
        <footer className="bg-gray-950 text-gray-400">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {/* Brand Column */}
              <div className="col-span-2 md:col-span-1">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-cyan-400 flex items-center justify-center">
                    <svg
                      className="w-4 h-4 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"
                      />
                    </svg>
                  </div>
                  <span className="text-white font-bold">ONDC Platform</span>
                </div>
                <p className="text-sm leading-relaxed">
                  Your own private Beckn network, protocol-identical to India&apos;s
                  ONDC. Open source and self-hosted.
                </p>
              </div>

              {/* Documentation */}
              <div>
                <h3 className="text-white font-semibold text-sm mb-4 uppercase tracking-wider">
                  Documentation
                </h3>
                <ul className="space-y-2.5">
                  <li>
                    <a href="/docs/onboarding" className="text-sm hover:text-white transition-colors">
                      Getting Started
                    </a>
                  </li>
                  <li>
                    <a href="/docs/integration" className="text-sm hover:text-white transition-colors">
                      Integration Guide
                    </a>
                  </li>
                  <li>
                    <a href="/docs/signing" className="text-sm hover:text-white transition-colors">
                      Signing Tutorial
                    </a>
                  </li>
                  <li>
                    <a href="/docs/api" className="text-sm hover:text-white transition-colors">
                      API Reference
                    </a>
                  </li>
                </ul>
              </div>

              {/* Resources */}
              <div>
                <h3 className="text-white font-semibold text-sm mb-4 uppercase tracking-wider">
                  Resources
                </h3>
                <ul className="space-y-2.5">
                  <li>
                    <a href="/docs/domains" className="text-sm hover:text-white transition-colors">
                      Domains
                    </a>
                  </li>
                  <li>
                    <a href="/docs/migration" className="text-sm hover:text-white transition-colors">
                      Migration Guide
                    </a>
                  </li>
                  <li>
                    <a href="/docs/api" className="text-sm hover:text-white transition-colors">
                      API Endpoints
                    </a>
                  </li>
                </ul>
              </div>

              {/* Platform */}
              <div>
                <h3 className="text-white font-semibold text-sm mb-4 uppercase tracking-wider">
                  Platform
                </h3>
                <ul className="space-y-2.5">
                  <li>
                    <a href="/" className="text-sm hover:text-white transition-colors">
                      Home
                    </a>
                  </li>
                  <li>
                    <a href="/docs" className="text-sm hover:text-white transition-colors">
                      Documentation
                    </a>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-12 pt-8 border-t border-gray-800 flex flex-col sm:flex-row justify-between items-center gap-4">
              <p className="text-sm">
                Built with the Beckn Protocol. Protocol-identical to India&apos;s ONDC
                network.
              </p>
              <p className="text-sm text-gray-500">
                ONDC Network Platform &mdash; Open Source
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
