import { cookies } from 'next/headers';
import Link from 'next/link';
import { getMessages } from '@/lib/i18n';
import OrderTimeline from '@/components/OrderTimeline';
import { formatRelativeTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

const BPP_URL = process.env.NEXT_PUBLIC_BPP_URL || 'http://bpp:3005';

async function fetchOrder(transactionId: string) {
  try {
    const res = await fetch(`${BPP_URL}/api/orders`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    const orders = data.orders || [];
    return orders.find((o: { transaction_id: string }) => o.transaction_id === transactionId) || null;
  } catch {
    return null;
  }
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const locale = cookieStore.get('locale')?.value || 'en';
  const t = getMessages(locale);
  const order = await fetchOrder(id);

  if (!order) {
    return (
      <div className="space-y-6">
        <Link href="/orders" className="text-sm text-saffron-400 hover:underline">&larr; {t.app.back}</Link>
        <div className="card text-center py-12 text-ash-500">
          <p>{locale === 'hi' ? 'ऑर्डर नहीं मिला' : 'Order not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Link href="/orders" className="text-sm text-saffron-400 hover:underline">&larr; {t.app.back}</Link>

      <div>
        <h1 className="page-title">{t.orders.order_id}</h1>
        <p className="page-subtitle font-mono">{order.transaction_id}</p>
      </div>

      {/* Order Info */}
      <div className="card">
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-xs font-bold uppercase tracking-widest text-ash-500">{t.orders.status}</dt>
            <dd className="text-sm text-white font-medium mt-1 capitalize">{order.latest_action?.replace(/_/g, ' ')}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-widest text-ash-500">{locale === 'hi' ? 'डोमेन' : 'Domain'}</dt>
            <dd className="text-sm text-white font-medium mt-1">{order.domain || '-'}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-widest text-ash-500">{locale === 'hi' ? 'खरीदार' : 'Buyer (BAP)'}</dt>
            <dd className="text-sm text-ash-300 mt-1">{order.bap_id || '-'}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-widest text-ash-500">{t.orders.timestamp}</dt>
            <dd className="text-sm text-ash-300 mt-1">
              <time dateTime={order.created_at || undefined}>{formatRelativeTime(order.created_at, locale)}</time>
            </dd>
          </div>
        </dl>
      </div>

      {/* Timeline */}
      <OrderTimeline
        events={order.actions.map((a: { action: string; status: string | null; created_at: string | null }) => ({
          action: a.action,
          status: a.status,
          timestamp: a.created_at,
        }))}
        locale={locale}
        title={t.orders.timeline}
      />
    </div>
  );
}
