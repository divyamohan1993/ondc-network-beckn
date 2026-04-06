import { cookies } from 'next/headers';
import en from '@/i18n/en.json';
import hi from '@/i18n/hi.json';
import SettlementTable from '@/components/SettlementTable';
import DashboardCard from '@/components/DashboardCard';
import { formatINR } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function SettlementsPage() {
  const cookieStore = await cookies();
  const locale = cookieStore.get('locale')?.value || 'en';
  const t = locale === 'hi' ? hi : en;

  // Settlements will come from BPP API when implemented
  const settlements: Array<{
    payout_id: string;
    amount: number;
    status: 'pending' | 'processed' | 'failed';
    date: string;
    bank_account: string;
  }> = [];

  const totalEarnings = settlements.reduce((sum, s) => sum + (s.status === 'processed' ? s.amount : 0), 0);
  const pendingAmount = settlements.reduce((sum, s) => sum + (s.status === 'pending' ? s.amount : 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{t.settlements.title}</h1>
        <p className="page-subtitle">{locale === 'hi' ? 'आपका भुगतान इतिहास' : 'Your payout history'}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <DashboardCard
          label={t.settlements.total_earnings}
          value={formatINR(totalEarnings, locale)}
          color="teal"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <DashboardCard
          label={t.settlements.pending_amount}
          value={formatINR(pendingAmount, locale)}
          color="gold"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <DashboardCard
          label={t.settlements.last_payout}
          value={formatINR(0, locale)}
          color="saffron"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
            </svg>
          }
        />
      </div>

      <SettlementTable
        settlements={settlements}
        locale={locale}
        translations={t.settlements}
      />
    </div>
  );
}
