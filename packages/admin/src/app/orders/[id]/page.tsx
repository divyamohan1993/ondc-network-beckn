import { eq, sql } from 'drizzle-orm';
import db from '@/lib/db';
import { orders, orderStateTransitions } from '@ondc/shared';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

function stateBadge(state: string) {
  switch (state) {
    case 'CREATED': return 'badge-blue';
    case 'ACCEPTED': return 'badge-green';
    case 'IN_PROGRESS': return 'badge-yellow';
    case 'COMPLETED': return 'badge-green';
    case 'CANCELLED': return 'badge-red';
    case 'RETURNED': return 'badge-yellow';
    default: return 'badge-gray';
  }
}

export default async function OrderDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);

  if (!order) {
    notFound();
  }

  const transitions = await db
    .select()
    .from(orderStateTransitions)
    .where(eq(orderStateTransitions.order_id, order.order_id))
    .orderBy(sql`created_at DESC`);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-ash-500">
        <Link href="/orders" className="hover:text-saffron-400 transition-colors">Orders</Link>
        <span>/</span>
        <span className="text-white font-mono text-xs">{order.order_id}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title font-display">
            Order <span className="text-gradient-saffron">Details</span>
          </h1>
          <p className="page-subtitle font-mono">{order.order_id}</p>
        </div>
        <span className={`${stateBadge(order.state)} text-sm`}>{order.state}</span>
      </div>

      {/* Order Info Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="card-header">Order Information</h3>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-ash-500 text-sm">Order ID</dt>
              <dd className="text-white font-mono text-xs">{order.order_id}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ash-500 text-sm">Transaction ID</dt>
              <dd className="text-white font-mono text-xs">{order.transaction_id}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ash-500 text-sm">Domain</dt>
              <dd><span className="badge-blue text-[10px]">{order.domain}</span></dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ash-500 text-sm">City</dt>
              <dd className="text-white text-sm">{order.city}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ash-500 text-sm">Created</dt>
              <dd className="text-white text-sm">{new Date(order.created_at).toLocaleString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ash-500 text-sm">Updated</dt>
              <dd className="text-white text-sm">{new Date(order.updated_at).toLocaleString()}</dd>
            </div>
          </dl>
        </div>

        <div className="card">
          <h3 className="card-header">Participants</h3>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-ash-500 text-sm">BAP ID</dt>
              <dd className="text-white text-xs">{order.bap_id}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ash-500 text-sm">BPP ID</dt>
              <dd className="text-white text-xs">{order.bpp_id}</dd>
            </div>
            {order.cancellation_reason_code && (
              <div className="flex justify-between">
                <dt className="text-ash-500 text-sm">Cancellation Code</dt>
                <dd><span className="badge-red text-[10px]">{order.cancellation_reason_code}</span></dd>
              </div>
            )}
            {order.cancelled_by && (
              <div className="flex justify-between">
                <dt className="text-ash-500 text-sm">Cancelled By</dt>
                <dd className="text-white text-sm">{order.cancelled_by}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Order Data */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {order.provider != null && (
          <div className="card">
            <h3 className="card-header">Provider</h3>
            <pre className="text-xs text-ash-300 overflow-auto max-h-48 font-mono bg-surface-raised/50 rounded-lg p-3">
              {JSON.stringify(order.provider, null, 2)}
            </pre>
          </div>
        )}
        {order.items != null && (
          <div className="card">
            <h3 className="card-header">Items</h3>
            <pre className="text-xs text-ash-300 overflow-auto max-h-48 font-mono bg-surface-raised/50 rounded-lg p-3">
              {JSON.stringify(order.items, null, 2)}
            </pre>
          </div>
        )}
        {order.quote != null && (
          <div className="card">
            <h3 className="card-header">Quote</h3>
            <pre className="text-xs text-ash-300 overflow-auto max-h-48 font-mono bg-surface-raised/50 rounded-lg p-3">
              {JSON.stringify(order.quote, null, 2)}
            </pre>
          </div>
        )}
        {order.payment != null && (
          <div className="card">
            <h3 className="card-header">Payment</h3>
            <pre className="text-xs text-ash-300 overflow-auto max-h-48 font-mono bg-surface-raised/50 rounded-lg p-3">
              {JSON.stringify(order.payment, null, 2)}
            </pre>
          </div>
        )}
        {order.fulfillments != null && (
          <div className="card">
            <h3 className="card-header">Fulfillments</h3>
            <pre className="text-xs text-ash-300 overflow-auto max-h-48 font-mono bg-surface-raised/50 rounded-lg p-3">
              {JSON.stringify(order.fulfillments, null, 2)}
            </pre>
          </div>
        )}
        {order.billing != null && (
          <div className="card">
            <h3 className="card-header">Billing</h3>
            <pre className="text-xs text-ash-300 overflow-auto max-h-48 font-mono bg-surface-raised/50 rounded-lg p-3">
              {JSON.stringify(order.billing, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* State Transitions */}
      <div className="card">
        <h3 className="card-header">State Transition History</h3>
        {transitions.length > 0 ? (
          <div className="table-container !border-0 !bg-transparent">
            <table className="table">
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {transitions.map((t) => (
                  <tr key={t.id}>
                    <td>
                      {t.from_state ? (
                        <span className={`${stateBadge(t.from_state)} text-[10px]`}>{t.from_state}</span>
                      ) : (
                        <span className="text-ash-600">-</span>
                      )}
                    </td>
                    <td><span className={`${stateBadge(t.to_state)} text-[10px]`}>{t.to_state}</span></td>
                    <td className="text-xs">{t.action}</td>
                    <td className="text-xs text-ash-400">{t.actor}</td>
                    <td className="text-xs text-ash-500">{new Date(t.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-ash-600 text-sm py-4">No state transitions recorded</p>
        )}
      </div>
    </div>
  );
}
