'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatRelativeTime, truncate, orderStatusCategory } from '@/lib/format';
import type { Order } from '@/lib/bpp-client';

interface OrdersClientProps {
  orders: Order[];
  locale: string;
  translations: {
    new: string;
    accepted: string;
    in_progress: string;
    completed: string;
    cancelled: string;
    order_id: string;
    items: string;
    total: string;
    buyer_city: string;
    timestamp: string;
    status: string;
    accept: string;
    reject: string;
    pack: string;
    ship: string;
    deliver: string;
    cancel: string;
    no_orders: string;
  };
}

const tabs = ['new', 'accepted', 'in_progress', 'completed', 'cancelled'] as const;

const actionMap: Record<string, string> = {
  accept: 'Accepted',
  reject: 'Cancelled',
  pack: 'Packed',
  ship: 'Shipped',
  deliver: 'Delivered',
  cancel: 'Cancelled',
};

export default function OrdersClient({ orders, locale, translations: t }: OrdersClientProps) {
  const [activeTab, setActiveTab] = useState<typeof tabs[number]>('new');

  const filtered = orders.filter((o) => orderStatusCategory(o.latest_action) === activeTab);

  async function handleAction(action: string, order: Order) {
    const newStatus = actionMap[action];
    if (!newStatus) return;

    await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: order.transaction_id,
        status: newStatus,
        bap_id: order.bap_id || '',
        bap_uri: '',
        transaction_id: order.transaction_id,
        domain: order.domain,
      }),
    });
  }

  return (
    <>
      {/* Status Tabs */}
      <nav className="flex gap-1 border-b border-surface-border pb-0" role="tablist" aria-label="Order status filter">
        {tabs.map((tab) => {
          const count = orders.filter((o) => orderStatusCategory(o.latest_action) === tab).length;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors min-h-[44px] ${
                activeTab === tab
                  ? 'border-saffron-400 text-saffron-400'
                  : 'border-transparent text-ash-400 hover:text-ash-300'
              }`}
            >
              {t[tab]} ({count})
            </button>
          );
        })}
      </nav>

      {/* Order List */}
      {filtered.length === 0 ? (
        <div className="card text-center py-12 text-ash-500">
          <svg className="w-10 h-10 text-ash-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
          <p>{t.no_orders}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => {
            const category = orderStatusCategory(order.latest_action);
            return (
              <article key={order.transaction_id} className="card" aria-label={`${t.order_id}: ${truncate(order.transaction_id, 12)}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <Link href={`/orders/${order.transaction_id}`} className="text-xs font-mono text-saffron-400/70 hover:underline">
                      {truncate(order.transaction_id, 20)}
                    </Link>
                    <p className="text-sm text-white font-medium mt-1">
                      {order.actions.length} {locale === 'hi' ? 'कार्रवाइयां' : 'actions'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-ash-400">{order.domain || '-'}</p>
                    <time className="text-xs text-ash-500" dateTime={order.created_at || undefined}>
                      {formatRelativeTime(order.created_at, locale)}
                    </time>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 flex-wrap" role="group" aria-label="Order actions">
                  {category === 'new' && (
                    <>
                      <button type="button" className="btn-success text-xs" onClick={() => handleAction('accept', order)}>{t.accept}</button>
                      <button type="button" className="btn-danger text-xs" onClick={() => handleAction('reject', order)}>{t.reject}</button>
                    </>
                  )}
                  {category === 'accepted' && (
                    <button type="button" className="btn-primary text-xs" onClick={() => handleAction('pack', order)}>{t.pack}</button>
                  )}
                  {(category === 'in_progress' && order.latest_action === 'on_status') && (
                    <button type="button" className="btn-primary text-xs" onClick={() => handleAction('ship', order)}>{t.ship}</button>
                  )}
                  {category !== 'completed' && category !== 'cancelled' && (
                    <button type="button" className="btn-danger text-xs" onClick={() => handleAction('cancel', order)}>{t.cancel}</button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
