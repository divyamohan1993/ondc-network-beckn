import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Documentation — ONDC Network Platform',
  description:
    'Complete developer documentation for the ONDC Network Platform. Guides, API reference, signing tutorials, and more.',
};

const sections = [
  {
    href: '/docs/onboarding',
    title: 'Getting Started',
    description:
      'Generate key pairs, register with the network, and make your first API call in under 10 minutes.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
      </svg>
    ),
    color: 'blue',
  },
  {
    href: '/docs/integration',
    title: 'Integration Guide',
    description:
      'Full code examples for Node.js and Python. Walk through the complete search, select, init, confirm flow.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
      </svg>
    ),
    color: 'green',
  },
  {
    href: '/docs/signing',
    title: 'Signing Tutorial',
    description:
      'Ed25519 + BLAKE-512 signing walkthrough. Build the Authorization header step by step with test vectors.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
      </svg>
    ),
    color: 'purple',
  },
  {
    href: '/docs/api',
    title: 'API Reference',
    description:
      'Complete endpoint documentation for Registry, Gateway, BAP, and BPP services with request/response examples.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
      </svg>
    ),
    color: 'amber',
  },
  {
    href: '/docs/domains',
    title: 'Domains',
    description:
      'All supported NIC2004 domain codes — water, food, agriculture, logistics, healthcare, retail, and more.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
    color: 'rose',
  },
  {
    href: '/docs/migration',
    title: 'Migration Guide',
    description:
      'Switch from this network to government ONDC with zero code changes. Only environment variables change.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
    color: 'teal',
  },
];

const colorMap: Record<string, { bg: string; text: string; border: string }> = {
  blue: { bg: 'bg-blue-100', text: 'text-blue-600', border: 'hover:border-blue-300' },
  green: { bg: 'bg-green-100', text: 'text-green-600', border: 'hover:border-green-300' },
  purple: { bg: 'bg-purple-100', text: 'text-purple-600', border: 'hover:border-purple-300' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-600', border: 'hover:border-amber-300' },
  rose: { bg: 'bg-rose-100', text: 'text-rose-600', border: 'hover:border-rose-300' },
  teal: { bg: 'bg-teal-100', text: 'text-teal-600', border: 'hover:border-teal-300' },
};

export default function DocsIndexPage() {
  return (
    <div className="doc-prose">
      <h1>Documentation</h1>

      <p className="text-lg text-gray-600 mb-8">
        Welcome to the ONDC Network Platform documentation. This guide covers
        everything you need to integrate with the network, from generating your
        first key pair to making production API calls.
      </p>

      <div className="callout-info flex gap-3 items-start">
        <svg className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
        <div>
          <p className="text-sm text-blue-800 font-semibold mb-1">New to ONDC?</p>
          <p className="text-sm text-blue-700 mb-0">
            Start with the{' '}
            <a href="/docs/onboarding" className="font-semibold underline">
              Getting Started
            </a>{' '}
            guide. It walks you through the entire setup process in 5 steps.
          </p>
        </div>
      </div>

      <h2>Documentation Sections</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 not-prose">
        {sections.map((section) => {
          const colors = colorMap[section.color];
          return (
            <a
              key={section.href}
              href={section.href}
              className={`block p-5 rounded-xl border border-gray-200 hover:shadow-md ${colors.border} transition-all group`}
            >
              <div
                className={`w-10 h-10 rounded-lg ${colors.bg} ${colors.text} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}
              >
                {section.icon}
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-1">
                {section.title}
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                {section.description}
              </p>
            </a>
          );
        })}
      </div>

      <h2>Platform Overview</h2>

      <p>
        The ONDC Network Platform is a self-hosted, protocol-identical
        implementation of the Beckn protocol as used by India&apos;s ONDC (Open
        Network for Digital Commerce). It provides:
      </p>

      <ul>
        <li>
          <strong>Registry</strong> &mdash; Subscriber management, key pair
          verification, and lookup services
        </li>
        <li>
          <strong>Gateway</strong> &mdash; Request routing and broadcast to
          matching BPPs based on domain, city, and catalog
        </li>
        <li>
          <strong>BAP (Buyer Application Platform)</strong> &mdash; Reference
          buyer-side implementation with simplified client API
        </li>
        <li>
          <strong>BPP (Seller Application Platform)</strong> &mdash; Reference
          seller-side implementation with catalog management
        </li>
        <li>
          <strong>Admin Dashboard</strong> &mdash; Network governance, subscriber
          approval, transaction monitoring, and analytics
        </li>
        <li>
          <strong>Documentation Portal</strong> &mdash; This site, with guides,
          API reference, and tutorials
        </li>
      </ul>

      <h2>Key Concepts</h2>

      <h3>Beckn Protocol</h3>
      <p>
        Beckn is an open protocol for decentralized commerce. It defines how
        buyer-side platforms (BAPs) discover and transact with seller-side
        platforms (BPPs) through a neutral registry and gateway. All
        communication uses signed HTTP requests with Ed25519 + BLAKE-512
        signatures.
      </p>

      <h3>Subscriber Types</h3>
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Role</th>
            <th>Examples</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code className="code-inline">BAP</code></td>
            <td>Buyer Application Platform</td>
            <td>Shopping apps, aggregators</td>
          </tr>
          <tr>
            <td><code className="code-inline">BPP</code></td>
            <td>Seller Application Platform</td>
            <td>Merchant apps, sellers</td>
          </tr>
          <tr>
            <td><code className="code-inline">BG</code></td>
            <td>Beckn Gateway</td>
            <td>Network routing layer</td>
          </tr>
          <tr>
            <td><code className="code-inline">BREG</code></td>
            <td>Beckn Registry</td>
            <td>Subscriber directory</td>
          </tr>
        </tbody>
      </table>

      <h3>Transaction Flow</h3>
      <p>
        A typical ONDC transaction follows this lifecycle:
      </p>
      <ol>
        <li>
          <strong>Search</strong> &mdash; BAP sends search request through the gateway
        </li>
        <li>
          <strong>Select</strong> &mdash; BAP selects specific items from BPP catalogs
        </li>
        <li>
          <strong>Init</strong> &mdash; BAP initializes the order with billing/shipping details
        </li>
        <li>
          <strong>Confirm</strong> &mdash; BAP confirms the order and triggers payment
        </li>
        <li>
          <strong>Status</strong> &mdash; Both parties track order fulfillment
        </li>
        <li>
          <strong>Track / Cancel / Update</strong> &mdash; Post-order operations
        </li>
      </ol>
    </div>
  );
}
