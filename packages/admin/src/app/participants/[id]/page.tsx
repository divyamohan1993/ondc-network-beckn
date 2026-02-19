import { eq, sql } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import db from '@/lib/db';
import { subscribers, transactions } from '@ondc/shared';
import ParticipantActions from '../actions';
import CopyButton from './copy-button';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

function statusBadge(status: string | null) {
  const map: Record<string, string> = {
    SUBSCRIBED: 'badge-green',
    INITIATED: 'badge-blue',
    UNDER_SUBSCRIPTION: 'badge-yellow',
    SUSPENDED: 'badge-red',
    REVOKED: 'badge-gray',
  };
  return map[status ?? ''] ?? 'badge-gray';
}

function txStatusBadge(status: string | null) {
  const map: Record<string, string> = {
    ACK: 'badge-green',
    CALLBACK_RECEIVED: 'badge-green',
    SENT: 'badge-blue',
    NACK: 'badge-red',
    ERROR: 'badge-red',
    TIMEOUT: 'badge-yellow',
  };
  return map[status ?? ''] ?? 'badge-gray';
}

function maskKey(key: string) {
  if (key.length <= 8) return key;
  return key.slice(0, 8) + '...';
}

export default async function ParticipantDetailPage({ params }: PageProps) {
  const [participant] = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.id, params.id))
    .limit(1);

  if (!participant) {
    notFound();
  }

  // Get recent transactions for this participant
  const recentTx = await db
    .select()
    .from(transactions)
    .where(
      sql`${transactions.bap_id} = ${participant.subscriber_id} OR ${transactions.bpp_id} = ${participant.subscriber_id}`,
    )
    .orderBy(sql`created_at DESC`)
    .limit(20);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-ash-500">
        <Link href="/participants" className="text-saffron-400 hover:text-saffron-300">Participants</Link>
        <span>/</span>
        <span className="text-white font-medium">{participant.subscriber_id}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title font-display text-white">{participant.subscriber_id}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className="badge-blue">{participant.type}</span>
            <span className={statusBadge(participant.status)}>{participant.status}</span>
            {participant.is_simulated && (
              <span className="badge-gray">Simulated</span>
            )}
          </div>
        </div>
        <ParticipantActions id={participant.id} currentStatus={participant.status} />
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Subscriber Info */}
        <div className="card">
          <h3 className="card-header">Subscriber Information</h3>
          <dl className="space-y-3">
            {[
              ['Subscriber ID', participant.subscriber_id],
              ['URL', participant.subscriber_url],
              ['Type', participant.type],
              ['Domain', participant.domain ?? '-'],
              ['City', participant.city ?? '-'],
              ['Webhook URL', participant.webhook_url ?? '-'],
              ['Unique Key ID', participant.unique_key_id],
              ['Valid From', participant.valid_from ? new Date(participant.valid_from).toLocaleString() : '-'],
              ['Valid Until', participant.valid_until ? new Date(participant.valid_until).toLocaleString() : '-'],
              ['Created', participant.created_at ? new Date(participant.created_at).toLocaleString() : '-'],
              ['Updated', participant.updated_at ? new Date(participant.updated_at).toLocaleString() : '-'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <dt className="text-sm text-ash-500">{label}</dt>
                <dd className="text-sm font-medium text-white text-right max-w-[60%] break-all">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Keys */}
        <div className="card">
          <h3 className="card-header">Public Keys</h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-ash-500 font-medium">Signing Public Key</label>
              <div className="mt-1 flex items-center gap-2">
                <code className="text-sm bg-white/10 px-3 py-2 rounded-lg flex-1 font-mono overflow-hidden text-ash-300">
                  {maskKey(participant.signing_public_key)}
                </code>
                <CopyButton text={participant.signing_public_key} />
              </div>
            </div>
            {participant.encr_public_key && (
              <div>
                <label className="text-xs text-ash-500 font-medium">Encryption Public Key</label>
                <div className="mt-1 flex items-center gap-2">
                  <code className="text-sm bg-white/10 px-3 py-2 rounded-lg flex-1 font-mono overflow-hidden text-ash-300">
                    {maskKey(participant.encr_public_key)}
                  </code>
                  <CopyButton text={participant.encr_public_key} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Transaction History */}
      <div className="card">
        <h3 className="card-header">Transaction History (Recent 20)</h3>
        <div className="overflow-x-auto -mx-6 -mb-6">
          <table className="table">
            <thead>
              <tr>
                <th>Transaction ID</th>
                <th>Action</th>
                <th>BAP</th>
                <th>BPP</th>
                <th>Domain</th>
                <th>Status</th>
                <th>Latency</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {recentTx.map((tx) => (
                <tr key={tx.id}>
                  <td className="font-mono text-xs">{tx.transaction_id.slice(0, 12)}...</td>
                  <td className="font-medium">{tx.action}</td>
                  <td className="text-xs">{tx.bap_id ?? '-'}</td>
                  <td className="text-xs">{tx.bpp_id ?? '-'}</td>
                  <td>{tx.domain ?? '-'}</td>
                  <td>
                    <span className={txStatusBadge(tx.status)}>{tx.status}</span>
                  </td>
                  <td>{tx.latency_ms ? `${tx.latency_ms}ms` : '-'}</td>
                  <td className="text-xs text-ash-500">
                    {tx.created_at ? new Date(tx.created_at).toLocaleString() : '-'}
                  </td>
                </tr>
              ))}
              {recentTx.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-ash-600">
                    No transactions found for this participant
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
