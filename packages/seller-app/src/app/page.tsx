import { cookies } from 'next/headers';
import Link from 'next/link';
import DashboardCard from '@/components/DashboardCard';
import StockAlert from '@/components/StockAlert';
import en from '@/i18n/en.json';
import hi from '@/i18n/hi.json';
import { formatINR, formatRelativeTime, truncate, orderStatusLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';

const BPP_URL = process.env.NEXT_PUBLIC_BPP_URL || 'http://bpp:3005';

async function fetchOrders() {
  try {
    const res = await fetch(`${BPP_URL}/api/orders`, { cache: 'no-store' });
    if (!res.ok) return { orders: [], total: 0 };
    return res.json();
  } catch {
    return { orders: [], total: 0 };
  }
}

async function fetchLowStock() {
  try {
    const res = await fetch(`${BPP_URL}/api/inventory/low-stock`, { cache: 'no-store' });
    if (!res.ok) return { items: [], total: 0 };
    return res.json();
  } catch {
    return { items: [], total: 0 };
  }
}

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const locale = cookieStore.get('locale')?.value || 'en';
  const t = locale === 'hi' ? hi : en;

  const [ordersData, lowStockData] = await Promise.all([fetchOrders(), fetchLowStock()]);
  const orders = ordersData.orders || [];
  const lowStockItems = lowStockData.items || [];

  const today = new Date().toISOString().slice(0, 10);
  const todayOrders = orders.filter((o: { created_at: string | null }) =>
    o.created_at && o.created_at.slice(0, 10) === today,
  );
  const pendingOrders = orders.filter((o: { latest_action: string }) =>
    ['confirm', 'select', 'init', 'search'].includes(o.latest_action),
  );

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="page-title">
            {t.dashboard.greeting},{' '}
            <span className="text-gradient-saffron">{t.dashboard.title}</span>
          </h1>
          <p className="page-subtitle">{locale === 'hi' ? 'आपकी दुकान का दैनिक अवलोकन' : 'Daily overview of your shop'}</p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-up" style={{ animationFillMode: 'backwards' }}>
        <DashboardCard
          label={t.dashboard.orders_today}
          value={todayOrders.length}
          color="saffron"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
            </svg>
          }
        />
        <DashboardCard
          label={t.dashboard.revenue_today}
          value={formatINR(0, locale)}
          color="teal"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <DashboardCard
          label={t.dashboard.pending_orders}
          value={pendingOrders.length}
          color="gold"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <DashboardCard
          label={t.dashboard.low_stock_items}
          value={lowStockItems.length}
          color="ember"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          }
        />
      </div>

      {/* Low Stock Alert */}
      <StockAlert
        count={lowStockItems.length}
        message={t.dashboard.low_stock_message.replace('{count, plural, =1 {1 product is} other {# products are}}', `${lowStockItems.length} ${locale === 'hi' ? 'उत्पादों का' : lowStockItems.length === 1 ? 'product is' : 'products are'}`)}
        locale={locale}
      />

      {/* Quick Actions */}
      <div className="flex gap-3">
        <Link href="/catalog/new" className="btn-primary">
          {t.dashboard.add_product}
        </Link>
        <Link href="/orders" className="btn-secondary">
          {t.dashboard.view_orders}
        </Link>
      </div>

      {/* Recent Orders */}
      <section className="card animate-fade-up delay-200" style={{ animationFillMode: 'backwards' }} aria-label={t.dashboard.recent_orders}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="card-header mb-0">{t.dashboard.recent_orders}</h2>
          <Link href="/orders" className="text-[13px] text-saffron-400 hover:text-saffron-300 font-medium transition-colors">
            {t.dashboard.view_orders} &rarr;
          </Link>
        </div>

        {orders.length === 0 ? (
          <div className="text-center py-12 text-ash-500">
            <svg className="w-10 h-10 text-ash-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
            <p>{t.dashboard.no_orders}</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6 -mb-6 rounded-b-2xl">
            <table className="table" role="table" aria-label={t.dashboard.recent_orders}>
              <thead>
                <tr>
                  <th scope="col">{t.orders.order_id}</th>
                  <th scope="col">{t.orders.status}</th>
                  <th scope="col">{t.orders.buyer_city}</th>
                  <th scope="col">{t.orders.timestamp}</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 10).map((order: { transaction_id: string; latest_action: string; bap_id: string | null; created_at: string | null; domain: string | null }) => (
                  <tr key={order.transaction_id}>
                    <td className="font-mono text-xs text-saffron-400/70">
                      <Link href={`/orders/${order.transaction_id}`} className="hover:underline">
                        {truncate(order.transaction_id, 16)}
                      </Link>
                    </td>
                    <td><span className="badge-blue">{orderStatusLabel(order.latest_action)}</span></td>
                    <td className="text-xs text-ash-400">{order.domain || '-'}</td>
                    <td className="text-xs text-ash-500">
                      <time dateTime={order.created_at || undefined}>{formatRelativeTime(order.created_at, locale)}</time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
