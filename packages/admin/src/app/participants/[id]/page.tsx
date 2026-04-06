import { eq, sql } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import db from '@/lib/db';
import { subscribers, transactions } from '@ondc/shared';
import ParticipantActions from '../actions';
import CopyButton from './copy-button';
import CredentialsPanel from './credentials-panel';
import EditPanel from './edit-panel';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
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

function connectionStatus(lastTxDate: Date | null): { label: string; badge: string } {
  if (!lastTxDate) return { label: 'Inactive', badge: 'badge-gray' };
  const now = Date.now();
  const diff = now - lastTxDate.getTime();
  const oneDay = 24 * 60 * 60 * 1000;
  const sevenDays = 7 * oneDay;
  if (diff < oneDay) return { label: 'Active', badge: 'badge-green' };
  if (diff < sevenDays) return { label: 'Idle', badge: 'badge-yellow' };
  return { label: 'Inactive', badge: 'badge-gray' };
}

export default async function ParticipantDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [participant] = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.id, id))
    .limit(1);

  if (!participant) {
    notFound();
  }

  // Get recent transactions and stats in parallel
  const [recentTx, [txStats]] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(
        sql`${transactions.bap_id} = ${participant.subscriber_id} OR ${transactions.bpp_id} = ${participant.subscriber_id}`,
      )
      .orderBy(sql`created_at DESC`)
      .limit(20),
    db
      .select({
        total: sql<number>`count(*)::int`,
        success_count: sql<number>`count(*) FILTER (WHERE ${transactions.status} IN ('ACK', 'CALLBACK_RECEIVED'))::int`,
        last_seen: sql<string>`max(${transactions.created_at})`,
      })
      .from(transactions)
      .where(
        sql`${transactions.bap_id} = ${participant.subscriber_id} OR ${transactions.bpp_id} = ${participant.subscriber_id}`,
      ),
  ]);

  const lastSeen = txStats?.last_seen ? new Date(txStats.last_seen) : null;
  const connStatus = connectionStatus(lastSeen);
  const successRate = txStats?.total > 0 ? Math.round((txStats.success_count / txStats.total) * 100) : 0;

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

      {/* Subscriber Info + Org Details */}
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

        {/* Organization Details */}
        <div className="card">
          <h3 className="card-header">Organization Details</h3>
          <dl className="space-y-3">
            {[
              ['Organization Name', participant.org_name ?? '-'],
              ['GST Number', participant.gst_number ?? '-'],
              ['PAN Number', participant.pan_number ?? '-'],
              ['Signatory Name', participant.signatory_name ?? '-'],
              ['Contact Email', participant.contact_email ?? '-'],
              ['Contact Phone', participant.contact_phone ?? '-'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <dt className="text-sm text-ash-500">{label}</dt>
                <dd className="text-sm font-medium text-white text-right max-w-[60%] break-all">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* Connection Status */}
      <div className="card">
        <h3 className="card-header">Connection Status</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-ash-500 mb-1">Status</p>
            <span className={connStatus.badge}>{connStatus.label}</span>
          </div>
          <div>
            <p className="text-xs text-ash-500 mb-1">Last Seen</p>
            <p className="text-sm font-medium text-white">
              {lastSeen ? lastSeen.toLocaleString() : 'Never'}
            </p>
          </div>
          <div>
            <p className="text-xs text-ash-500 mb-1">Total Transactions</p>
            <p className="text-sm font-medium text-white">{txStats?.total ?? 0}</p>
          </div>
          <div>
            <p className="text-xs text-ash-500 mb-1">Success Rate</p>
            <p className="text-sm font-medium text-white">{successRate}%</p>
          </div>
        </div>
      </div>

      {/* Edit Panel */}
      <EditPanel
        id={participant.id}
        initial={{
          org_name: participant.org_name,
          contact_email: participant.contact_email,
          contact_phone: participant.contact_phone,
          webhook_url: participant.webhook_url,
          subscriber_url: participant.subscriber_url,
        }}
      />

      {/* Credentials Panel */}
      <CredentialsPanel id={participant.id} />

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
