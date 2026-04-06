import { cookies } from 'next/headers';
import { getMessages } from '@/lib/i18n';
import OrdersClient from './orders-client';

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

export default async function OrdersPage() {
  const cookieStore = await cookies();
  const locale = cookieStore.get('locale')?.value || 'en';
  const t = getMessages(locale);
  const data = await fetchOrders();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{t.orders.title}</h1>
        <p className="page-subtitle">{data.total} {locale === 'hi' ? 'कुल ऑर्डर' : 'total orders'}</p>
      </div>

      <OrdersClient
        orders={data.orders || []}
        locale={locale}
        translations={t.orders}
      />
    </div>
  );
}
