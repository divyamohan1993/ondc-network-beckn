import { formatINR, formatDate } from '@/lib/format';

interface Settlement {
  payout_id: string;
  amount: number;
  status: 'pending' | 'processed' | 'failed';
  date: string;
  bank_account: string;
}

interface SettlementTableProps {
  settlements: Settlement[];
  locale: string;
  translations: {
    payout_id: string;
    amount: string;
    status: string;
    date: string;
    bank_account: string;
    pending: string;
    processed: string;
    failed: string;
    no_settlements: string;
  };
}

const statusBadge: Record<string, string> = {
  pending: 'badge-yellow',
  processed: 'badge-green',
  failed: 'badge-red',
};

export default function SettlementTable({ settlements, locale, translations: t }: SettlementTableProps) {
  if (settlements.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-ash-500">{t.no_settlements}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-surface-border">
      <table className="table" role="table" aria-label={t.payout_id}>
        <thead>
          <tr>
            <th scope="col">{t.payout_id}</th>
            <th scope="col">{t.amount}</th>
            <th scope="col">{t.status}</th>
            <th scope="col">{t.date}</th>
            <th scope="col">{t.bank_account}</th>
          </tr>
        </thead>
        <tbody>
          {settlements.map((s) => (
            <tr key={s.payout_id}>
              <td className="font-mono text-xs text-saffron-400/70">{s.payout_id}</td>
              <td className="font-semibold text-white">{formatINR(s.amount, locale)}</td>
              <td><span className={statusBadge[s.status] || 'badge-gray'}>{t[s.status]}</span></td>
              <td className="text-xs text-ash-400">
                <time dateTime={s.date}>{formatDate(s.date, locale)}</time>
              </td>
              <td className="text-xs text-ash-400">{s.bank_account}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
