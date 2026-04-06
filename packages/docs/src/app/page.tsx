import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Setu — Open Commerce Infrastructure for Bharat',
  description:
    'An open-source implementation of the ONDC Beckn protocol stack. Designed to complement and strengthen India\'s digital commerce ecosystem.',
  openGraph: {
    title: 'Setu — Open Commerce Infrastructure for Bharat',
    description:
      'Open-source ONDC Beckn protocol implementation with post-quantum security and Indian law compliance.',
    type: 'website',
  },
};

/* ──────────────────────────────────────────────────────────
   Color constants — India tricolor accents on dark bg
   #FF9933 saffron, #FFFFFF white, #138808 green
   Background: #0a0a0a
   Text: #f5f5f5 on dark (contrast > 17:1)
   ────────────────────────────────────────────────────────── */

const SAFFRON = '#FF9933';
const GREEN = '#138808';

function TricolorBar() {
  return (
    <div className="flex w-24 h-1 rounded-full overflow-hidden mx-auto" role="presentation" aria-hidden="true">
      <div className="flex-1" style={{ backgroundColor: SAFFRON }} />
      <div className="flex-1 bg-white" />
      <div className="flex-1" style={{ backgroundColor: GREEN }} />
    </div>
  );
}

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="text-2xl sm:text-3xl font-bold text-white mb-2 tracking-tight"
    >
      {children}
    </h2>
  );
}

const platformCards = [
  { title: 'Buyer App', href: '/shop/', desc: 'Consumer storefront. Search, cart, checkout, order tracking.' },
  { title: 'Seller Dashboard', href: '/seller/', desc: 'Product catalog, inventory, order management, fulfillment.' },
  { title: 'Admin Panel', href: '/admin/', desc: 'Network governance, subscriber management, health monitoring.' },
  { title: 'Onboarding', href: '/admin/onboard', desc: 'Register as a network participant, get API credentials.' },
  { title: 'Registry API', href: '/registry/health', desc: 'Subscriber lookup, key management, challenge-response.' },
  { title: 'Gateway API', href: '/gateway/health', desc: 'Search multicast, response aggregation.' },
  { title: 'Platform Pitch', href: '/pitch', desc: '10-slide overview of the platform.' },
];

const techHighlights = [
  { area: 'Protocol', detail: 'Beckn 1.2.5, all 10 actions + IGM + RSP' },
  { area: 'Crypto', detail: 'Ed25519 + BLAKE-512 + X25519, hybrid ML-DSA-65 post-quantum' },
  { area: 'Security', detail: 'PII encryption at rest, key transparency, circuit breaker, DLQ' },
  { area: 'Compliance', detail: 'DPDPA, IT Act, Consumer Protection, GST (GSTIN checksum, FSSAI, HSN)' },
  { area: 'Data', detail: '14,300+ India Post pincodes, RBI IFSC validation, 88 cities' },
  { area: 'Languages', detail: 'English, Hindi, Tamil, Telugu, Kannada, Bengali' },
  { area: 'Testing', detail: '1,516 tests across 42 files including extreme edge cases' },
  { area: 'Accessibility', detail: 'WCAG 2.2 AAA, 7:1 contrast, screen reader, keyboard navigation' },
];

const knownLimits = [
  'Payment collection requires a Razorpay merchant account (mock mode available for demo)',
  'SMS notifications require MSG91/Twilio credentials (mock mode available)',
  'Connecting to the real ONDC network requires organizational onboarding (DPIIT approval, Pramaan certification)',
  'Settlement via NBBL/NOCS requires bilateral agreements',
];

