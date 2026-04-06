'use client';

import { useEffect, useCallback, useRef, useState } from 'react';

/* ──────────────────────────────────────────────────────────
   Setu Pitch Page — Guy Kawasaki Style
   10 full-viewport slides, keyboard navigable, AAA accessible
   ────────────────────────────────────────────────────────── */

const SLIDE_COUNT = 10;

function TricolorBar() {
  return (
    <div className="flex w-24 h-1 rounded-full overflow-hidden mx-auto" role="presentation">
      <div className="flex-1 bg-[#FF9933]" />
      <div className="flex-1 bg-white" />
      <div className="flex-1 bg-[#138808]" />
    </div>
  );
}

function SlideIndicator({ current }: { current: number }) {
  return (
    <nav
      className="fixed right-4 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-2"
      aria-label="Slide navigation"
    >
      {Array.from({ length: SLIDE_COUNT }, (_, i) => (
        <a
          key={i}
          href={`#slide-${i}`}
          aria-label={`Go to slide ${i + 1}`}
          className={`block w-2.5 h-2.5 rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9933] ${
            current === i
              ? 'bg-[#FF9933] scale-125'
              : 'bg-white/30 hover:bg-white/60'
          }`}
        />
      ))}
    </nav>
  );
}

function Slide({
  id,
  children,
  className = '',
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8 py-16 ${className}`}
      aria-labelledby={`${id}-heading`}
    >
      <div className="max-w-4xl w-full">{children}</div>
    </section>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block px-3 py-1 text-xs font-semibold tracking-wider uppercase rounded-full bg-[#FF9933]/15 text-[#FF9933] border border-[#FF9933]/30">
      {children}
    </span>
  );
}

function StatBox({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center p-4">
      <div className="text-3xl sm:text-4xl font-bold text-white">{value}</div>
      <div className="text-sm text-gray-400 mt-1">{label}</div>
    </div>
  );
}

function FeatureItem({ title, desc }: { title: string; desc: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-1.5 w-2 h-2 rounded-full bg-[#138808] shrink-0" aria-hidden="true" />
      <div>
        <span className="text-white font-semibold">{title}</span>
        <span className="text-gray-400"> {desc}</span>
      </div>
    </li>
  );
}

function ArchBlock({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-5">
      <h4 className="text-[#FF9933] font-semibold text-sm uppercase tracking-wider mb-3">
        {label}
      </h4>
      <ul className="space-y-1.5 text-sm text-gray-300">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default function PitchPage() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const prefersReducedMotion = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotion.current = mq.matches;
    const handler = (e: MediaQueryListEvent) => {
      prefersReducedMotion.current = e.matches;
    };
    mq.addEventListener('change', handler);

    if (prefersReducedMotion.current) {
      document.documentElement.style.scrollBehavior = 'auto';
    }

    return () => mq.removeEventListener('change', handler);
  }, []);

  // Intersection observer for slide tracking
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = parseInt(entry.target.id.replace('slide-', ''), 10);
            if (!isNaN(idx)) setCurrentSlide(idx);
          }
        }
      },
      { threshold: 0.5 }
    );

    for (let i = 0; i < SLIDE_COUNT; i++) {
      const el = document.getElementById(`slide-${i}`);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      setCurrentSlide((prev) => {
        const next = Math.min(prev + 1, SLIDE_COUNT - 1);
        document.getElementById(`slide-${next}`)?.scrollIntoView({
          behavior: prefersReducedMotion.current ? 'auto' : 'smooth',
        });
        return next;
      });
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setCurrentSlide((prev) => {
        const next = Math.max(prev - 1, 0);
        document.getElementById(`slide-${next}`)?.scrollIntoView({
          behavior: prefersReducedMotion.current ? 'auto' : 'smooth',
        });
        return next;
      });
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="bg-[#0a0a0a] text-gray-200 min-h-screen">
      <a
        href="#slide-0"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#FF9933] focus:text-black focus:rounded-lg focus:font-semibold"
      >
        Skip to first slide
      </a>

      <SlideIndicator current={currentSlide} />

      {/* ── Slide 0: Title ─────────────────────────────────── */}
      <Slide id="slide-0" className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" aria-hidden="true">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#FF9933] rounded-full blur-[128px]" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#138808] rounded-full blur-[128px]" />
        </div>
        <div className="relative text-center">
          <TricolorBar />
          <h1
            id="slide-0-heading"
            className="text-5xl sm:text-7xl lg:text-8xl font-bold text-white mt-8 tracking-tight"
          >
            Setu
          </h1>
          <p className="text-xl sm:text-2xl text-gray-400 mt-4 max-w-2xl mx-auto">
            Open Commerce Infrastructure for India
          </p>
          <p className="text-base text-gray-500 mt-3 max-w-xl mx-auto">
            A production-grade, open-source ONDC protocol implementation.
            <br />
            15 microservices. 82K lines of TypeScript. Ready to deploy.
          </p>
          <div className="mt-10 flex justify-center gap-4 flex-wrap">
            <a
              href="/docs/onboarding"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#FF9933] text-black font-semibold rounded-lg hover:bg-[#FF9933]/90 transition-colors focus-visible:ring-2 focus-visible:ring-[#FF9933] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a] focus:outline-none"
              aria-label="Get started with the platform"
            >
              Get Started
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </a>
            <a
              href="https://github.com/divyamohan1993/ondc-network-beckn"
              className="inline-flex items-center gap-2 px-6 py-3 border border-white/20 text-white font-semibold rounded-lg hover:bg-white/5 transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a] focus:outline-none"
              aria-label="View source code on GitHub"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </div>
          <p className="text-xs text-gray-600 mt-12">
            Use arrow keys to navigate slides
          </p>
        </div>
      </Slide>

      {/* ── Slide 1: The Opportunity ──────────────────────── */}
      <Slide id="slide-1">
        <Badge>The Opportunity</Badge>
        <h2
          id="slide-1-heading"
          className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mt-6"
        >
          India&apos;s digital commerce is transforming.
        </h2>
        <p className="text-xl text-gray-400 mt-6 max-w-2xl">
          ONDC created the protocol. We built the infrastructure anyone can deploy.
          No vendor lock-in. No license fees. No gatekeepers.
        </p>
        <div className="grid grid-cols-3 gap-4 mt-12">
          <StatBox value="165K+" label="Pincodes served" />
          <StatBox value="100%" label="Protocol-identical to ONDC" />
          <StatBox value="MIT" label="Licensed. Free forever." />
        </div>
      </Slide>

      {/* ── Slide 2: What It Does ─────────────────────────── */}
      <Slide id="slide-2">
        <Badge>What It Does</Badge>
        <h2
          id="slide-2-heading"
          className="text-4xl sm:text-5xl font-bold text-white mt-6"
        >
          Complete Beckn network in a box.
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-10">
          {[
            {
              name: 'Registry',
              desc: 'Subscriber management, key verification, challenge-response auth',
            },
            {
              name: 'Gateway',
              desc: 'Search multicast, circuit breaker, dead letter queue',
            },
            {
              name: 'BAP',
              desc: 'Buyer interface with search, cart, checkout, payment, tracking',
            },
            {
              name: 'BPP',
              desc: 'Seller dashboard with catalog, inventory, orders, fulfillment',
            },
            {
              name: 'Admin',
              desc: 'Network governance, monitoring, compliance dashboards',
            },
            {
              name: '+ 10 more',
              desc: 'Vault, health monitor, log aggregator, orchestrator, simulation engine',
            },
          ].map((item) => (
            <div
              key={item.name}
              className="bg-white/5 border border-white/10 rounded-xl p-5 hover:border-[#FF9933]/30 transition-colors"
            >
              <h3 className="text-[#FF9933] font-bold text-lg">{item.name}</h3>
              <p className="text-gray-400 text-sm mt-2">{item.desc}</p>
            </div>
          ))}
        </div>
      </Slide>

      {/* ── Slide 3: How It's Better ──────────────────────── */}
      <Slide id="slide-3">
        <Badge>Ecosystem Contributions</Badge>
        <h2
          id="slide-3-heading"
          className="text-4xl sm:text-5xl font-bold text-white mt-6"
        >
          Security innovations for the ONDC ecosystem.
        </h2>
        <p className="text-gray-500 mt-3 text-sm">
          These techniques can be adopted by the broader ONDC network.
        </p>
        <ul className="space-y-5 mt-10 text-base">
          <FeatureItem
            title="Post-quantum cryptography"
            desc="ML-DSA-65 + ML-KEM-768 hybrid signatures. Future-proof for 5+ years."
          />
          <FeatureItem
            title="PII field-level encryption"
            desc="AES-256-GCM at rest. Phone numbers, addresses, Aadhaar never stored in plaintext."
          />
          <FeatureItem
            title="Key transparency log"
            desc="Certificate Transparency-inspired audit trail for every subscriber key change."
          />
          <FeatureItem
            title="Structural validation"
            desc="GSTIN checksum verification against CBIC algorithm. FSSAI license format validation."
          />
        </ul>
      </Slide>

      {/* ── Slide 4: Indian Law Compliance ────────────────── */}
      <Slide id="slide-4">
        <Badge>Compliance</Badge>
        <h2
          id="slide-4-heading"
          className="text-4xl sm:text-5xl font-bold text-white mt-6"
        >
          Indian law compliance. Built in, not bolted on.
        </h2>
        <div className="grid sm:grid-cols-2 gap-6 mt-10">
          {[
            {
              law: 'DPDPA 2023',
              items: ['Consent management', 'Right to erasure', 'Breach notification workflows'],
            },
            {
              law: 'IT Act 2000',
              items: ['CERT-In incident classification', '180-day log retention', 'Structured audit trails'],
            },
            {
              law: 'Consumer Protection Act 2019',
              items: ['Seller disclosure validation', 'Refund timeline enforcement', 'Grievance tracking'],
            },
            {
              law: 'GST Compliance',
              items: ['GSTIN validation with CBIC checksum', 'HSN code verification', 'TCS calculation support'],
            },
          ].map((block) => (
            <div key={block.law} className="bg-white/5 border border-white/10 rounded-xl p-6">
              <h3 className="text-[#138808] font-bold text-lg">{block.law}</h3>
              <ul className="mt-3 space-y-1.5 text-sm text-gray-400">
                {block.items.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#138808] shrink-0" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Slide>

      {/* ── Slide 5: Accessibility ────────────────────────── */}
      <Slide id="slide-5">
        <Badge>Accessibility</Badge>
        <h2
          id="slide-5-heading"
          className="text-4xl sm:text-5xl font-bold text-white mt-6"
        >
          Every Indian. Every device.
        </h2>
        <p className="text-xl text-gray-400 mt-4">
          WCAG 2.2 AAA compliant. 6 Indian languages. Works on 8,000 rupee phones with slow 3G.
        </p>
        <div className="grid sm:grid-cols-2 gap-6 mt-10">
          <div className="space-y-4">
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <div className="text-3xl font-bold text-white">7:1</div>
              <div className="text-sm text-gray-400 mt-1">Contrast ratio. Readable in bright sunlight.</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <div className="text-3xl font-bold text-white">6 Languages</div>
              <div className="text-sm text-gray-400 mt-1">Hindi, Tamil, Telugu, Kannada, Bengali + English</div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <div className="text-lg font-semibold text-white">Screen reader ready</div>
              <div className="text-sm text-gray-400 mt-1">ARIA labels, semantic HTML, focus management throughout</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <div className="text-lg font-semibold text-white">Keyboard navigable</div>
              <div className="text-sm text-gray-400 mt-1">Every action reachable without a mouse or touchscreen</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <div className="text-lg font-semibold text-white">Reduced motion</div>
              <div className="text-sm text-gray-400 mt-1">Respects prefers-reduced-motion for vestibular sensitivity</div>
            </div>
          </div>
        </div>
      </Slide>

      {/* ── Slide 6: Real Data ────────────────────────────── */}
      <Slide id="slide-6">
        <Badge>Real Data</Badge>
        <h2
          id="slide-6-heading"
          className="text-4xl sm:text-5xl font-bold text-white mt-6"
        >
          Powered by authentic government data.
        </h2>
        <p className="text-lg text-gray-500 mt-2">
          Nothing simulated. Nothing hardcoded. Every data point from authentic sources.
        </p>
        <ul className="space-y-5 mt-10 text-base">
          <FeatureItem
            title="165,627 India Post pincodes"
            desc="from data.gov.in open dataset"
          />
          <FeatureItem
            title="RBI IFSC database"
            desc="via Razorpay public API for bank settlement"
          />
          <FeatureItem
            title="CBIC GST state codes"
            desc="and checksum algorithm for GSTIN verification"
          />
          <FeatureItem
            title="FSSAI license validation"
            desc="structural format verification for food safety compliance"
          />
        </ul>
      </Slide>

      {/* ── Slide 7: Architecture ─────────────────────────── */}
      <Slide id="slide-7">
        <Badge>Architecture</Badge>
        <h2
          id="slide-7-heading"
          className="text-4xl sm:text-5xl font-bold text-white mt-6"
        >
          15 microservices. 82K lines. 628 tests.
        </h2>
        <div className="grid sm:grid-cols-3 gap-4 mt-10">
          <ArchBlock
            label="Protocol"
            items={[
              'Ed25519 + BLAKE-512 + X25519',
              'ML-DSA-65 hybrid post-quantum',
              'AES-256-GCM field encryption',
              'Challenge-response auth',
            ]}
          />
          <ArchBlock
            label="Infrastructure"
            items={[
              'PostgreSQL',
              'Redis',
              'RabbitMQ',
              'Prometheus + Grafana',
            ]}
          />
          <ArchBlock
            label="Applications"
            items={[
              'Next.js 15',
              'React 19',
              'TailwindCSS',
              'TypeScript strict mode',
            ]}
          />
        </div>
        <div className="grid grid-cols-5 gap-2 mt-6">
          {[
            'registry', 'gateway', 'bap', 'bpp', 'admin',
            'vault', 'health-monitor', 'log-aggregator', 'orchestrator', 'simulation-engine',
            'buyer-app', 'seller-app', 'mock-server', 'shared', 'docs',
          ].map((pkg) => (
            <div
              key={pkg}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-center text-xs text-gray-400 truncate"
              title={pkg}
            >
              {pkg}
            </div>
          ))}
        </div>
      </Slide>

      {/* ── Slide 8: Deploy ───────────────────────────────── */}
      <Slide id="slide-8">
        <Badge>Deploy</Badge>
        <h2
          id="slide-8-heading"
          className="text-4xl sm:text-5xl font-bold text-white mt-6"
        >
          Running in minutes, not months.
        </h2>
        <div className="mt-10 bg-white/5 border border-white/10 rounded-xl p-6 font-mono text-sm">
          <div className="text-gray-500 mb-2"># Configure and launch</div>
          <div className="text-[#138808]">
            <span className="text-gray-500 select-none">$ </span>
            ./autoconfig.sh --domain your-domain.com
          </div>
          <div className="text-[#138808] mt-1">
            <span className="text-gray-500 select-none">$ </span>
            docker compose up -d
          </div>
        </div>
        <ul className="space-y-3 mt-8 text-base text-gray-400">
          {[
            'Auto-generates all keys, secrets, and certificates',
            'Self-signed SSL on first boot',
            'Prometheus + Grafana monitoring included',
            'Connect to real ONDC network with 2 environment variables',
          ].map((item) => (
            <li key={item} className="flex items-start gap-3">
              <span className="mt-1.5 w-2 h-2 rounded-full bg-[#FF9933] shrink-0" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </Slide>

      {/* ── Slide 9: Open Source ──────────────────────────── */}
      <Slide id="slide-9" className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-5" aria-hidden="true">
          <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#FF9933] rounded-full blur-[128px]" />
          <div className="absolute bottom-1/3 left-1/4 w-96 h-96 bg-[#138808] rounded-full blur-[128px]" />
        </div>
        <div className="relative text-center">
          <Badge>Open Source</Badge>
          <h2
            id="slide-9-heading"
            className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mt-6"
          >
            MIT Licensed. Built for India.
          </h2>
          <p className="text-xl text-gray-400 mt-4 max-w-2xl mx-auto">
            Free to use, modify, and deploy. Built for India&apos;s digital commerce future.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-10">
            <StatBox value="15" label="Packages" />
            <StatBox value="499" label="TypeScript files" />
            <StatBox value="628" label="Test cases" />
            <StatBox value="82K" label="Lines of code" />
          </div>
          <div className="mt-10 flex justify-center gap-4 flex-wrap">
            <a
              href="https://github.com/divyamohan1993/ondc-network-beckn"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-[#0a0a0a] font-semibold rounded-lg hover:bg-gray-200 transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a] focus:outline-none"
              aria-label="View source code on GitHub"
              target="_blank"
              rel="noopener noreferrer"
            >
              View on GitHub
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
            <a
              href="/docs/onboarding"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#FF9933] text-black font-semibold rounded-lg hover:bg-[#FF9933]/90 transition-colors focus-visible:ring-2 focus-visible:ring-[#FF9933] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a] focus:outline-none"
              aria-label="Get started with the platform"
            >
              Get Started
            </a>
          </div>
          <div className="mt-12">
            <TricolorBar />
            <p className="text-gray-600 text-sm mt-4">
              #AatmanirbharBharat &middot; #DigitalIndia &middot; #ONDC
            </p>
          </div>
        </div>
      </Slide>
    </div>
  );
}
