import { cookies } from 'next/headers';
import en from '@/i18n/en.json';
import hi from '@/i18n/hi.json';
import DashboardCard from '@/components/DashboardCard';
import { formatINR } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const cookieStore = await cookies();
  const locale = cookieStore.get('locale')?.value || 'en';
  const t = locale === 'hi' ? hi : en;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{t.analytics.title}</h1>
        <p className="page-subtitle">{t.analytics.sales_overview}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <DashboardCard
          label={t.analytics.total_sales}
          value={formatINR(0, locale)}
          color="teal"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <DashboardCard
          label={t.analytics.total_orders}
          value={0}
          color="saffron"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
            </svg>
          }
        />
        <DashboardCard
          label={t.analytics.avg_order_value}
          value={formatINR(0, locale)}
          color="gold"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          }
        />
      </div>

      {/* Charts placeholder */}
      <section className="card" aria-label={t.analytics.revenue_chart}>
        <h2 className="card-header">{t.analytics.revenue_chart}</h2>
        <div className="h-64 flex items-center justify-center text-ash-500 border border-dashed border-surface-border rounded-xl">
          <p>{locale === 'hi' ? 'ऑर्डर आने पर चार्ट दिखाई देंगे' : 'Charts will appear when orders come in'}</p>
        </div>
      </section>

      <section className="card" aria-label={t.analytics.category_breakdown}>
        <h2 className="card-header">{t.analytics.category_breakdown}</h2>
        <div className="h-48 flex items-center justify-center text-ash-500 border border-dashed border-surface-border rounded-xl">
          <p>{locale === 'hi' ? 'श्रेणी डेटा उपलब्ध नहीं' : 'No category data available yet'}</p>
        </div>
      </section>
    </div>
  );
}