export default function HomePage() {
  return (
    <div style={{ backgroundColor: '#0a0a0a', color: '#f5f5f5' }}>
      {/* Skip to main content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-black focus:rounded-lg focus:outline-none"
      >
        Skip to main content
      </a>

      {/* ═══════════════════════════════════════════════════════
          HERO
          ═══════════════════════════════════════════════════════ */}
      <header className="relative overflow-hidden" role="banner">
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.15) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
          aria-hidden="true"
        />
        {/* Glow accents */}
        <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full opacity-[0.07] blur-3xl" style={{ backgroundColor: SAFFRON }} aria-hidden="true" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full opacity-[0.05] blur-3xl" style={{ backgroundColor: GREEN }} aria-hidden="true" />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32 lg:py-40 text-center">
          <TricolorBar />
          <h1 className="mt-8 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1]">
            <span style={{ color: SAFFRON }}>Setu</span>
            <span className="block mt-2 text-white text-2xl sm:text-3xl lg:text-4xl font-semibold">
              Open Commerce Infrastructure for Bharat
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl max-w-3xl mx-auto leading-relaxed" style={{ color: '#d4d4d4' }}>
            An open-source implementation of the ONDC Beckn protocol stack.
            <br className="hidden sm:block" />
            Designed to complement and strengthen India&apos;s digital commerce ecosystem.
          </p>

          <nav className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4" aria-label="Primary actions">
            <a
              href="/shop/"
              className="inline-flex items-center gap-2 px-8 py-4 text-base font-semibold rounded-xl transition-all"
              style={{ backgroundColor: SAFFRON, color: '#0a0a0a' }}
            >
              Explore Platform
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </a>
            <a
              href="https://github.com/divyamohan1993/ondc-network-beckn"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-4 text-base font-semibold rounded-xl border-2 transition-all"
              style={{ borderColor: '#333', color: '#f5f5f5' }}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              View on GitHub
            </a>
            <a
              href="/pitch"
              className="inline-flex items-center gap-2 px-8 py-4 text-base font-semibold rounded-xl border-2 transition-all"
              style={{ borderColor: '#333', color: '#f5f5f5' }}
            >
              Read the Pitch
            </a>
          </nav>
        </div>
      </header>

      <main id="main-content">
        {/* ═══════════════════════════════════════════════════════
            WHAT THIS IS
            ═══════════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20" aria-labelledby="what-this-is">
          <SectionHeading id="what-this-is">What This Is</SectionHeading>
          <TricolorBar />
          <p className="mt-6 text-lg leading-relaxed max-w-3xl" style={{ color: '#d4d4d4' }}>
            A complete, protocol-identical implementation of the Beckn network that powers ONDC. Built to help developers, businesses, and researchers build, test, and deploy interoperable commerce applications.
          </p>
        </section>

        {/* ═══════════════════════════════════════════════════════
            PLATFORM OVERVIEW
            ═══════════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20" aria-labelledby="platform-overview">
          <SectionHeading id="platform-overview">Platform Overview</SectionHeading>
          <TricolorBar />
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {platformCards.map((card) => {
              const isExternal = card.href.startsWith('http');
              return (
                <a
                  key={card.title}
                  href={card.href}
                  {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className="group block rounded-xl p-6 transition-all duration-200 border"
                  style={{
                    backgroundColor: '#111111',
                    borderColor: '#222',
                  }}
                  onMouseEnter={undefined}
                >
                  <h3 className="text-lg font-semibold text-white group-hover:text-[#FF9933] transition-colors">
                    {card.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: '#a3a3a3' }}>
                    {card.desc}
                  </p>
                  <span className="mt-3 inline-block text-xs font-mono" style={{ color: '#666' }}>
                    {card.href}
                  </span>
                </a>
              );
            })}
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════
            WHY THIS MATTERS
            ═══════════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20" aria-labelledby="why-this-matters">
          <SectionHeading id="why-this-matters">Why This Matters</SectionHeading>
          <TricolorBar />
          <p className="mt-6 text-base leading-relaxed" style={{ color: '#d4d4d4' }}>
            This project contributes to India&apos;s digital commerce ecosystem in three ways:
          </p>

          <div className="mt-8 space-y-8">
            <div className="rounded-xl p-6 border" style={{ backgroundColor: '#111111', borderColor: '#222' }}>
              <h3 className="text-lg font-semibold" style={{ color: SAFFRON }}>Open Infrastructure</h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: '#a3a3a3' }}>
                The ONDC protocol is open, but production gateway/registry implementations aren&apos;t publicly available. This provides one, so anyone can study, test, and build on the same protocol that powers India&apos;s commerce network.
              </p>
            </div>

            <div className="rounded-xl p-6 border" style={{ backgroundColor: '#111111', borderColor: '#222' }}>
              <h3 className="text-lg font-semibold" style={{ color: SAFFRON }}>Security Research</h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: '#a3a3a3' }}>
                Introduces post-quantum cryptography (ML-DSA-65), PII field-level encryption, and key transparency logging. These techniques are open source and available for adoption by the broader ONDC ecosystem.
              </p>
            </div>

            <div className="rounded-xl p-6 border" style={{ backgroundColor: '#111111', borderColor: '#222' }}>
              <h3 className="text-lg font-semibold" style={{ color: SAFFRON }}>Compliance Automation</h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: '#a3a3a3' }}>
                Automates verification against DPDPA 2023, IT Act 2000, Consumer Protection Act 2019, and GST regulations. Reduces the compliance burden for network participants.
              </p>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════
            TECHNICAL HIGHLIGHTS
            ═══════════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20" aria-labelledby="tech-highlights">
          <SectionHeading id="tech-highlights">Technical Highlights</SectionHeading>
          <TricolorBar />
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-px rounded-xl overflow-hidden border" style={{ borderColor: '#222' }}>
            {techHighlights.map((item) => (
              <div
                key={item.area}
                className="p-5"
                style={{ backgroundColor: '#111111' }}
              >
                <dt className="text-xs font-semibold uppercase tracking-wider" style={{ color: SAFFRON }}>
                  {item.area}
                </dt>
                <dd className="mt-1 text-sm leading-relaxed" style={{ color: '#a3a3a3' }}>
                  {item.detail}
                </dd>
              </div>
            ))}
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════
            WHO WOULD USE THIS
            ═══════════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20" aria-labelledby="who-uses-this">
          <SectionHeading id="who-uses-this">Who Would Use This</SectionHeading>
          <TricolorBar />
          <dl className="mt-10 space-y-6">
            {[
              {
                who: 'ONDC Network Participants',
                what: 'Use the BAP/BPP packages to connect to the real ONDC network. Change 2 env vars, point to prod.registry.ondc.org.',
              },
              {
                who: 'Private Commerce Networks',
                what: 'Enterprises wanting ONDC-compatible commerce within their ecosystem.',
              },
              {
                who: 'Other Countries',
                what: 'Nations building digital commerce networks can deploy this. Same protocol, different jurisdiction.',
              },
              {
                who: 'Developers & Researchers',
                what: 'The only open-source implementation of the ONDC gateway and registry.',
              },
            ].map((item) => (
              <div key={item.who} className="rounded-xl p-5 border" style={{ backgroundColor: '#111111', borderColor: '#222' }}>
                <dt className="text-base font-semibold text-white">{item.who}</dt>
                <dd className="mt-1 text-sm leading-relaxed" style={{ color: '#a3a3a3' }}>{item.what}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ═══════════════════════════════════════════════════════
            ARCHITECTURE
            ═══════════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20" aria-labelledby="architecture">
          <SectionHeading id="architecture">Architecture</SectionHeading>
          <TricolorBar />
          <div className="mt-10 rounded-xl p-6 sm:p-8 border overflow-x-auto" style={{ backgroundColor: '#111111', borderColor: '#222' }}>
            <pre
              className="text-xs sm:text-sm font-mono leading-relaxed whitespace-pre"
              style={{ color: '#d4d4d4' }}
              role="img"
              aria-label="Architecture diagram showing 15 packages: Registry, Gateway, BAP, BPP, Vault in the protocol layer; Buyer App, Seller App, Admin, Docs, Monitor in the application layer; and PostgreSQL, Redis, RabbitMQ, nginx as infrastructure"
            >{`┌─────────────────────────────────────────────────────┐
│                    15 Packages                       │
├──────────┬──────────┬──────────┬──────────┬─────────┤
│ Registry │ Gateway  │   BAP    │   BPP    │  Vault  │
├──────────┼──────────┼──────────┼──────────┼─────────┤
│ Buyer App│Seller App│  Admin   │   Docs   │ Monitor │
├──────────┴──────────┴──────────┴──────────┴─────────┤
│        PostgreSQL  │  Redis  │  RabbitMQ  │  nginx  │
└─────────────────────────────────────────────────────┘`}</pre>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════
            KNOWN LIMITS
            ═══════════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20" aria-labelledby="known-limits">
          <SectionHeading id="known-limits">Known Limits</SectionHeading>
          <TricolorBar />
          <ul className="mt-8 space-y-3" role="list">
            {knownLimits.map((limit) => (
              <li key={limit} className="flex items-start gap-3 text-sm leading-relaxed" style={{ color: '#a3a3a3' }}>
                <span className="mt-1.5 block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#444' }} aria-hidden="true" />
                {limit}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm" style={{ color: '#666' }}>
            See{' '}
            <a
              href="https://github.com/divyamohan1993/ondc-network-beckn/blob/main/KNOWN_LIMITS.md"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 transition-colors"
              style={{ color: SAFFRON }}
            >
              KNOWN_LIMITS.md
            </a>{' '}
            for the full list.
          </p>
        </section>

        {/* ═══════════════════════════════════════════════════════
            DEPLOY
            ═══════════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20" aria-labelledby="deploy">
          <SectionHeading id="deploy">Deploy</SectionHeading>
          <TricolorBar />
          <div className="mt-10 rounded-xl p-6 border overflow-x-auto" style={{ backgroundColor: '#111111', borderColor: '#222' }}>
            <pre className="text-sm font-mono leading-relaxed" style={{ color: '#d4d4d4' }}>
              <code>{`git clone https://github.com/divyamohan1993/ondc-network-beckn.git
cd ondc-network-beckn
./deploy.sh --domain your-domain.com`}</code>
            </pre>
          </div>
          <p className="mt-4 text-sm" style={{ color: '#666' }}>
            Or with Terraform:{' '}
            <code className="px-2 py-1 rounded text-xs font-mono" style={{ backgroundColor: '#1a1a1a', color: '#a3a3a3' }}>
              cd infra &amp;&amp; terraform apply
            </code>
          </p>
        </section>
      </main>

      {/* ═══════════════════════════════════════════════════════
          FOOTER
          ═══════════════════════════════════════════════════════ */}
      <footer className="border-t" style={{ borderColor: '#1a1a1a' }} role="contentinfo">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <TricolorBar />
          <p className="mt-6 text-sm font-medium text-white">
            Built by{' '}
            <a
              href="https://dmj.one"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 transition-colors"
              style={{ color: SAFFRON }}
            >
              Divya Mohan
            </a>
          </p>
          <p className="mt-2 text-sm" style={{ color: '#666' }}>
            <a
              href="https://dmj.one"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
              style={{ color: '#888' }}
            >
              dmj.one
            </a>
            {' '}&middot;{' '}
            <a
              href="mailto:contact@dmj.one"
              className="hover:underline"
              style={{ color: '#888' }}
            >
              contact@dmj.one
            </a>
          </p>
          <p className="mt-4 text-sm" style={{ color: '#555' }}>
            Open source under MIT License
          </p>
          <p className="mt-1 text-sm" style={{ color: '#555' }}>
            A contribution to India&apos;s digital commerce infrastructure
          </p>
          <p className="mt-3 text-xs font-medium tracking-wide" style={{ color: '#444' }}>
            #AatmanirbharBharat #DigitalIndia
          </p>
          <p className="mt-4">
            <a
              href="https://github.com/divyamohan1993/ondc-network-beckn"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs transition-colors"
              style={{ color: '#666' }}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              github.com/divyamohan1993/ondc-network-beckn
            </a>
          </p>
        </div>
      </footer>

      {/* Inline styles for hover effects (no client JS needed) */}
      <style>{`
        .group:hover {
          border-color: ${SAFFRON} !important;
        }
        a:focus-visible {
          outline: 2px solid ${SAFFRON};
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          * {
            transition-duration: 0.01ms !important;
            animation-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
  );
}
