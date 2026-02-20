export default function HomePage() {
  return (
    <>
      {/* ════════════════════════════════════════════════════════
          HERO SECTION
          ════════════════════════════════════════════════════════ */}
      <section className="relative gradient-hero overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 rounded-full bg-cyan-300/20 blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-white/5 blur-3xl" />
        </div>

        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32 lg:py-40">
          <div className="text-center max-w-4xl mx-auto">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white/90 text-sm font-medium mb-8">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Open Source &middot; Beckn Protocol Compatible
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-7xl font-extrabold text-white tracking-tight leading-[1.1] mb-6">
              ONDC Network
              <br />
              <span className="bg-gradient-to-r from-cyan-300 via-blue-200 to-white bg-clip-text text-transparent">
                Platform
              </span>
            </h1>

            <p className="text-lg sm:text-xl lg:text-2xl text-blue-100 max-w-3xl mx-auto mb-10 leading-relaxed">
              Your own private Beckn network &mdash; protocol-identical to India&apos;s
              ONDC. Full registry, gateway, BAP, BPP, admin dashboard, and
              developer documentation in a single deployable stack.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="/docs/onboarding"
                className="inline-flex items-center gap-2 px-8 py-4 text-base font-semibold text-primary-900 bg-white rounded-xl hover:bg-gray-100 shadow-xl hover:shadow-2xl transition-all transform hover:-translate-y-0.5"
              >
                Get Started
                <svg
                  className="w-5 h-5"
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
              <a
                href="/docs"
                className="inline-flex items-center gap-2 px-8 py-4 text-base font-semibold text-white border-2 border-white/30 rounded-xl hover:bg-white/10 backdrop-blur-sm transition-all"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                  />
                </svg>
                View Docs
              </a>
            </div>
          </div>
        </div>

        {/* Bottom wave */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg
            viewBox="0 0 1440 120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full"
          >
            <path
              d="M0 120L60 110C120 100 240 80 360 70C480 60 600 60 720 65C840 70 960 80 1080 85C1200 90 1320 90 1380 90L1440 90V120H1380C1320 120 1200 120 1080 120C960 120 840 120 720 120C600 120 480 120 360 120C240 120 120 120 60 120H0Z"
              fill="white"
            />
          </svg>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          FEATURE CARDS
          ════════════════════════════════════════════════════════ */}
      <section className="py-20 sm:py-28 gradient-mesh">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Everything You Need
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              A complete, self-hosted ONDC-compatible network with all the
              infrastructure you need for development, testing, and production.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Card 1: Protocol Identical */}
            <div className="feature-card group">
              <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Protocol Identical
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Same Ed25519 signing, same Beckn APIs, same packet structure as
                government ONDC. Your code runs unchanged on either network.
              </p>
            </div>

            {/* Card 2: One Command Setup */}
            <div className="feature-card group">
              <div className="w-12 h-12 rounded-xl bg-green-100 text-green-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                One Command Setup
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Clone the repo and run{' '}
                <code className="code-inline">sudo bash autoconfig.sh</code>.
                Everything launches automatically &mdash; registry, gateway,
                participants, admin UI, and docs.
              </p>
            </div>

            {/* Card 3: Multi-Domain */}
            <div className="feature-card group">
              <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Multi-Domain
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Water, food, agriculture, logistics, healthcare, retail &mdash;
                all NIC2004 domain codes pre-configured with realistic catalog
                schemas and sample items.
              </p>
            </div>

            {/* Card 4: Full Governance */}
            <div className="feature-card group">
              <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Full Governance
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Admin dashboard for complete network management &mdash; approve
                subscribers, monitor transactions, view analytics, and manage
                network policies.
              </p>
            </div>

            {/* Card 5: Simulation Ready */}
            <div className="feature-card group">
              <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Simulation Ready
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Generate realistic test data with one command. Spin up any
                number of BAPs, BPPs, and simulate hundreds of orders across
                multiple domains instantly.
              </p>
            </div>

            {/* Card 6: Production Ready */}
            <div className="feature-card group">
              <div className="w-12 h-12 rounded-xl bg-teal-100 text-teal-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Production Ready
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Persistent PostgreSQL storage, automated backups, SSL/TLS
                termination, health checks, and Docker Compose orchestration for
                reliable production deployments.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          ARCHITECTURE DIAGRAM
          ════════════════════════════════════════════════════════ */}
      <section className="py-20 sm:py-28 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Platform Architecture
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              A complete Beckn network stack with all required components
              running together in Docker Compose.
            </p>
          </div>

          {/* Architecture Diagram */}
          <div className="max-w-5xl mx-auto">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 sm:p-12">
              {/* External Layer */}
              <div className="text-center mb-8">
                <span className="inline-block px-4 py-1.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full uppercase tracking-wider mb-4">
                  External Participants
                </span>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <div className="flex items-center gap-3 px-6 py-3 bg-blue-50 border border-blue-200 rounded-xl">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <span className="text-sm font-medium text-blue-800">
                      Buyer Apps (BAPs)
                    </span>
                  </div>
                  <svg className="w-6 h-6 text-gray-400 rotate-90 sm:rotate-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                  </svg>
                  <div className="flex items-center gap-3 px-6 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span className="text-sm font-medium text-emerald-800">
                      Seller Apps (BPPs)
                    </span>
                  </div>
                </div>
              </div>

              {/* Arrow down */}
              <div className="flex justify-center my-4">
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                </svg>
              </div>

              {/* Core Network */}
              <div className="border-2 border-dashed border-primary-200 rounded-2xl p-6 sm:p-8 bg-primary-50/30">
                <span className="inline-block px-4 py-1.5 bg-primary-100 text-primary-700 text-xs font-semibold rounded-full uppercase tracking-wider mb-6">
                  ONDC Network Core
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Registry */}
                  <div className="bg-white rounded-xl border border-gray-200 p-5 text-center shadow-sm">
                    <div className="w-10 h-10 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center mx-auto mb-3">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                      </svg>
                    </div>
                    <h4 className="font-semibold text-gray-900 text-sm">Registry</h4>
                    <p className="text-xs text-gray-500 mt-1">
                      Subscriber management &amp; key lookup
                    </p>
                    <code className="text-xs text-violet-600 mt-2 block">:3001</code>
                  </div>

                  {/* Gateway */}
                  <div className="bg-white rounded-xl border border-gray-200 p-5 text-center shadow-sm">
                    <div className="w-10 h-10 rounded-lg bg-cyan-100 text-cyan-600 flex items-center justify-center mx-auto mb-3">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                      </svg>
                    </div>
                    <h4 className="font-semibold text-gray-900 text-sm">Gateway</h4>
                    <p className="text-xs text-gray-500 mt-1">
                      Request routing &amp; broadcast
                    </p>
                    <code className="text-xs text-cyan-600 mt-2 block">:3002</code>
                  </div>

                  {/* Admin */}
                  <div className="bg-white rounded-xl border border-gray-200 p-5 text-center shadow-sm">
                    <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-3">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                      </svg>
                    </div>
                    <h4 className="font-semibold text-gray-900 text-sm">Admin</h4>
                    <p className="text-xs text-gray-500 mt-1">
                      Dashboard &amp; governance
                    </p>
                    <code className="text-xs text-amber-600 mt-2 block">:3003</code>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                  {/* BAP */}
                  <div className="bg-white rounded-xl border border-gray-200 p-5 text-center shadow-sm">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-3">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                      </svg>
                    </div>
                    <h4 className="font-semibold text-gray-900 text-sm">BAP</h4>
                    <p className="text-xs text-gray-500 mt-1">
                      Buyer Application Platform
                    </p>
                    <code className="text-xs text-blue-600 mt-2 block">:3004</code>
                  </div>

                  {/* BPP */}
                  <div className="bg-white rounded-xl border border-gray-200 p-5 text-center shadow-sm">
                    <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016A3.001 3.001 0 0021 9.349m-18 0a2.999 2.999 0 002.25-1.016 2.993 2.993 0 002.25 1.016m0 0a2.999 2.999 0 002.25-1.016A2.993 2.993 0 0012 9.349m0 0a2.999 2.999 0 002.25-1.016A2.993 2.993 0 0016.5 9.349m0 0c.896 0 1.7-.393 2.25-1.015" />
                      </svg>
                    </div>
                    <h4 className="font-semibold text-gray-900 text-sm">BPP</h4>
                    <p className="text-xs text-gray-500 mt-1">
                      Seller Application Platform
                    </p>
                    <code className="text-xs text-emerald-600 mt-2 block">:3005</code>
                  </div>

                  {/* Docs */}
                  <div className="bg-white rounded-xl border border-gray-200 p-5 text-center shadow-sm">
                    <div className="w-10 h-10 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                      </svg>
                    </div>
                    <h4 className="font-semibold text-gray-900 text-sm">Docs</h4>
                    <p className="text-xs text-gray-500 mt-1">
                      This documentation portal
                    </p>
                    <code className="text-xs text-rose-600 mt-2 block">:3000</code>
                  </div>
                </div>
              </div>

              {/* Arrow down */}
              <div className="flex justify-center my-4">
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                </svg>
              </div>

              {/* Data layer */}
              <div className="text-center">
                <span className="inline-block px-4 py-1.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full uppercase tracking-wider mb-4">
                  Data Layer
                </span>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <div className="flex items-center gap-3 px-6 py-3 bg-orange-50 border border-orange-200 rounded-xl">
                    <div className="w-3 h-3 rounded-full bg-orange-500" />
                    <span className="text-sm font-medium text-orange-800">
                      PostgreSQL
                    </span>
                  </div>
                  <div className="flex items-center gap-3 px-6 py-3 bg-red-50 border border-red-200 rounded-xl">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="text-sm font-medium text-red-800">
                      Redis (Cache)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          QUICK START
          ════════════════════════════════════════════════════════ */}
      <section className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
                Up and Running in Minutes
              </h2>
              <p className="text-lg text-gray-600">
                Three commands to a fully operational ONDC-compatible network
                with simulated participants and realistic data.
              </p>
            </div>

            {/* Terminal Window */}
            <div className="rounded-2xl overflow-hidden shadow-2xl border border-gray-800">
              {/* Terminal header */}
              <div className="bg-gray-900 px-4 py-3 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="ml-3 text-xs text-gray-500 font-mono">
                  terminal
                </span>
              </div>
              {/* Terminal body */}
              <div className="bg-gray-950 p-6 font-mono text-sm leading-relaxed overflow-x-auto">
                <div className="text-gray-500"># Clone and deploy the entire network</div>
                <div className="mt-1">
                  <span className="text-green-400">$</span>{' '}
                  <span className="text-gray-100">
                    git clone https://github.com/divyamohan1993/ondc-network-beckn.git
                  </span>
                </div>
                <div className="mt-1">
                  <span className="text-green-400">$</span>{' '}
                  <span className="text-gray-100">cd ondc-network-beckn</span>
                </div>
                <div className="mt-1">
                  <span className="text-green-400">$</span>{' '}
                  <span className="text-gray-100">sudo bash autoconfig.sh</span>
                </div>
                <div className="mt-4 text-gray-500">
                  # Generate test data: 5 BAPs, 20 BPPs, 500 orders
                </div>
                <div className="mt-1">
                  <span className="text-green-400">$</span>{' '}
                  <span className="text-gray-100">
                    sudo bash simulate.sh --baps 5 --bpps 20 --orders 500
                  </span>
                </div>
                <div className="mt-4 text-cyan-400">
                  &#10003; Registry ........... running on :3001
                </div>
                <div className="text-cyan-400">
                  &#10003; Gateway ............ running on :3002
                </div>
                <div className="text-cyan-400">
                  &#10003; BAP ................ running on :3004
                </div>
                <div className="text-cyan-400">
                  &#10003; BPP ................ running on :3005
                </div>
                <div className="text-cyan-400">
                  &#10003; Admin Dashboard .... running on :3003
                </div>
                <div className="text-cyan-400">
                  &#10003; Documentation ...... running on :3000
                </div>
                <div className="mt-2 text-green-400 font-semibold">
                  Network ready. 25 subscribers registered, 500 orders simulated.
                </div>
              </div>
            </div>

            {/* After terminal */}
            <div className="mt-8 text-center">
              <a
                href="/docs/onboarding"
                className="inline-flex items-center gap-2 text-primary-600 font-semibold hover:text-primary-800 transition-colors"
              >
                Read the full Getting Started guide
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          CTA SECTION
          ════════════════════════════════════════════════════════ */}
      <section className="py-20 sm:py-28 bg-gray-950">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            Ready to Build on ONDC?
          </h2>
          <p className="text-lg text-gray-400 mb-10 max-w-2xl mx-auto">
            Start developing against a protocol-identical network today. When
            you&apos;re ready for production, switch to the government ONDC network
            by changing a few environment variables &mdash; zero code changes.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="/docs/onboarding"
              className="inline-flex items-center gap-2 px-8 py-4 text-base font-semibold text-gray-900 bg-white rounded-xl hover:bg-gray-100 shadow-xl transition-all"
            >
              Start Building
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </a>
            <a
              href="/docs/migration"
              className="inline-flex items-center gap-2 px-8 py-4 text-base font-semibold text-white border-2 border-gray-700 rounded-xl hover:border-gray-500 transition-all"
            >
              Migration Guide
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
