'use client';

import { useEffect, useState } from 'react';
import {
  DomainTransactionsChart,
  ConversionFunnelChart,
  LatencyChart,
  TopParticipantsChart,
} from '@/components/charts';

interface AnalyticsData {
  domainTransactions: { data: Record<string, any>[]; domains: string[] };
  funnel: { action: string; count: number }[];
  latency: { action: string; avg_latency: number }[];
  topParticipants: { subscriber_id: string; count: number }[];
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/analytics')
      .then((res) => res.json())
      .then((d) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="page-title font-display"><span className="text-gradient-saffron">Analytics</span></h1>
          <p className="page-subtitle">Network analytics and insights</p>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center gap-3 text-ash-600">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading analytics...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title font-display"><span className="text-gradient-saffron">Analytics</span></h1>
        <p className="page-subtitle">Network analytics and insights</p>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DomainTransactionsChart
              data={data.domainTransactions.data}
              domains={data.domainTransactions.domains}
            />
            <ConversionFunnelChart data={data.funnel} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <LatencyChart data={data.latency} />
            <TopParticipantsChart data={data.topParticipants} />
          </div>
        </>
      )}

      {!data && (
        <div className="card text-center py-12 text-ash-600">
          No analytics data available
        </div>
      )}
    </div>
  );
}
