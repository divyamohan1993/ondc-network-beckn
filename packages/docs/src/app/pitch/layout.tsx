import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Setu — Open Commerce Infrastructure for India',
  description:
    'A production-grade, open-source ONDC protocol implementation. 15 microservices, post-quantum security, Indian law compliance, and WCAG 2.2 AAA accessibility.',
  keywords: [
    'ONDC',
    'Beckn',
    'open commerce',
    'India',
    'digital commerce',
    'open source',
    'post-quantum',
    'DPDPA',
    'accessibility',
  ],
  openGraph: {
    title: 'Setu — Open Commerce Infrastructure for India',
    description:
      'Production-grade open-source ONDC protocol implementation with post-quantum security and Indian law compliance.',
    type: 'website',
  },
};

export default function PitchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
