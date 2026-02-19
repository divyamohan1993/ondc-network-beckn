'use client';

import { usePathname } from 'next/navigation';

const sidebarSections = [
  {
    title: 'Getting Started',
    items: [
      { href: '/docs', label: 'Overview' },
      { href: '/docs/onboarding', label: 'Getting Started' },
    ],
  },
  {
    title: 'Guides',
    items: [
      { href: '/docs/integration', label: 'Integration Guide' },
      { href: '/docs/signing', label: 'Signing Tutorial' },
    ],
  },
  {
    title: 'Reference',
    items: [
      { href: '/docs/api', label: 'API Reference' },
      { href: '/docs/domains', label: 'Domains' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { href: '/docs/migration', label: 'Migration Guide' },
    ],
  },
];

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="max-w-8xl mx-auto flex">
      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside className="hidden lg:block w-72 shrink-0 border-r border-gray-200 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
        <nav className="p-6 space-y-8">
          {sidebarSections.map((section) => (
            <div key={section.title}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                {section.title}
              </h3>
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <li key={item.href}>
                      <a
                        href={item.href}
                        className={
                          isActive ? 'sidebar-link-active' : 'sidebar-link'
                        }
                      >
                        {item.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {/* Quick links */}
          <div className="pt-6 border-t border-gray-200">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Quick Links
            </h3>
            <ul className="space-y-1">
              <li>
                <a
                  href="/docs/api"
                  className="sidebar-link inline-flex items-center gap-2"
                >
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                  </svg>
                  API Endpoints
                </a>
              </li>
              <li>
                <a
                  href="/docs/domains"
                  className="sidebar-link inline-flex items-center gap-2"
                >
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6z" />
                  </svg>
                  Domain Codes
                </a>
              </li>
            </ul>
          </div>
        </nav>
      </aside>

      {/* ── Mobile sidebar toggle ────────────────────────────── */}
      <div className="lg:hidden fixed bottom-6 right-6 z-40">
        <details className="relative">
          <summary className="list-none w-12 h-12 rounded-full bg-primary-600 text-white flex items-center justify-center shadow-lg cursor-pointer hover:bg-primary-700 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </summary>
          <div className="absolute bottom-full right-0 mb-2 w-64 bg-white rounded-xl shadow-2xl border border-gray-200 py-4 max-h-[70vh] overflow-y-auto">
            {sidebarSections.map((section) => (
              <div key={section.title} className="px-4 mb-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  {section.title}
                </h3>
                {section.items.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      className={`block px-3 py-1.5 text-sm rounded-lg mb-0.5 ${
                        isActive
                          ? 'bg-primary-50 text-primary-700 font-medium'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {item.label}
                    </a>
                  );
                })}
              </div>
            ))}
          </div>
        </details>
      </div>

      {/* ── Content Area ─────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        <div className="max-w-4xl mx-auto px-6 sm:px-8 py-10 sm:py-14">
          {children}
        </div>
      </div>
    </div>
  );
}
